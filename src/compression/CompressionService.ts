import { encoding_for_model } from 'tiktoken';
import { ulid } from 'ulid';
import {
  CompressionConfig,
  CompressionConfigSchema,
  MemorySummary,
  Message,
  TimeWindow,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { CompressionError } from '../errors/index.js';

/**
 * Core compression service for intelligent memory management
 * Implements multiple compression strategies with configurable thresholds
 */
export class CompressionService {
  private readonly tokenizer = encoding_for_model('gpt-3.5-turbo');
  private readonly config: CompressionConfig;

  constructor(config: Partial<CompressionConfig> = {}) {
    this.config = CompressionConfigSchema.parse(config);
  }

  /**
   * Analyzes memories and determines compression candidates
   * Returns detailed analysis without performing compression
   */
  analyzeCompressionCandidates(
    memories: Message[],
    agentId: string
  ): {
    eligible: Message[];
    preserved: Message[];
    tokenAnalysis: {
      total: number;
      eligible: number;
      preserved: number;
      projectedSavings: number;
    };
  } {
    const startTime = Date.now();

    try {
      // Sort memories by creation date (oldest first)
      const sortedMemories = [...memories].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      // Always preserve the most recent memories
      const preserveCount = Math.min(this.config.preserveRecentCount, sortedMemories.length);
      const preserved = sortedMemories.slice(-preserveCount);
      const candidates = sortedMemories.slice(0, -preserveCount);

      // Apply compression strategy filters
      const eligible = this.filterCompressionCandidates(candidates);

      // Calculate token counts
      const totalTokens = this.calculateTotalTokens(memories);
      const eligibleTokens = this.calculateTotalTokens(eligible);
      const preservedTokens = this.calculateTotalTokens(preserved);
      const projectedSavings = Math.floor(eligibleTokens * (1 - this.config.compressionRatio));

      logger.debug(`Compression analysis completed for agent ${agentId}`, {
        totalMemories: memories.length,
        eligible: eligible.length,
        preserved: preserved.length,
        processingTimeMs: Date.now() - startTime,
      });

      return {
        eligible,
        preserved,
        tokenAnalysis: {
          total: totalTokens,
          eligible: eligibleTokens,
          preserved: preservedTokens,
          projectedSavings,
        },
      };
    } catch (error) {
      throw new CompressionError(`Analysis failed for agent ${agentId}`, error as Error);
    }
  }

  /**
   * Compresses a set of memories into a concise summary
   * Uses extractive summarization to maintain factual accuracy
   */
  compressMemories(memories: Message[], agentId: string, conversationId?: string): MemorySummary {
    const startTime = Date.now();

    if (memories.length === 0) {
      throw new CompressionError('Cannot compress empty memory set');
    }

    try {
      // Sort memories chronologically
      const sortedMemories = [...memories].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      // Calculate original metrics
      const originalTokenCount = this.calculateTotalTokens(sortedMemories);
      const timeWindow = this.calculateTimeWindow(sortedMemories);

      // Generate summary using extractive approach
      const summaryContent = this.generateExtractiveSummary(sortedMemories);
      const keyTopics = this.extractKeyTopics(sortedMemories);
      const importantEntities = this.extractImportantEntities(sortedMemories);

      // Calculate compression metrics
      const tokenCount = this.countTokens(summaryContent);
      const actualCompressionRatio = tokenCount / originalTokenCount;

      const summary: MemorySummary = {
        id: `sum_${ulid()}`,
        agentId,
        conversationId:
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          conversationId ?? (sortedMemories[0]?.conversation || 'mixed'),
        timeWindow,
        originalMemoryIds: sortedMemories.map(m => m.id ?? ''),
        summaryContent,
        keyTopics,
        importantEntities,
        compressionRatio: actualCompressionRatio,
        tokenCount,
        originalTokenCount,
        createdAt: new Date(),
        metadata: {
          compressionStrategy: this.config.strategy,
          originalMemoryCount: sortedMemories.length,
          processingTimeMs: Date.now() - startTime,
        },
      };

      logger.info(`Memory compression completed`, {
        agentId,
        memoriesCompressed: memories.length,
        compressionRatio: actualCompressionRatio,
        tokensSaved: originalTokenCount - tokenCount,
      });

      return summary;
    } catch (error) {
      throw new CompressionError(`Compression failed for agent ${agentId}`, error as Error);
    }
  }

  /**
   * Applies strategy-specific filtering to identify compression candidates
   */
  private filterCompressionCandidates(memories: Message[]): Message[] {
    switch (this.config.strategy) {
      case 'time_based':
        return this.filterByTime(memories);
      case 'importance_based':
        return this.filterByImportance(memories);
      case 'token_based':
        return this.filterByTokens(memories);
      case 'hybrid':
      default:
        return this.filterHybrid(memories);
    }
  }

  private filterByTime(memories: Message[]): Message[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.timeThresholdDays);

    return memories.filter(memory => memory.timestamp < cutoffDate);
  }

  private filterByImportance(memories: Message[]): Message[] {
    return memories.filter(memory => memory.importance < this.config.importanceThreshold);
  }

  private filterByTokens(memories: Message[]): Message[] {
    // For token-based strategy, compress until we're under the threshold
    const sortedByAge = [...memories].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let currentTokens = 0;
    const candidates: Message[] = [];

    for (const memory of sortedByAge) {
      const tokens = this.countTokens(memory.content);
      if (currentTokens + tokens > this.config.maxTokensBeforeCompression) {
        candidates.push(memory);
      } else {
        currentTokens += tokens;
      }
    }

    return candidates;
  }

  private filterHybrid(memories: Message[]): Message[] {
    // Combine all strategies - a memory is eligible if it meets ANY criteria
    const timeEligible = this.filterByTime(memories);
    const importanceEligible = this.filterByImportance(memories);
    const tokenEligible = this.filterByTokens(memories);

    // Use Set to avoid duplicates
    const eligibleIds = new Set([
      ...timeEligible.map(m => m.id),
      ...importanceEligible.map(m => m.id),
      ...tokenEligible.map(m => m.id),
    ]);

    return memories.filter(memory => eligibleIds.has(memory.id));
  }

  /**
   * Generates extractive summary by selecting the most important sentences
   */
  private generateExtractiveSummary(memories: Message[]): string {
    // Group memories by conversation for better context
    const conversations = this.groupByConversation(memories);
    const summaryParts: string[] = [];

    for (const [conversationId, msgs] of conversations.entries()) {
      // Sort by importance and timestamp
      const important = msgs
        .filter(m => m.importance >= 0.3) // Keep reasonably important memories
        .sort((a, b) => b.importance - a.importance)
        .slice(0, Math.max(3, Math.ceil(msgs.length * 0.3))); // Keep top 30% or minimum 3

      if (important.length > 0) {
        const conversationSummary = important.map(m => `${m.role}: ${m.content}`).join(' | ');

        summaryParts.push(`[${conversationId}] ${conversationSummary}`);
      }
    }

    return summaryParts.join('\n\n');
  }

  private extractKeyTopics(memories: Message[]): string[] {
    // Simple keyword extraction - in production, could use more sophisticated NLP
    const allContent = memories.map(m => m.content.toLowerCase()).join(' ');

    // Extract common patterns and keywords
    const words = allContent.split(/\s+/).filter(word => word.length > 3);
    const wordFreq = new Map<string, number>();

    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    });

    // Return top frequent words as topics
    return Array.from(wordFreq.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  private extractImportantEntities(memories: Message[]): string[] {
    // Extract entities using simple heuristics
    // In production, could use NER libraries
    const entities = new Set<string>();

    memories.forEach(memory => {
      // Look for capitalized words (potential entities)
      const words = memory.content.split(/\s+/);
      words.forEach(word => {
        if (/^[A-Z][a-z]+/.test(word) && word.length > 2) {
          entities.add(word);
        }
      });
    });

    return Array.from(entities).slice(0, 20);
  }

  private groupByConversation(memories: Message[]): Map<string, Message[]> {
    const conversations = new Map<string, Message[]>();

    memories.forEach(memory => {
      const conv = memory.conversation || 'default';
      if (!conversations.has(conv)) {
        conversations.set(conv, []);
      }
      conversations.get(conv)!.push(memory);
    });

    return conversations;
  }

  private calculateTimeWindow(memories: Message[]): TimeWindow {
    const timestamps = memories.map(m => m.timestamp);
    const start = new Date(Math.min(...timestamps.map(t => t.getTime())));
    const end = new Date(Math.max(...timestamps.map(t => t.getTime())));

    return { start, end };
  }

  private calculateTotalTokens(memories: Message[]): number {
    return memories.reduce((total, memory) => total + this.countTokens(memory.content), 0);
  }

  private countTokens(text: string): number {
    try {
      return this.tokenizer.encode(text).length;
    } catch (error) {
      // Fallback to word-based estimation if tokenizer fails
      return Math.ceil(text.split(/\s+/).length * 1.3);
    }
  }
}
