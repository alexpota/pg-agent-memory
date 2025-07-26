import { z } from 'zod';

// Multi-Model Support Types
export const ModelProviderSchema = z.enum([
  'openai',
  'anthropic',
  'deepseek',
  'google',
  'meta',
  'custom',
]);

export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const TokenCountingStrategySchema = z.enum([
  'precise', // Use provider's API for exact counts (slower, accurate)
  'fast', // Use estimation algorithms (faster, ~90% accurate)
  'hybrid', // Use precise for small texts, estimation for large
]);

export type TokenCountingStrategy = z.infer<typeof TokenCountingStrategySchema>;

export const ModelProviderConfigSchema = z.object({
  name: z.string().min(1),
  provider: ModelProviderSchema,
  apiKey: z.string().optional(), // Optional for estimation-only usage
  baseURL: z.string().url().optional(),
  model: z.string().default('default'),
  tokenLimits: z.object({
    context: z.number().positive().default(4000),
    output: z.number().positive().default(1000),
  }),
  // Provider-specific token counting multipliers (research-based)
  tokenMultiplier: z.number().positive().default(1.0),
  // Rate limiting configuration
  rateLimit: z
    .object({
      requestsPerMinute: z.number().positive().default(60),
      tokensPerMinute: z.number().positive().default(150000),
    })
    .optional(),
});

export type ModelProviderConfig = z.infer<typeof ModelProviderConfigSchema>;

