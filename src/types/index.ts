import { z } from 'zod';

export const MemoryConfigSchema = z.object({
  agent: z.string().min(1),
  connectionString: z.string().min(1),
  tablePrefix: z.string().default('agent'),
  maxTokens: z.number().positive().default(4000),
  embeddingDimensions: z.number().positive().default(1536),
  compressionThreshold: z.number().min(0).max(1).default(0.8),
  retentionDays: z.number().positive().default(90),
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
  metadata: Record<string, unknown> | null;
  importance: number;
  embedding: number[] | null;
  created_at: Date;
  expires_at: Date | null;
}
