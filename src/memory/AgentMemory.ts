import { Client } from 'pg';
import { ulid } from 'ulid';
import {
  MemoryConfig,
  MemoryConfigSchema,
  Message,
  MessageSchema,
  Context,
  MemoryFilter,
  MemoryScope,
  AgentMemoryInterface,
  KnowledgeGraph,
  Pattern,
  DatabaseRow,
  CompressionConfig,
  CompressionResult,
  CompressionStats,
  MemorySummary,
  TimeWindow,
  EnhancedContext,
  ModelProviderConfig,
} from '../types/index.js';
import {
  MemoryError,
  DatabaseConnectionError,
  MemoryNotFoundError,
  ConversationNotFoundError,
  TokenLimitExceededError,
} from '../errors/index.js';
import { DatabaseMigrator } from '../db/migrations.js';
import { EmbeddingService } from '../embeddings/EmbeddingService.js';
import { CompressionService } from '../compression/CompressionService.js';
import { UniversalTokenizer } from '../tokenization/UniversalTokenizer.js';
import { logger } from '../utils/logger.js';

export class AgentMemory implements AgentMemoryInterface {
  private readonly client: Client;
  private readonly config: MemoryConfig;
  private readonly universalTokenizer: UniversalTokenizer;
  private readonly embeddingService = EmbeddingService.getInstance();
  private readonly compressionService: CompressionService;
  private isConnected = false;