export const MemoryConfigSchema = z.object({
  agent: z.string().min(1),
  connectionString: z.string().min(1),
  tablePrefix: z.string().default('agent'),

  // Legacy single-model configuration (backward compatibility)
  maxTokens: z.number().positive().default(4000),
  embeddingDimensions: z.number().positive().default(384),
  compressionThreshold: z.number().min(0).max(1).default(0.8),
  retentionDays: z.number().positive().default(90),

  // NEW: Multi-model configuration
  modelProviders: z.array(ModelProviderConfigSchema).optional(),
  defaultProvider: z.string().optional(),
  tokenCountingStrategy: TokenCountingStrategySchema.default('hybrid'),

  // Fallback behavior when providers are unavailable
  fallbackToEstimation: z.boolean().default(true),

  // Buffer percentage for token limits (10% = 1.1x safety margin)
  tokenBuffer: z.number().min(0).max(0.5).default(0.1),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

export const MessageSchema = z.object({
  id: z.string().optional(),
  conversation: z.string(),
  content: z.string(),
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  metadata: z.record(z.unknown()).optional(),
  importance: z.number().min(0).max(1).default(0.5),
  embedding: z.array(z.number()).optional(),
  timestamp: z.date().default(() => new Date()),
  expires: z.union([z.date(), z.string()]).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

export const ContextSchema = z.object({
  messages: z.array(MessageSchema),
  totalTokens: z.number(),
  relevanceScore: z.number().min(0).max(1),
  summary: z.string().optional(),
  lastUpdated: z.date(),
});

export type Context = z.infer<typeof ContextSchema>;

export const MemoryFilterSchema = z.object({
  conversation: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system']).optional(),
  importance: z
    .object({
      min: z.number().min(0).max(1).optional(),
      max: z.number().min(0).max(1).optional(),
    })
    .optional(),
  dateRange: z
    .object({
      start: z.date().optional(),
      end: z.date().optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  limit: z.number().positive().optional(),
  offset: z.number().min(0).optional(),
});

export type MemoryFilter = z.infer<typeof MemoryFilterSchema>;

export enum MemoryScope {
  PRIVATE = 'private',
  SHARED = 'shared',
  PUBLIC = 'public',
}

export interface KnowledgeGraph {
  nodes: Array<{
    id: string;
    type: 'memory' | 'concept' | 'entity';
    label: string;
    importance: number;
    metadata?: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: 'relates_to' | 'follows' | 'mentions';
    weight: number;
  }>;
}

export interface Pattern {
  id: string;
  type: 'temporal' | 'semantic' | 'behavioral';
  description: string;
  confidence: number;
  examples: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentMemoryInterface {
  remember(message: Message): Promise<string>;
  recall(filter: MemoryFilter): Promise<Context>;
  getHistory(conversation: string, limit?: number): Promise<Message[]>;
  getRelevantContext(conversation: string, query: string, maxTokens: number): Promise<Context>;

  // Enhanced context retrieval with compression awareness
  getRelevantContextWithCompression(query: string, maxTokens: number): Promise<EnhancedContext>;

  // Memory compression and summarization
  compressMemories(config?: Partial<CompressionConfig>): Promise<CompressionResult>;
  summarizeConversationWindow(conversation: string, timeWindow: TimeWindow): Promise<MemorySummary>;
  getCompressionStats(): Promise<CompressionStats>;

  // Legacy/future methods
  summarizeOldConversations(conversation: string): Promise<void>;
  shareMemoryBetweenAgents(agentIds: string[], scope: MemoryScope): Promise<void>;
  searchMemories(query: string, filters?: MemoryFilter): Promise<Message[]>;
  getMemoryGraph(conversation?: string): Promise<KnowledgeGraph>;
  detectPatterns(conversation?: string): Promise<Pattern[]>;
  deleteMemory(memoryId: string): Promise<void>;
  deleteConversation(conversation: string): Promise<void>;
}

export interface DatabaseRow {
  id: string;
  agent_id: string;
  conversation_id: string;
  content: string;
  role: string;
  metadata: string | Record<string, unknown> | null; // String from mocks, object from real PostgreSQL
  importance: number;
  embedding: string | number[] | null; // String from mocks, array from real PostgreSQL
  created_at: Date;
  expires_at: Date | null;
}

// Memory Compression Types
export const CompressionStrategySchema = z.enum([
  'token_based', // Compress when approaching token limits
  'time_based', // Compress conversations older than threshold
  'importance_based', // Compress low-importance memories first
  'hybrid', // Combination of all strategies
]);

export type CompressionStrategy = z.infer<typeof CompressionStrategySchema>;

export const TimeWindowSchema = z.object({
  start: z.date(),
  end: z.date(),
  label: z.string().optional(), // e.g., "last_week", "january_2024"
});

export type TimeWindow = z.infer<typeof TimeWindowSchema>;

export const CompressionConfigSchema = z.object({
  strategy: CompressionStrategySchema.default('hybrid'),
  maxTokensBeforeCompression: z.number().positive().default(3000),
  compressionRatio: z.number().min(0.1).max(0.9).default(0.3), // Target 30% of original size
  timeThresholdDays: z.number().positive().default(7), // Compress memories older than 7 days
  importanceThreshold: z.number().min(0).max(1).default(0.3), // Compress memories below 0.3 importance
  preserveRecentCount: z.number().nonnegative().default(50), // Always keep 50 most recent memories raw
  summaryModel: z.string().default('extractive'), // 'extractive' or 'abstractive'
});

export type CompressionConfig = z.infer<typeof CompressionConfigSchema>;

export const MemorySummarySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  conversationId: z.string(),
  timeWindow: TimeWindowSchema,
  originalMemoryIds: z.array(z.string()),
  summaryContent: z.string(),
  keyTopics: z.array(z.string()),
  importantEntities: z.array(z.string()),
  compressionRatio: z.number(), // actual compression achieved
  tokenCount: z.number(),
  originalTokenCount: z.number(),
  embedding: z.array(z.number()).optional(),
  createdAt: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

export type MemorySummary = z.infer<typeof MemorySummarySchema>;

export const CompressionResultSchema = z.object({
  agentId: z.string(),
  conversationId: z.string().optional(),
  strategy: CompressionStrategySchema,
  memoriesProcessed: z.number(),
  memoriesCompressed: z.number(),
  memoriesPreserved: z.number(),
  originalTokenCount: z.number(),
  compressedTokenCount: z.number(),
  compressionRatio: z.number(),
  tokensReclaimed: z.number(),
  summariesCreated: z.number(),
  processingTimeMs: z.number(),
  createdAt: z.date(),
});

export type CompressionResult = z.infer<typeof CompressionResultSchema>;

export const CompressionStatsSchema = z.object({
  agentId: z.string(),
  totalMemories: z.number(),
  rawMemories: z.number(),
  compressedMemories: z.number(),
  summaries: z.number(),
  totalTokens: z.number(),
  rawTokens: z.number(),
  compressedTokens: z.number(),
  compressionRatio: z.number(),
  storageEfficiency: z.number(), // percentage of storage saved
  lastCompressionAt: z.date().optional(),
  nextCompressionEligible: z.date().optional(),
});

export type CompressionStats = z.infer<typeof CompressionStatsSchema>;

// Enhanced Context with compression information
export const EnhancedContextSchema = ContextSchema.extend({
  compressionInfo: z
    .object({
      hasCompressedData: z.boolean(),
      summariesIncluded: z.number(),
      rawMemoriesIncluded: z.number(),
      oldestMemoryDate: z.date().optional(),
      newestMemoryDate: z.date().optional(),
    })
    .optional(),
});

export type EnhancedContext = z.infer<typeof EnhancedContextSchema>;

// Token Counting Types
export const TokenCountResultSchema = z.object({
  tokens: z.number().nonnegative(),
  provider: ModelProviderSchema,
  method: z.enum(['api', 'estimation', 'tiktoken']),
  accuracy: z.enum(['high', 'medium', 'low']),
  processingTimeMs: z.number().nonnegative(),
  cached: z.boolean().default(false),
});

export type TokenCountResult = z.infer<typeof TokenCountResultSchema>;

export const TokenCountingOptionsSchema = z.object({
  provider: z.string().optional(), // Use specific provider
  strategy: TokenCountingStrategySchema.optional(), // Override default strategy
  useCache: z.boolean().optional().default(true),
  maxCacheAge: z.number().positive().optional().default(300000), // 5 minutes in ms
});

export type TokenCountingOptions = z.infer<typeof TokenCountingOptionsSchema>;

// Universal Tokenizer Interface
export interface UniversalTokenizerInterface {
  countTokens(text: string, options?: Partial<TokenCountingOptions>): Promise<TokenCountResult>;
  getProviderInfo(providerName: string): ModelProviderConfig | undefined;
  isProviderAvailable(providerName: string): boolean;
  estimateTokens(text: string, provider: string): number;
  clearCache(): void;
}
