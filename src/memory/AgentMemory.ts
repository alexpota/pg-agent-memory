import { Client } from 'pg';
import { encoding_for_model } from 'tiktoken';
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
} from '../types/index.js';
import {
  MemoryError,
  DatabaseConnectionError,
  MemoryNotFoundError,
  ConversationNotFoundError,
  TokenLimitExceededError,
} from '../errors/index.js';
import { DatabaseMigrator } from '../db/migrations.js';

export class AgentMemory implements AgentMemoryInterface {
  private readonly client: Client;
  private readonly config: MemoryConfig;
  private readonly tokenizer = encoding_for_model('gpt-3.5-turbo');
  private isConnected = false;

  constructor(config: Partial<MemoryConfig>) {
    this.config = MemoryConfigSchema.parse(config);
    this.client = new Client({ connectionString: this.config.connectionString });
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

      await this.cleanupExpiredMemories();
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

    try {
      await this.client.query(
        `
        INSERT INTO ${this.config.tablePrefix}_memories (
          id, agent_id, conversation_id, content, role, metadata, 
          importance, created_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
        [
          id,
          this.config.agent,
          validatedMessage.conversation,
          validatedMessage.content,
          validatedMessage.role,
          JSON.stringify(validatedMessage.metadata ?? {}),
          validatedMessage.importance,
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

      if (rows.length === 0) {
        throw new ConversationNotFoundError(conversation);
      }

      return rows.map(this.mapRowToMessage);
    } catch (error) {
      if (error instanceof ConversationNotFoundError) throw error;
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
      // For now, implement basic text matching - vector search will be added later
      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 AND conversation_id = $2 AND content ILIKE $3
        ORDER BY importance DESC
      `,
        [this.config.agent, conversation, `%${query}%`]
      );

      let totalTokens = 0;
      const relevantMessages: Message[] = [];

      for (const row of rows) {
        const message = this.mapRowToMessage(row);
        const messageTokens = this.countTokens(message.content);

        if (totalTokens + messageTokens <= maxTokens) {
          relevantMessages.push(message);
          totalTokens += messageTokens;
        } else {
          break;
        }
      }

      return {
        messages: relevantMessages,
        totalTokens,
        relevanceScore: this.calculateRelevanceScore(relevantMessages),
        lastUpdated: new Date(),
      };
    } catch (error) {
      throw new MemoryError(`Failed to get relevant context: ${(error as Error).message}`);
    }
  }

  summarizeOldConversations(_conversation: string): Promise<void> {
    return Promise.reject(new MemoryError('Memory summarization not yet implemented'));
  }

  shareMemoryBetweenAgents(_agentIds: string[], _scope: MemoryScope): Promise<void> {
    return Promise.reject(new MemoryError('Memory sharing not yet implemented'));
  }

  async searchMemories(query: string, filters?: MemoryFilter): Promise<Message[]> {
    this.ensureConnected();

    const whereClause = filters ? this.buildWhereClause(filters) : '';
    const params = filters ? this.buildQueryParams(filters) : [];

    try {
      const { rows } = await this.client.query<DatabaseRow>(
        `
        SELECT 
          id, agent_id, conversation_id, content, role, metadata,
          importance, embedding, created_at, expires_at
        FROM ${this.config.tablePrefix}_memories
        WHERE agent_id = $1 AND content ILIKE $2 ${whereClause}
        ORDER BY importance DESC, created_at DESC
        ${filters?.limit ? `LIMIT ${filters.limit}` : 'LIMIT 100'}
      `,
        [this.config.agent, `%${query}%`, ...params]
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

  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new MemoryError('Database not connected. Call initialize() first.');
    }
  }

  private generateId(): string {
    return `mem_${ulid()}`;
  }

  private countTokens(text: string): number {
    return this.tokenizer.encode(text).length;
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

      return new Date(expires);
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
    return {
      id: row.id,
      conversation: row.conversation_id,
      content: row.content,
      role: row.role as 'user' | 'assistant' | 'system',
      metadata: row.metadata ?? undefined,
      importance: row.importance,
      embedding: row.embedding ?? undefined,
      timestamp: row.created_at,
      expires: row.expires_at ?? undefined,
    };
  };

  private calculateRelevanceScore(messages: Message[]): number {
    if (messages.length === 0) return 0;
    return messages.reduce((sum, msg) => sum + msg.importance, 0) / messages.length;
  }

  private async cleanupExpiredMemories(): Promise<void> {
    try {
      await this.client.query('SELECT cleanup_expired_memories()');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to cleanup expired memories:', error);
    }
  }
}