  constructor(config: Partial<MemoryConfig>) {
    this.config = MemoryConfigSchema.parse(config);
    this.client = new Client({ connectionString: this.config.connectionString });
    this.compressionService = new CompressionService();

    // Initialize universal tokenizer with configured providers
    this.universalTokenizer = this.createTokenizer();

    logger.info(`AgentMemory initialized for agent: ${this.config.agent}`, {
      multiModelSupport: !!this.config.modelProviders?.length,
      providersCount: this.config.modelProviders?.length ?? 0,
      tokenStrategy: this.config.tokenCountingStrategy,
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;

      const migrator = new DatabaseMigrator(this.client);
      await migrator.migrate();

      const isValid = await migrator.validateSchema();
      if (!isValid) {
        throw new MemoryError('Database schema validation failed');
      }

      // Initialize embedding service (downloads model on first run)
      await this.embeddingService.initialize();

      // Cleanup expired memories only if tables exist
      try {
        await this.cleanupExpiredMemories();
      } catch (error) {
        // Ignore cleanup errors during initial setup
        logger.warn('Failed to cleanup expired memories:', (error as Error).message);
      }
    } catch (error) {
      throw new DatabaseConnectionError(error as Error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.end();
      this.isConnected = false;
    }
  }

  async remember(message: Message): Promise<string> {
    const validatedMessage = MessageSchema.parse(message);
    this.ensureConnected();

    const id = this.generateId();
    const tokenCount = this.countTokens(validatedMessage.content);

    if (tokenCount > this.config.maxTokens) {
      throw new TokenLimitExceededError(tokenCount, this.config.maxTokens);
    }

    const expiresAt = this.parseExpiration(validatedMessage.expires);

    // Generate embedding for semantic search
    const embedding = await this.embeddingService.generateEmbedding(validatedMessage.content);

    try {
      await this.client.query(
        `
        INSERT INTO ${this.config.tablePrefix}_memories (
          id, agent_id, conversation_id, content, role, metadata, 
          importance, embedding, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
        [
          id,
          this.config.agent,
          validatedMessage.conversation,
          validatedMessage.content,
          validatedMessage.role,
          JSON.stringify(validatedMessage.metadata ?? {}),
          validatedMessage.importance,
          JSON.stringify(embedding),
          validatedMessage.timestamp,
          expiresAt,
        ]
      );

      return id;
    } catch (error) {
      throw new MemoryError(`Failed to save memory: ${(error as Error).message}`);
    }
  }

  async recall(filter: MemoryFilter): Promise<Context> {
    this.ensureConnected();

    const whereClause = this.buildWhereClause(filter);
    const params = this.buildQueryParams(filter);

    try {
      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 ${whereClause}
        ORDER BY importance DESC, created_at DESC
        ${filter.limit ? `LIMIT ${filter.limit}` : ''}
        ${filter.offset ? `OFFSET ${filter.offset}` : ''}
      `,
        [this.config.agent, ...params]
      );

      const messages = rows.map(this.mapRowToMessage);
      const totalTokens = messages.reduce((sum, msg) => sum + this.countTokens(msg.content), 0);
      const relevanceScore = this.calculateRelevanceScore(messages);

      return {
        messages,
        totalTokens,
        relevanceScore,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw new MemoryError(`Failed to recall memories: ${(error as Error).message}`);
    }
  }

  async getHistory(conversation: string, limit = 50): Promise<Message[]> {
    this.ensureConnected();

    try {
      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 AND conversation_id = $2
        ORDER BY created_at ASC
        LIMIT $3
      `,
        [this.config.agent, conversation, limit]
      );

      return rows.map(this.mapRowToMessage);
    } catch (error) {
      throw new MemoryError(`Failed to get conversation history: ${(error as Error).message}`);
    }
  }

  async getRelevantContext(
    conversation: string,
    query: string,
    maxTokens: number
  ): Promise<Context> {
    this.ensureConnected();

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Use pgvector cosine similarity search
      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at,
          (embedding::vector <=> $3::vector) as distance
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 AND conversation_id = $2 AND embedding IS NOT NULL
        ORDER BY (embedding::vector <=> $3::vector) ASC, importance DESC
        LIMIT 50
      `,
        [this.config.agent, conversation, JSON.stringify(queryEmbedding)]
      );

      let totalTokens = 0;
      const relevantMessages: Message[] = [];
      const similarities: number[] = [];

      for (const row of rows) {
        const message = this.mapRowToMessage(row);
        const messageTokens = this.countTokens(message.content);

        if (totalTokens + messageTokens <= maxTokens) {
          relevantMessages.push(message);
          // Convert distance to similarity (1 - distance for cosine)
          similarities.push(1 - (row as DatabaseRow & { distance: number }).distance);
          totalTokens += messageTokens;
        } else {
          break;
        }
      }

      // Calculate weighted relevance score using similarity and importance
      const relevanceScore = this.calculateSemanticRelevanceScore(relevantMessages, similarities);

      return {
        messages: relevantMessages,
        totalTokens,
        relevanceScore,
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw new MemoryError(`Failed to get relevant context: ${(error as Error).message}`);
    }
  }

  async summarizeOldConversations(conversation: string): Promise<void> {
    this.ensureConnected();

    try {
      // Get old conversation memories (older than 7 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);

      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 AND conversation_id = $2 AND created_at < $3
        ORDER BY created_at ASC
      `,
        [this.config.agent, conversation, cutoffDate]
      );

      if (rows.length === 0) {
        logger.info(`No old memories found for conversation ${conversation}`);
        return;
      }

      const memories = rows.map(this.mapRowToMessage);
      const summary = this.compressionService.compressMemories(
        memories,
        this.config.agent,
        conversation
      );

      // Store the summary
      await this.storeSummary(summary);

      // Delete the original memories
      await this.client.query(
        `
        DELETE FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 AND conversation_id = $2 AND created_at < $3
      `,
        [this.config.agent, conversation, cutoffDate]
      );

      logger.info(`Summarized ${memories.length} memories for conversation ${conversation}`, {
        compressionRatio: summary.compressionRatio,
        tokensSaved: summary.originalTokenCount - summary.tokenCount,
      });
    } catch (error) {
      throw new MemoryError(`Failed to summarize conversation: ${(error as Error).message}`);
    }
  }

  shareMemoryBetweenAgents(_agentIds: string[], _scope: MemoryScope): Promise<void> {
    return Promise.reject(new MemoryError('Memory sharing not yet implemented'));
  }

  async searchMemories(query: string, filters?: MemoryFilter): Promise<Message[]> {
    this.ensureConnected();

    try {
      // Generate embedding for semantic search
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      const whereClause = filters ? this.buildWhereClause(filters) : '';
      const params = filters ? this.buildQueryParams(filters) : [];

      // Combine semantic similarity with text search and filters
      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at,
          (embedding::vector <=> $2::vector) as distance
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 AND embedding IS NOT NULL ${whereClause}
        ORDER BY (embedding::vector <=> $2::vector) ASC, importance DESC, created_at DESC
        ${filters?.limit ? `LIMIT ${filters.limit}` : 'LIMIT 100'}
      `,
        [this.config.agent, JSON.stringify(queryEmbedding), ...params]
      );

      return rows.map(this.mapRowToMessage);
    } catch (error) {
      throw new MemoryError(`Failed to search memories: ${(error as Error).message}`);
    }
  }

  getMemoryGraph(_conversation?: string): Promise<KnowledgeGraph> {
    return Promise.reject(new MemoryError('Memory graph not yet implemented'));
  }

  detectPatterns(_conversation?: string): Promise<Pattern[]> {
    return Promise.reject(new MemoryError('Pattern detection not yet implemented'));
  }

  async deleteMemory(memoryId: string): Promise<void> {
    this.ensureConnected();

    try {
      const { rowCount } = await this.client.query(
        `
        DELETE FROM ${this.config.tablePrefix}_memories
        WHERE id = $1 AND agent_id = $2
      `,
        [memoryId, this.config.agent]
      );

      if (rowCount === 0) {
        throw new MemoryNotFoundError(memoryId);
      }
    } catch (error) {
      if (error instanceof MemoryNotFoundError) throw error;
      throw new MemoryError(`Failed to delete memory: ${(error as Error).message}`);
    }
  }

  async deleteConversation(conversation: string): Promise<void> {
    this.ensureConnected();

    try {
      const { rowCount } = await this.client.query(
        `
        DELETE FROM ${this.config.tablePrefix}_memories
        WHERE conversation_id = $1 AND agent_id = $2
      `,
        [conversation, this.config.agent]
      );

      if (rowCount === 0) {
        throw new ConversationNotFoundError(conversation);
      }
    } catch (error) {
      if (error instanceof ConversationNotFoundError) throw error;
      throw new MemoryError(`Failed to delete conversation: ${(error as Error).message}`);
    }
  }

  async getRelevantContextWithCompression(
    query: string,
    maxTokens: number
  ): Promise<EnhancedContext> {
    this.ensureConnected();

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Get both raw memories and summaries
      const [rawMemories, summaries] = await Promise.all([
        this.getSemanticMemories(queryEmbedding, maxTokens * 0.7), // 70% for raw memories
        this.getRelevantSummaries(queryEmbedding, maxTokens * 0.3), // 30% for summaries
      ]);

      const allMessages = [...rawMemories.messages];
      let totalTokens = rawMemories.totalTokens;

      // Add summary content as system messages if there's token space
      for (const summary of summaries) {
        const summaryTokens = this.countTokens(summary.summaryContent);
        if (totalTokens + summaryTokens <= maxTokens) {
          allMessages.push({
            id: summary.id,
            conversation: summary.conversationId,
            content: `[SUMMARY ${summary.timeWindow.start.toISOString()} - ${summary.timeWindow.end.toISOString()}]: ${summary.summaryContent}`,
            role: 'system',
            importance: 0.8,
            timestamp: summary.createdAt,
          });
          totalTokens += summaryTokens;
        }
      }

      // Calculate relevance score including compression info
      const relevanceScore = this.calculateSemanticRelevanceScore(
        allMessages.filter(m => m.role !== 'system'),
        allMessages.filter(m => m.role !== 'system').map(() => 0.8)
      );

      const oldestMemoryDate =
        allMessages.length > 0
          ? new Date(Math.min(...allMessages.map(m => m.timestamp.getTime())))
          : undefined;
      const newestMemoryDate =
        allMessages.length > 0
          ? new Date(Math.max(...allMessages.map(m => m.timestamp.getTime())))
          : undefined;

      return {
        messages: allMessages,
        totalTokens,
        relevanceScore,
        lastUpdated: new Date(),
        compressionInfo: {
          hasCompressedData: summaries.length > 0,
          summariesIncluded: summaries.length,
          rawMemoriesIncluded: rawMemories.messages.length,
          oldestMemoryDate,
          newestMemoryDate,
        },
      };
    } catch (error) {
      throw new MemoryError(`Failed to get enhanced context: ${(error as Error).message}`);
    }
  }

  async compressMemories(config?: Partial<CompressionConfig>): Promise<CompressionResult> {
    this.ensureConnected();

    try {
      // Configure compression service
      const compressionService = new CompressionService(config);

      // Get all memories for analysis
      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1
        ORDER BY created_at ASC
      `,
        [this.config.agent]
      );

      const allMemories = rows.map(this.mapRowToMessage);

      // Analyze compression candidates
      const analysis = compressionService.analyzeCompressionCandidates(
        allMemories,
        this.config.agent
      );

      if (analysis.eligible.length === 0) {
        return {
          agentId: this.config.agent,
          strategy: config?.strategy ?? 'hybrid',
          memoriesProcessed: allMemories.length,
          memoriesCompressed: 0,
          memoriesPreserved: allMemories.length,
          originalTokenCount: analysis.tokenAnalysis.total,
          compressedTokenCount: analysis.tokenAnalysis.total,
          compressionRatio: 1.0,
          tokensReclaimed: 0,
          summariesCreated: 0,
          processingTimeMs: 0,
          createdAt: new Date(),
        };
      }

      // Group eligible memories by conversation for compression
      const conversationGroups = new Map<string, Message[]>();
      for (const memory of analysis.eligible) {
        const conv = memory.conversation;
        if (!conversationGroups.has(conv)) {
          conversationGroups.set(conv, []);
        }
        const convGroup = conversationGroups.get(conv);
        if (convGroup) {
          convGroup.push(memory);
        }
      }

      let totalCompressedMemories = 0;
      let totalSummariesCreated = 0;
      let totalTokensReclaimed = 0;
      const startTime = Date.now();

      // Compress each conversation group
      for (const [conversationId, memories] of conversationGroups) {
        const summary = compressionService.compressMemories(
          memories,
          this.config.agent,
          conversationId
        );
        await this.storeSummary(summary);

        // Delete compressed memories
        const memoryIds = memories.map(m => m.id).filter(Boolean);
        if (memoryIds.length > 0) {
          await this.client.query(
            `DELETE FROM ${this.config.tablePrefix}_memories WHERE id = ANY($1::text[])`,
            [memoryIds]
          );
        }

        totalCompressedMemories += memories.length;
        totalSummariesCreated += 1;
        totalTokensReclaimed += summary.originalTokenCount - summary.tokenCount;
      }

      const processingTimeMs = Date.now() - startTime;

      const result: CompressionResult = {
        agentId: this.config.agent,
        strategy: config?.strategy ?? 'hybrid',
        memoriesProcessed: allMemories.length,
        memoriesCompressed: totalCompressedMemories,
        memoriesPreserved: allMemories.length - totalCompressedMemories,
        originalTokenCount: analysis.tokenAnalysis.total,
        compressedTokenCount: analysis.tokenAnalysis.total - totalTokensReclaimed,
        compressionRatio:
          (analysis.tokenAnalysis.total - totalTokensReclaimed) / analysis.tokenAnalysis.total,
        tokensReclaimed: totalTokensReclaimed,
        summariesCreated: totalSummariesCreated,
        processingTimeMs,
        createdAt: new Date(),
      };

      logger.info(`Memory compression completed for agent ${this.config.agent}`, {
        memoriesCompressed: totalCompressedMemories,
        summariesCreated: totalSummariesCreated,
        tokensReclaimed: totalTokensReclaimed,
        compressionRatio: result.compressionRatio,
      });

      return result;
    } catch (error) {
      throw new MemoryError(`Failed to compress memories: ${(error as Error).message}`);
    }
  }

  async summarizeConversationWindow(
    conversation: string,
    timeWindow: TimeWindow
  ): Promise<MemorySummary> {
    this.ensureConnected();

    try {
      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 AND conversation_id = $2 
        AND created_at >= $3 AND created_at <= $4
        ORDER BY created_at ASC
      `,
        [this.config.agent, conversation, timeWindow.start, timeWindow.end]
      );

      if (rows.length === 0) {
        throw new MemoryError(`No memories found in time window for conversation ${conversation}`);
      }

      const memories = rows.map(this.mapRowToMessage);
      const summary = this.compressionService.compressMemories(
        memories,
        this.config.agent,
        conversation
      );

      // Update time window with label if provided
      if (timeWindow.label) {
        summary.timeWindow.label = timeWindow.label;
      }

      return summary;
    } catch (error) {
      throw new MemoryError(`Failed to summarize conversation window: ${(error as Error).message}`);
    }
  }

