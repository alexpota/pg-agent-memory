import { describe, it, expect, beforeEach } from 'vitest';
import { CompressionService } from '../../src/compression/CompressionService.js';
import { Message, CompressionConfig } from '../../src/types/index.js';

describe('CompressionService', () => {
  let compressionService: CompressionService;
  let testMemories: Message[];

  beforeEach(() => {
    compressionService = new CompressionService();

    // Create test memories with different importance levels and timestamps
    testMemories = [
      {
        id: 'mem_1',
        conversation: 'test-conv-1',
        content: 'User prefers coffee over tea in the morning',
        role: 'user',
        importance: 0.8,
        timestamp: new Date('2024-01-01T08:00:00Z'),
      },
      {
        id: 'mem_2',
        conversation: 'test-conv-1',
        content: 'Assistant recommends Italian blend for coffee',
        role: 'assistant',
        importance: 0.6,
        timestamp: new Date('2024-01-01T08:05:00Z'),
      },
      {
        id: 'mem_3',
        conversation: 'test-conv-1',
        content: 'User mentioned having a meeting at 2 PM',
        role: 'user',
        importance: 0.4,
        timestamp: new Date('2024-01-01T08:10:00Z'),
      },
      {
        id: 'mem_4',
        conversation: 'test-conv-1',
        content: 'Random weather comment about sunny day',
        role: 'user',
        importance: 0.2,
        timestamp: new Date('2024-01-01T08:15:00Z'),
      },
      {
        id: 'mem_5',
        conversation: 'test-conv-1',
        content: 'User confirmed preference for espresso specifically',
        role: 'user',
        importance: 0.9,
        timestamp: new Date('2024-01-01T08:20:00Z'),
      },
    ];
  });

  describe('analyzeCompressionCandidates', () => {
    it('should identify compression candidates correctly', () => {
      const analysis = compressionService.analyzeCompressionCandidates(testMemories, 'test-agent');

      expect(analysis).toHaveProperty('eligible');
      expect(analysis).toHaveProperty('preserved');
      expect(analysis).toHaveProperty('tokenAnalysis');

      // Should preserve most recent memories (default: 50)
      expect(analysis.preserved.length).toBeGreaterThan(0);
      expect(analysis.eligible.length).toBeGreaterThanOrEqual(0);

      // Token analysis should have valid numbers
      expect(analysis.tokenAnalysis.total).toBeGreaterThan(0);
      expect(analysis.tokenAnalysis.eligible).toBeGreaterThanOrEqual(0);
      expect(analysis.tokenAnalysis.preserved).toBeGreaterThan(0);
      expect(analysis.tokenAnalysis.projectedSavings).toBeGreaterThanOrEqual(0);
    });

    it('should preserve recent memories based on configuration', () => {
      const config: Partial<CompressionConfig> = {
        preserveRecentCount: 2,
      };
      const customService = new CompressionService(config);

      const analysis = customService.analyzeCompressionCandidates(testMemories, 'test-agent');

      expect(analysis.preserved.length).toBe(2);
      expect(analysis.eligible.length).toBe(3);

      // Should preserve the 2 most recent memories
      expect(analysis.preserved[0]?.id).toBe('mem_4'); // Second most recent
      expect(analysis.preserved[1]?.id).toBe('mem_5'); // Most recent
    });

    it('should handle importance-based filtering', () => {
      const config: Partial<CompressionConfig> = {
        strategy: 'importance_based',
        importanceThreshold: 0.5,
        preserveRecentCount: 1,
      };
      const customService = new CompressionService(config);

      const analysis = customService.analyzeCompressionCandidates(testMemories, 'test-agent');

      // Should mark low-importance memories as eligible for compression
      const lowImportanceMemories = analysis.eligible.filter(m => m.importance < 0.5);
      expect(lowImportanceMemories.length).toBeGreaterThan(0);
    });

    it('should handle time-based filtering', () => {
      const config: Partial<CompressionConfig> = {
        strategy: 'time_based',
        timeThresholdDays: 0.001, // Very short threshold (about 1.4 minutes) to test filtering
        preserveRecentCount: 1,
      };
      const customService = new CompressionService(config);

      const analysis = customService.analyzeCompressionCandidates(testMemories, 'test-agent');

      // All old memories should be eligible for compression
      expect(analysis.eligible.length).toBe(4); // All but the most recent
    });
  });

  describe('compressMemories', () => {
    it('should compress memories into a summary', () => {
      const summary = compressionService.compressMemories(
        testMemories,
        'test-agent',
        'test-conv-1'
      );

      expect(summary).toHaveProperty('id');
      expect(summary).toHaveProperty('agentId', 'test-agent');
      expect(summary).toHaveProperty('conversationId', 'test-conv-1');
      expect(summary).toHaveProperty('summaryContent');
      expect(summary).toHaveProperty('keyTopics');
      expect(summary).toHaveProperty('importantEntities');
      expect(summary).toHaveProperty('compressionRatio');
      expect(summary).toHaveProperty('tokenCount');
      expect(summary).toHaveProperty('originalTokenCount');
      expect(summary).toHaveProperty('timeWindow');
      expect(summary).toHaveProperty('originalMemoryIds');

      // Validate basic properties
      expect(summary.agentId).toBe('test-agent');
      expect(summary.conversationId).toBe('test-conv-1');
      expect(summary.summaryContent).toBeTruthy();
      expect(summary.originalMemoryIds).toHaveLength(testMemories.length);
      expect(summary.compressionRatio).toBeGreaterThan(0);
      expect(summary.compressionRatio).toBeLessThanOrEqual(1);
      expect(summary.tokenCount).toBeLessThanOrEqual(summary.originalTokenCount);
    });

    it('should extract key topics from memories', () => {
      const summary = compressionService.compressMemories(
        testMemories,
        'test-agent',
        'test-conv-1'
      );

      expect(summary.keyTopics).toBeInstanceOf(Array);
      expect(summary.keyTopics.length).toBeGreaterThan(0);

      // Should contain relevant topics from the content
      const topicsString = summary.keyTopics.join(' ').toLowerCase();
      expect(topicsString).toMatch(/coffee|meeting|weather|espresso/);
    });

    it('should extract important entities', () => {
      const memoriesWithEntities = [
        {
          id: 'mem_1',
          conversation: 'test-conv-1',
          content: 'User John Smith prefers meeting at Starbucks Coffee on Market Street',
          role: 'user' as const,
          importance: 0.8,
          timestamp: new Date('2024-01-01T08:00:00Z'),
        },
        {
          id: 'mem_2',
          conversation: 'test-conv-1',
          content: 'Assistant suggests Tuesday morning at 10 AM for the meeting',
          role: 'assistant' as const,
          importance: 0.7,
          timestamp: new Date('2024-01-01T08:05:00Z'),
        },
      ];

      const summary = compressionService.compressMemories(
        memoriesWithEntities,
        'test-agent',
        'test-conv-1'
      );

      expect(summary.importantEntities).toBeInstanceOf(Array);
      expect(summary.importantEntities.length).toBeGreaterThan(0);

      // Should extract capitalized entities
      const entitiesString = summary.importantEntities.join(' ');
      expect(entitiesString).toMatch(/John|Smith|Starbucks|Market|Street|Tuesday|Assistant/);
    });

    it('should calculate compression metrics correctly', () => {
      const summary = compressionService.compressMemories(
        testMemories,
        'test-agent',
        'test-conv-1'
      );

      expect(summary.tokenCount).toBeGreaterThan(0);
      expect(summary.originalTokenCount).toBeGreaterThan(0);
      expect(summary.originalTokenCount).toBeGreaterThan(summary.tokenCount);
      expect(summary.compressionRatio).toBe(summary.tokenCount / summary.originalTokenCount);
      expect(summary.compressionRatio).toBeLessThan(1);
    });

    it('should set correct time window', () => {
      const summary = compressionService.compressMemories(
        testMemories,
        'test-agent',
        'test-conv-1'
      );

      expect(summary.timeWindow.start).toEqual(new Date('2024-01-01T08:00:00Z'));
      expect(summary.timeWindow.end).toEqual(new Date('2024-01-01T08:20:00Z'));
    });

    it('should include metadata about compression', () => {
      const summary = compressionService.compressMemories(
        testMemories,
        'test-agent',
        'test-conv-1'
      );

      expect(summary.metadata).toBeDefined();
      expect(summary.metadata).toHaveProperty('compressionStrategy');
      expect(summary.metadata).toHaveProperty('originalMemoryCount', testMemories.length);
      expect(summary.metadata).toHaveProperty('processingTimeMs');
      expect(typeof summary.metadata?.processingTimeMs).toBe('number');
    });

    it('should throw error for empty memory set', () => {
      expect(() => {
        compressionService.compressMemories([], 'test-agent', 'test-conv-1');
      }).toThrow('Cannot compress empty memory set');
    });
  });

  describe('configuration handling', () => {
    it('should use default configuration values', () => {
      const defaultService = new CompressionService();
      const analysis = defaultService.analyzeCompressionCandidates(testMemories, 'test-agent');

      // Should preserve default count (50)
      expect(analysis.preserved.length).toBe(Math.min(50, testMemories.length));
    });

    it('should respect custom configuration', () => {
      const config: Partial<CompressionConfig> = {
        strategy: 'token_based',
        maxTokensBeforeCompression: 100,
        compressionRatio: 0.5,
        preserveRecentCount: 3,
      };
      const customService = new CompressionService(config);

      const analysis = customService.analyzeCompressionCandidates(testMemories, 'test-agent');
      expect(analysis.preserved.length).toBe(3);
    });

    it('should validate configuration with Zod schema', () => {
      // Invalid configuration should use defaults
      const invalidConfig = {
        strategy: 'invalid_strategy' as CompressionConfig['strategy'],
        compressionRatio: 2.0, // Invalid (> 1)
        preserveRecentCount: -1, // Invalid (< 0)
      };

      expect(() => {
        new CompressionService(invalidConfig);
      }).toThrow(); // Should throw validation error
    });
  });

  describe('edge cases', () => {
    it('should handle single memory', () => {
      const singleMemory = [testMemories[0]!];
      const summary = compressionService.compressMemories(
        singleMemory,
        'test-agent',
        'test-conv-1'
      );

      expect(summary.originalMemoryIds).toHaveLength(1);
      expect(summary.timeWindow.start).toEqual(summary.timeWindow.end);
    });

    it('should handle memories with missing conversation IDs', () => {
      const memoriesWithoutConv = testMemories.map(m => ({ ...m, conversation: '' }));
      const summary = compressionService.compressMemories(memoriesWithoutConv, 'test-agent');

      expect(summary.conversationId).toBe('mixed'); // Default for mixed conversations
    });

    it('should handle memories with extreme importance values', () => {
      const extremeMemories = [
        { ...testMemories[0]!, importance: 0 },
        { ...testMemories[1]!, importance: 1 },
      ];

      const summary = compressionService.compressMemories(
        extremeMemories,
        'test-agent',
        'test-conv-1'
      );
      expect(summary).toBeDefined();
      expect(summary.summaryContent).toBeTruthy();
    });
  });

  describe('performance considerations', () => {
    it('should complete compression within reasonable time', () => {
      const startTime = Date.now();
      compressionService.compressMemories(testMemories, 'test-agent', 'test-conv-1');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle large memory sets efficiently', () => {
      // Create 100 test memories
      const largeMemorySet: Message[] = Array.from({ length: 100 }, (_, i) => ({
        id: `mem_${i}`,
        conversation: 'test-conv-large',
        content: `Memory content ${i} with some meaningful text about various topics`,
        role: 'user' as const,
        importance: Math.random(),
        timestamp: new Date(Date.now() - i * 60000), // 1 minute apart
      }));

      const startTime = Date.now();
      const summary = compressionService.compressMemories(
        largeMemorySet,
        'test-agent',
        'test-conv-large'
      );
      const endTime = Date.now();

      expect(summary).toBeDefined();
      expect(summary.originalMemoryIds).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(summary.compressionRatio).toBeLessThan(1);
    });
  });
});
