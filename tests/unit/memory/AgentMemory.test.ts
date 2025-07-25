/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from 'pg';
import { AgentMemory } from '../../../src/memory/AgentMemory.js';
import { DatabaseMigrator } from '../../../src/db/migrations.js';
import { timeUtils } from '../../../src/utils/timeConstants.js';
import { EmbeddingService } from '../../../src/embeddings/EmbeddingService.js';
import type { MemoryConfig, Message } from '../../../src/types/index.js';

// Mock external dependencies
vi.mock('pg');
vi.mock('../../../src/db/migrations.js');
vi.mock('../../../src/embeddings/EmbeddingService.js');
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AgentMemory', () => {
  let memory: AgentMemory;
  let mockClient: any;
  let mockMigrator: any;
  let mockEmbeddingService: any;

  const baseConfig: MemoryConfig = {
    agent: 'test-agent',
    connectionString: 'postgresql://test:test@localhost:5432/test',
    maxTokens: 4000,
  };

  beforeEach(() => {
    // Setup client mock
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    (Client as any).mockImplementation(() => mockClient);

    // Setup migrator mock
    mockMigrator = {
      migrate: vi.fn().mockResolvedValue(undefined),
      validateSchema: vi.fn().mockResolvedValue(true),
    };
    (DatabaseMigrator as any).mockImplementation(() => mockMigrator);

    // Setup embedding service mock
    mockEmbeddingService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };
    (EmbeddingService.getInstance as any).mockReturnValue(mockEmbeddingService);

    memory = new AgentMemory(baseConfig);
  });

  afterEach(async () => {
    if (memory) {
      await memory.disconnect();
    }
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(memory).toBeInstanceOf(AgentMemory);
      expect(Client).toHaveBeenCalledWith({
        connectionString: baseConfig.connectionString,
      });
    });

    it('should validate required config fields', () => {
      expect(() => new AgentMemory({} as any)).toThrow();
    });

    it('should initialize with model providers', () => {
      const configWithProviders = {
        ...baseConfig,
        modelProviders: [
          {
            name: 'test-openai',
            provider: 'openai' as const,
            model: 'gpt-3.5-turbo',
            tokenLimits: { context: 4000, output: 1000 },
          },
        ],
      };

      const memoryWithProviders = new AgentMemory(configWithProviders);
      expect(memoryWithProviders).toBeInstanceOf(AgentMemory);
    });
  });

  describe('initialize', () => {
    it('should initialize database connection and run migrations', async () => {
      await memory.initialize();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(DatabaseMigrator).toHaveBeenCalledWith(mockClient);
      expect(mockMigrator.migrate).toHaveBeenCalled();
      expect(mockMigrator.validateSchema).toHaveBeenCalled();
      expect(mockEmbeddingService.initialize).toHaveBeenCalled();
    });

    it('should handle database connection failure', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(memory.initialize()).rejects.toThrow('Connection failed');
    });

    it('should handle migration failure', async () => {
      mockMigrator.migrate.mockRejectedValue(new Error('Migration failed'));

      await expect(memory.initialize()).rejects.toThrow('Migration failed');
    });

    it('should handle schema validation failure', async () => {
      mockMigrator.validateSchema.mockResolvedValue(false);

      await expect(memory.initialize()).rejects.toThrow('Database schema validation failed');
    });

    it('should handle embedding service initialization failure', async () => {
      mockEmbeddingService.initialize.mockRejectedValue(new Error('Model loading failed'));

      await expect(memory.initialize()).rejects.toThrow('Model loading failed');
    });

    it('should handle cleanup errors gracefully during initialization', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('Cleanup failed'));

      await expect(memory.initialize()).resolves.not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should disconnect from database when connected', async () => {
      await memory.initialize();
      await memory.disconnect();

      expect(mockClient.end).toHaveBeenCalled();
    });

    it('should handle disconnection when not connected', async () => {
      await memory.disconnect();

      expect(mockClient.end).not.toHaveBeenCalled();
    });
  });

  describe('remember', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should store a memory with all fields', async () => {
      const message: Message = {
        conversation: 'test-conv',
        content: 'Hello world',
        role: 'user',
        importance: 0.8,
        metadata: { source: 'test' },
      };

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const memoryId = await memory.remember(message);

      expect(memoryId).toMatch(/^mem_[A-Z0-9]{26}$/);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([
          expect.stringMatching(/^mem_[A-Z0-9]{26}$/),
          'test-agent',
          'test-conv',
          'Hello world',
          'user',
          JSON.stringify({ source: 'test' }),
          0.8,
          JSON.stringify([0.1, 0.2, 0.3]),
          expect.any(Date),
          null,
        ])
      );
    });

    it('should store memory with expiration', async () => {
      const message: Message = {
        conversation: 'test-conv',
        content: 'Temporary message',
        role: 'user',
        importance: 0.8,
        timestamp: new Date(),
        expires: '1h',
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // cleanup query
        .mockResolvedValueOnce({ rows: [] }); // insert query

      await memory.remember(message);

      // The second call is the INSERT (first call is cleanup)
      const insertCall = mockClient.query.mock.calls[1];
      const queryArgs = insertCall?.[1];
      expect(queryArgs?.[9]).toBeInstanceOf(Date);
    });

    it('should handle database errors', async () => {
      const message: Message = {
        conversation: 'test-conv',
        content: 'Hello world',
        role: 'user',
        importance: 0.8,
      };

      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(memory.remember(message)).rejects.toThrow('Database error');
    });

    it('should validate message schema', async () => {
      const invalidMessage = {
        conversation: 'test-conv',
        content: '',
        role: 'invalid-role',
      };

      await expect(memory.remember(invalidMessage as any)).rejects.toThrow();
    });

    it('should require connection', async () => {
      const disconnectedMemory = new AgentMemory(baseConfig);
      const message: Message = {
        conversation: 'test-conv',
        content: 'Hello world',
        role: 'user',
        importance: 0.8,
      };

      await expect(disconnectedMemory.remember(message)).rejects.toThrow('not connected');
    });
  });

  describe('getHistory', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should retrieve conversation history', async () => {
      const mockRows = [
        {
          id: 'mem_123',
          conversation_id: 'test-conv',
          content: 'Hello',
          role: 'user',
          metadata: null,
          importance: 0.8,
          embedding: null,
          created_at: new Date('2023-01-01'),
          expires_at: null,
        },
        {
          id: 'mem_124',
          conversation_id: 'test-conv',
          content: 'Hi there',
          role: 'assistant',
          metadata: null,
          importance: 0.7,
          embedding: null,
          created_at: new Date('2023-01-02'),
          expires_at: null,
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const history = await memory.getHistory('test-conv');

      expect(history).toHaveLength(2);
      expect(history[0]?.content).toBe('Hello');
      expect(history[1]?.content).toBe('Hi there');
    });

    it('should handle empty conversation', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const history = await memory.getHistory('empty-conv');

      expect(history).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      await memory.getHistory('test-conv', 10);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $3'),
        expect.arrayContaining([10])
      );
    });

    it('should handle database errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Query failed'));

      await expect(memory.getHistory('test-conv')).rejects.toThrow('Query failed');
    });
  });

  describe('getRelevantContext', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should retrieve relevant context with semantic search', async () => {
      const mockRows = [
        {
          id: 'mem_123',
          conversation_id: 'test-conv',
          content: 'Relevant message',
          role: 'user',
          metadata: null,
          importance: 0.8,
          embedding: '[0.1, 0.2, 0.3]',
          created_at: new Date(),
          expires_at: null,
          distance: 0.5,
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const context = await memory.getRelevantContext('test-conv', 'search query', 1000);

      expect(context.messages).toHaveLength(1);
      expect(context.messages[0]?.content).toBe('Relevant message');
      expect(context.totalTokens).toBeGreaterThan(0);
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('search query');
    });

    it('should respect token limits', async () => {
      const mockRows = [
        {
          id: 'mem_123',
          conversation_id: 'test-conv',
          content: 'A'.repeat(1000),
          role: 'user',
          metadata: null,
          importance: 0.8,
          embedding: '[0.1, 0.2, 0.3]',
          created_at: new Date(),
          expires_at: null,
          distance: 0.5,
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const context = await memory.getRelevantContext('test-conv', 'search query', 100);

      expect(context.totalTokens).toBeLessThanOrEqual(100);
    });

    it('should handle embedding generation failure', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding failed'));

      await expect(memory.getRelevantContext('test-conv', 'query', 1000)).rejects.toThrow(
        'Embedding failed'
      );
    });
  });

  describe('compressMemories', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should compress eligible memories', async () => {
      const mockRows = [
        {
          id: 'mem_123',
          agent_id: 'test-agent',
          conversation_id: 'test-conv',
          content: 'Old message',
          role: 'user',
          metadata: null,
          importance: 0.5,
          embedding: null,
          created_at: timeUtils.daysAgo(7),
          expires_at: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockRows })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await memory.compressMemories();

      expect(result.agentId).toBe('test-agent');
      expect(result.memoriesProcessed).toBe(1);
    });

    it('should handle no eligible memories', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await memory.compressMemories();

      expect(result.memoriesCompressed).toBe(0);
      expect(result.compressionRatio).toBe(1.0);
    });

    it('should handle compression errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Compression failed'));

      await expect(memory.compressMemories()).rejects.toThrow('Compression failed');
    });
  });

  describe('error handling', () => {
    it('should handle connection validation', async () => {
      const ensureConnected = (memory as any).ensureConnected.bind(memory);
      expect(() => ensureConnected()).toThrow('not connected');
    });

    it('should handle invalid expiration formats', () => {
      const parseExpiration = (memory as any).parseExpiration.bind(memory);
      expect(parseExpiration('invalid')).toBeNull();
    });

    it('should handle malformed database rows', () => {
      const mapRowToMessage = (memory as any).mapRowToMessage.bind(memory);
      const invalidRow = { id: null, content: null };
      expect(() => mapRowToMessage(invalidRow)).toThrow(
        'Invalid database row: missing required fields'
      );
    });
  });

  describe('utility methods', () => {
    it('should generate unique IDs', () => {
      const generateId = (memory as any).generateId.bind(memory);
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).toMatch(/^mem_[A-Z0-9]{26}$/);
      expect(id2).toMatch(/^mem_[A-Z0-9]{26}$/);
      expect(id1).not.toBe(id2);
    });

    it('should count tokens accurately', () => {
      const countTokens = (memory as any).countTokens.bind(memory);

      expect(countTokens('')).toBe(0);
      expect(countTokens('Hello world')).toBeGreaterThan(1);
      expect(countTokens('A'.repeat(100))).toBeGreaterThan(10);
    });

    it('should parse expiration strings', () => {
      const parseExpiration = (memory as any).parseExpiration.bind(memory);

      const oneHour = parseExpiration('1h');
      expect(oneHour).toBeInstanceOf(Date);
      expect(oneHour.getTime()).toBeGreaterThan(Date.now());
    });

    it('should calculate relevance scores', () => {
      const calculateRelevanceScore = (memory as any).calculateRelevanceScore.bind(memory);

      const messages = [
        { importance: 0.8, content: 'test', conversation: 'conv', role: 'user' },
        { importance: 0.6, content: 'test', conversation: 'conv', role: 'user' },
        { importance: 0.9, content: 'test', conversation: 'conv', role: 'user' },
      ];

      const score = calculateRelevanceScore(messages);
      expect(score).toBeCloseTo(0.77, 1);
    });

    it('should map database rows to messages', () => {
      const mapRowToMessage = (memory as any).mapRowToMessage.bind(memory);

      const row = {
        id: 'mem_123',
        conversation_id: 'conv-123',
        content: 'Test message',
        role: 'user',
        metadata: '{"key": "value"}',
        importance: 0.8,
        embedding: '[0.1, 0.2, 0.3]',
        created_at: new Date(),
        expires_at: null,
      };

      const message = mapRowToMessage(row);

      expect(message.id).toBe('mem_123');
      expect(message.conversation).toBe('conv-123');
      expect(message.content).toBe('Test message');
      expect(message.role).toBe('user');
      expect(message.metadata).toEqual({ key: 'value' });
      expect(message.importance).toBe(0.8);
    });
  });

  describe('getRelevantContextWithCompression', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should retrieve enhanced context with raw memories and summaries', async () => {
      const mockMemoryRows = [
        {
          id: 'mem_123',
          agent_id: 'test-agent',
          conversation_id: 'conv-123',
          content: 'Raw memory content',
          role: 'user',
          metadata: '{}',
          importance: 0.8,
          embedding: '[0.1, 0.2, 0.3]',
          created_at: new Date(),
          expires_at: null,
          distance: 0.2,
        },
      ];

      const mockSummaryRows = [
        {
          id: 'sum_123',
          agent_id: 'test-agent',
          conversation_id: 'conv-123',
          time_window_start: new Date(),
          time_window_end: new Date(),
          time_window_label: null,
          original_memory_ids: ['mem_456'],
          summary_content: 'Summary content',
          key_topics: ['topic1'],
          important_entities: ['entity1'],
          compression_ratio: 0.5,
          token_count: 10,
          original_token_count: 20,
          embedding: '[0.1, 0.2, 0.3]',
          created_at: new Date(),
          metadata: null,
          distance: 0.3,
        },
      ];

      // getRelevantContextWithCompression calls getSemanticMemories and getRelevantSummaries
      // Each of these methods makes their own query
      mockClient.query
        .mockResolvedValueOnce({ rows: mockMemoryRows }) // getSemanticMemories
        .mockResolvedValueOnce({ rows: mockSummaryRows }); // getRelevantSummaries

      const context = await memory.getRelevantContextWithCompression('test query', 1000);

      expect(context.messages).toHaveLength(2); // 1 raw memory + 1 summary as system message
      expect(context.compressionInfo?.summariesIncluded).toBe(1);
      expect(context.compressionInfo?.rawMemoriesIncluded).toBe(1);
      expect(context.totalTokens).toBeGreaterThan(0);
      expect(context.relevanceScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty results', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // getSemanticMemories
        .mockResolvedValueOnce({ rows: [] }); // getRelevantSummaries

      const context = await memory.getRelevantContextWithCompression('test query', 1000);

      expect(context.messages).toHaveLength(0);
      expect(context.compressionInfo?.summariesIncluded).toBe(0);
      expect(context.compressionInfo?.rawMemoriesIncluded).toBe(0);
      expect(context.totalTokens).toBe(0);
    });
  });

  describe('summarizeConversationWindow', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should summarize conversation within time window', async () => {
      const memoryTimestamp = new Date('2024-01-01T08:00:00.000Z');
      const mockRows = [
        {
          id: 'mem_123',
          agent_id: 'test-agent',
          conversation_id: 'conv-123',
          content: 'Memory content',
          role: 'user',
          metadata: '{}',
          importance: 0.8,
          embedding: '[0.1, 0.2, 0.3]',
          created_at: memoryTimestamp,
          expires_at: null,
        },
      ];

      // summarizeConversationWindow makes one query to get memories in time window
      mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const timeWindow = {
        start: new Date(Date.now() - 86400000), // 1 day ago
        end: new Date(),
      };

      const summary = await memory.summarizeConversationWindow('conv-123', timeWindow);

      expect(summary.conversationId).toBe('conv-123');
      // The compression service calculates time window based on actual memory timestamps
      expect(summary.timeWindow.start.getTime()).toBe(memoryTimestamp.getTime());
      expect(summary.timeWindow.end.getTime()).toBe(memoryTimestamp.getTime());
    });

    it('should throw error for empty time window', async () => {
      // summarizeConversationWindow makes one query that returns empty results
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const timeWindow = {
        start: new Date(Date.now() - 86400000),
        end: new Date(),
      };

      await expect(memory.summarizeConversationWindow('empty-conv', timeWindow)).rejects.toThrow(
        'No memories found in time window'
      );
    });
  });

  describe('searchMemories', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should search memories with semantic similarity', async () => {
      const mockRows = [
        {
          id: 'mem_123',
          agent_id: 'test-agent',
          conversation_id: 'conv-123',
          content: 'Relevant content',
          role: 'user',
          metadata: '{}',
          importance: 0.8,
          embedding: '[0.1, 0.2, 0.3]',
          created_at: new Date(),
          expires_at: null,
          distance: 0.3,
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockRows });

      const results = await memory.searchMemories('search query');

      expect(results).toHaveLength(1);
      expect(results[0]?.content).toBe('Relevant content');
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('search query');
    });

    it('should search with filters', async () => {
      const filters = {
        conversation: 'conv-123',
        role: 'user' as const,
        limit: 10,
      };

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await memory.searchMemories('query', filters);

      // Check the query contains the filter conditions
      const calls = mockClient.query.mock.calls;
      const searchCall = calls.find(
        call => typeof call[0] === 'string' && call[0].includes('conversation_id')
      );
      expect(searchCall).toBeDefined();
      expect(searchCall?.[0]).toContain('conversation_id');
      expect(searchCall?.[0]).toContain('role');
      expect(searchCall?.[0]).toContain('LIMIT 10');
    });

    it('should handle search errors', async () => {
      mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding failed'));

      await expect(memory.searchMemories('query')).rejects.toThrow('Failed to search memories');
    });
  });

  describe('deleteMemory', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should delete existing memory', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 1 });

      await memory.deleteMemory('mem_123');

      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM'), [
        'mem_123',
        'test-agent',
      ]);
    });

    it('should throw error when memory not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(memory.deleteMemory('mem_nonexistent')).rejects.toThrow(
        "Memory with ID 'mem_nonexistent' not found"
      );
    });

    it('should handle database errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(memory.deleteMemory('mem_123')).rejects.toThrow('Failed to delete memory');
    });
  });

  describe('deleteConversation', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should delete all memories in conversation', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 5 });

      await memory.deleteConversation('conv-123');

      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM'), [
        'conv-123',
        'test-agent',
      ]);
    });

    it('should throw error when conversation not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(memory.deleteConversation('conv-nonexistent')).rejects.toThrow(
        "Conversation with ID 'conv-nonexistent' not found"
      );
    });

    it('should handle database errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Database error'));

      await expect(memory.deleteConversation('conv-123')).rejects.toThrow(
        'Failed to delete conversation'
      );
    });
  });

  describe('unimplemented methods', () => {
    beforeEach(async () => {
      await memory.initialize();
    });

    it('should reject shareMemoryBetweenAgents as not implemented', async () => {
      await expect(
        memory.shareMemoryBetweenAgents(['agent1', 'agent2'], 'conversation')
      ).rejects.toThrow('Memory sharing not yet implemented');
    });

    it('should reject getMemoryGraph as not implemented', async () => {
      await expect(memory.getMemoryGraph('conv-123')).rejects.toThrow(
        'Memory graph not yet implemented'
      );
    });

    it('should reject detectPatterns as not implemented', async () => {
      await expect(memory.detectPatterns('conv-123')).rejects.toThrow(
        'Pattern detection not yet implemented'
      );
    });
  });
});