  async getCompressionStats(): Promise<CompressionStats> {
    this.ensureConnected();

    try {
      const { rows } = await this.client.query<{
        total_memories: string;
        raw_memories: string;
        compressed_memories: string;
        summaries: string;
        total_tokens: string;
        raw_tokens: string;
        compressed_tokens: string;
        compression_ratio: number;
        storage_efficiency: number;
        last_compression_at: Date | null;
        next_compression_eligible: Date | null;
      }>('SELECT * FROM get_compression_stats($1)', [this.config.agent]);

      const stats = rows[0];
      if (!stats) {
        throw new MemoryError('Failed to retrieve compression stats');
      }

      return {
        agentId: this.config.agent,
        totalMemories: parseInt(stats.total_memories, 10),
        rawMemories: parseInt(stats.raw_memories, 10),
        compressedMemories: parseInt(stats.compressed_memories, 10),
        summaries: parseInt(stats.summaries, 10),
        totalTokens: parseInt(stats.total_tokens, 10),
        rawTokens: parseInt(stats.raw_tokens, 10),
        compressedTokens: parseInt(stats.compressed_tokens, 10),
        compressionRatio: stats.compression_ratio,
        storageEfficiency: stats.storage_efficiency,
        lastCompressionAt: stats.last_compression_at ?? undefined,
        nextCompressionEligible: stats.next_compression_eligible ?? undefined,
      };
    } catch (error) {
      throw new MemoryError(`Failed to get compression stats: ${(error as Error).message}`);
    }
  }

  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new MemoryError('Database not connected. Call initialize() first.');
    }
  }

  private generateId(): string {
    return `mem_${ulid()}`;
  }

  private countTokens(text: string, provider?: string): number {
    // For backward compatibility, use synchronous estimation
    const providerName: string = provider ?? this.config.defaultProvider ?? 'openai';
    const tokens: number = this.universalTokenizer.estimateTokens(text, providerName);
    return Math.ceil(tokens * (1 + this.config.tokenBuffer));
  }

  private parseExpiration(expires?: Date | string): Date | null {
    if (!expires) return null;

    if (expires instanceof Date) return expires;

    if (typeof expires === 'string') {
      // Handle relative time strings like "30d", "1h", "7d"
      const match = expires.match(/^(\d+)([hdw])$/);
      if (match) {
        const [, amount, unit] = match;
        const now = new Date();
        const value = parseInt(amount ?? '0', 10);

        switch (unit) {
          case 'h':
            return new Date(now.getTime() + value * 60 * 60 * 1000);
          case 'd':
            return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
          case 'w':
            return new Date(now.getTime() + value * 7 * 24 * 60 * 60 * 1000);
        }
      }

      // Try to parse as a regular date string
      const parsed = new Date(expires);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  private buildWhereClause(filter: MemoryFilter): string {
    const conditions: string[] = [];

    if (filter.conversation) conditions.push('AND conversation_id = $' + (conditions.length + 2));
    if (filter.role) conditions.push('AND role = $' + (conditions.length + 2));
    if (filter.importance?.min) conditions.push('AND importance >= $' + (conditions.length + 2));
    if (filter.importance?.max) conditions.push('AND importance <= $' + (conditions.length + 2));
    if (filter.dateRange?.start) conditions.push('AND created_at >= $' + (conditions.length + 2));
    if (filter.dateRange?.end) conditions.push('AND created_at <= $' + (conditions.length + 2));

    return conditions.join(' ');
  }

  private buildQueryParams(filter: MemoryFilter): unknown[] {
    const params: unknown[] = [];

    if (filter.conversation) params.push(filter.conversation);
    if (filter.role) params.push(filter.role);
    if (filter.importance?.min) params.push(filter.importance.min);
    if (filter.importance?.max) params.push(filter.importance.max);
    if (filter.dateRange?.start) params.push(filter.dateRange.start);
    if (filter.dateRange?.end) params.push(filter.dateRange.end);

    return params;
  }

  private readonly mapRowToMessage = (row: DatabaseRow): Message => {
    if (!row?.id || !row.content) {
      throw new Error('Invalid database row: missing required fields');
    }

    // Handle both string (from mocks) and object (from real PostgreSQL) cases
    const parseJsonField = (field: string | Record<string, unknown> | number[] | null): unknown => {
      if (!field) return undefined;
      if (typeof field === 'string') {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return JSON.parse(field);
        } catch {
          return undefined;
        }
      }
      // Already parsed by PostgreSQL driver
      return field;
    };

    return {
      id: row.id,
      conversation: row.conversation_id,
      content: row.content,
      role: row.role as 'user' | 'assistant' | 'system',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      metadata: parseJsonField(row.metadata) as Record<string, unknown> | undefined,
      importance: row.importance,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      embedding: parseJsonField(row.embedding) as number[] | undefined,
      timestamp: row.created_at,
      expires: row.expires_at ?? undefined,
    };
  };

  private calculateRelevanceScore(messages: Message[]): number {
    if (messages.length === 0) return 0;
    return messages.reduce((sum, msg) => sum + msg.importance, 0) / messages.length;
  }

  private calculateSemanticRelevanceScore(messages: Message[], similarities: number[]): number {
    if (messages.length === 0 || similarities.length === 0) return 0;

    // Weighted combination of semantic similarity and importance
    let totalScore = 0;
    for (let i = 0; i < messages.length; i++) {
      const semanticWeight = 0.7; // 70% semantic similarity
      const importanceWeight = 0.3; // 30% importance

      const similarity = similarities[i] ?? 0;
      const message = messages[i];
      const importance = message?.importance ?? 0;
      totalScore += semanticWeight * similarity + importanceWeight * importance;
    }

    return totalScore / messages.length;
  }

  private async cleanupExpiredMemories(): Promise<void> {
    try {
      await this.client.query('SELECT cleanup_expired_memories()');
    } catch (error) {
      logger.warn('Failed to cleanup expired memories:', error as Error);
    }
  }

  private async storeSummary(summary: MemorySummary): Promise<void> {
    try {
      // Generate embedding for the summary content
      const embedding = await this.embeddingService.generateEmbedding(summary.summaryContent);

      await this.client.query(
        `
        INSERT INTO ${this.config.tablePrefix}_memory_summaries (
          id, agent_id, conversation_id, time_window_start, time_window_end, time_window_label,
          original_memory_ids, summary_content, key_topics, important_entities,
          compression_ratio, token_count, original_token_count, embedding, created_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `,
        [
          summary.id,
          summary.agentId,
          summary.conversationId,
          summary.timeWindow.start,
          summary.timeWindow.end,
          summary.timeWindow.label ?? null,
          summary.originalMemoryIds,
          summary.summaryContent,
          summary.keyTopics,
          summary.importantEntities,
          summary.compressionRatio,
          summary.tokenCount,
          summary.originalTokenCount,
          JSON.stringify(embedding),
          summary.createdAt,
          JSON.stringify(summary.metadata ?? {}),
        ]
      );
    } catch (error) {
      throw new MemoryError(`Failed to store summary: ${(error as Error).message}`);
    }
  }

  private async getSemanticMemories(queryEmbedding: number[], maxTokens: number): Promise<Context> {
    const { rows } = await this.client.query<DatabaseRow>(
      `
      SELECT 
        id, agent_id, conversation_id, content, role, metadata,
        importance, embedding, created_at, expires_at,
        (embedding::vector <=> $2::vector) as distance
      FROM ${this.config.tablePrefix}_memories
      WHERE agent_id = $1 AND embedding IS NOT NULL
      ORDER BY (embedding::vector <=> $2::vector) ASC, importance DESC
      LIMIT 50
    `,
      [this.config.agent, JSON.stringify(queryEmbedding)]
    );

    let totalTokens = 0;
    const relevantMessages: Message[] = [];
    const similarities: number[] = [];

    for (const row of rows) {
      const message = this.mapRowToMessage(row);
      const messageTokens = this.countTokens(message.content);

      if (totalTokens + messageTokens <= maxTokens) {
        relevantMessages.push(message);
        similarities.push(1 - (row as DatabaseRow & { distance: number }).distance);
        totalTokens += messageTokens;
      } else {
        break;
      }
    }

    const relevanceScore = this.calculateSemanticRelevanceScore(relevantMessages, similarities);

    return {
      messages: relevantMessages,
      totalTokens,
      relevanceScore,
      lastUpdated: new Date(),
    };
  }

  private async getRelevantSummaries(
    queryEmbedding: number[],
    maxTokens: number
  ): Promise<MemorySummary[]> {
    const { rows } = await this.client.query<{
      id: string;
      agent_id: string;
      conversation_id: string;
      time_window_start: Date;
      time_window_end: Date;
      time_window_label: string | null;
      original_memory_ids: string[];
      summary_content: string;
      key_topics: string[];
      important_entities: string[];
      compression_ratio: number;
      token_count: number;
      original_token_count: number;
      embedding: string | null;
      created_at: Date;
      metadata: Record<string, unknown> | null;
      distance: number;
    }>(
      `
      SELECT 
        id, agent_id, conversation_id, time_window_start, time_window_end, time_window_label,
        original_memory_ids, summary_content, key_topics, important_entities,
        compression_ratio, token_count, original_token_count, embedding, created_at, metadata,
        (embedding::vector <=> $2::vector) as distance
      FROM ${this.config.tablePrefix}_memory_summaries
      WHERE agent_id = $1 AND embedding IS NOT NULL
      ORDER BY (embedding::vector <=> $2::vector) ASC
      LIMIT 20
    `,
      [this.config.agent, JSON.stringify(queryEmbedding)]
    );

    let totalTokens = 0;
    const relevantSummaries: MemorySummary[] = [];

    for (const row of rows) {
      if (totalTokens + row.token_count <= maxTokens) {
        relevantSummaries.push({
          id: row.id,
          agentId: row.agent_id,
          conversationId: row.conversation_id,
          timeWindow: {
            start: row.time_window_start,
            end: row.time_window_end,
            label: row.time_window_label ?? undefined,
          },
          originalMemoryIds: row.original_memory_ids,
          summaryContent: row.summary_content,
          keyTopics: row.key_topics,
          importantEntities: row.important_entities,
          compressionRatio: row.compression_ratio,
          tokenCount: row.token_count,
          originalTokenCount: row.original_token_count,
          embedding: row.embedding ? (JSON.parse(row.embedding) as number[]) : undefined,
          createdAt: row.created_at,
          metadata: row.metadata ?? undefined,
        });
        totalTokens += row.token_count;
      } else {
        break;
      }
    }

    return relevantSummaries;
  }

  private createTokenizer(): UniversalTokenizer {
    // If no providers configured, create a default OpenAI-compatible tokenizer
    if (!this.config.modelProviders?.length) {
      const defaultProvider: ModelProviderConfig = {
        name: 'default-openai',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        tokenLimits: {
          context: this.config.maxTokens,
          output: 1000,
        },
        tokenMultiplier: 1.0,
      };

      return new UniversalTokenizer([defaultProvider], this.config.tokenCountingStrategy);
    }

    // Use configured providers - safely cast to exclude undefined
    const providers: ModelProviderConfig[] = this.config.modelProviders ?? [];
    return new UniversalTokenizer(providers, this.config.tokenCountingStrategy);
  }
}
