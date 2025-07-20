/**
 * pg-agent-memory - Stateful AI Agent Memory Layer for PostgreSQL
 *
 * A TypeScript-first library for managing AI agent memory with PostgreSQL and pgvector.
 * Provides intelligent context management, conversation history, and memory compression.
 */

export { AgentMemory } from './memory/AgentMemory.js';
export type { MemoryConfig, Message, Context, MemoryFilter } from './types/index.js';
export { MemoryScope } from './types/index.js';
export {
  MemoryError,
  LockAcquisitionError,
  DatabaseConnectionError,
  ValidationError,
  MemoryNotFoundError,
  ConversationNotFoundError,
  TokenLimitExceededError,
  EmbeddingError,
  CompressionError,
} from './errors/index.js';
export { DatabaseMigrator } from './db/migrations.js';
export { EmbeddingService } from './embeddings/EmbeddingService.js';
export { CompressionService } from './compression/CompressionService.js';
export { UniversalTokenizer } from './tokenization/UniversalTokenizer.js';
export { logger, Logger, LogLevel } from './utils/logger.js';

// Re-export important types for convenience
export type {
  AgentMemoryInterface,
  KnowledgeGraph,
  Pattern,
  CompressionConfig,
  CompressionResult,
  CompressionStats,
  MemorySummary,
  TimeWindow,
  EnhancedContext,
  // Multi-model support types
  ModelProvider,
  ModelProviderConfig,
  TokenCountingStrategy,
  TokenCountResult,
  TokenCountingOptions,
  UniversalTokenizerInterface,
} from './types/index.js';
