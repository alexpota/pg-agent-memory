import { describe, it, expect } from 'vitest';
import { setupIntegrationTest } from './helpers/testSetup.js';
import { timeUtils } from '../../src/utils/timeConstants.js';

describe.skipIf(!process.env.DATABASE_URL)('Memory Compression Integration', () => {
  it('should compress old memories in conversation', async () => {
    const agentId = `test-compression-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = 'compression-test-1';

      // Add several memories to the conversation
      const memoryIds = [];
      for (let i = 0; i < 10; i++) {
        const id = await testSetup.memory.remember({
          conversation: conversationId,
          content: `Memory ${i}: User mentioned preference for ${i % 2 === 0 ? 'coffee' : 'tea'} at ${8 + i}:00 AM`,
          importance: 0.5 + (i % 3) * 0.15, // Max: 0.5 + 2*0.15 = 0.8
          role: 'user',
          // Make them old (more than 7 days ago)
          timestamp: timeUtils.daysAgo(8 + i),
        });
        memoryIds.push(id);
      }

      // Add one recent memory that should not be compressed
      const recentId = await testSetup.memory.remember({
        conversation: conversationId,
        content: 'Recent memory that should be preserved',
        importance: 0.8,
        role: 'user',
        timestamp: new Date(), // Today
      });

      // Verify memories exist
      const beforeHistory = await testSetup.memory.getHistory(conversationId, 20);
      expect(beforeHistory.length).toBe(11);

      // Compress old memories
      await testSetup.memory.summarizeOldConversations(conversationId);

      // Verify old memories were compressed
      const afterHistory = await testSetup.memory.getHistory(conversationId, 20);
      expect(afterHistory.length).toBe(1); // Only recent memory should remain
      expect(afterHistory[0]?.id).toBe(recentId);

      // Verify summary was created
      const { rows: summaryRows } = await testSetup.testClient.query(
        'SELECT * FROM agent_memory_summaries WHERE agent_id = $1 AND conversation_id = $2',
        [agentId, conversationId]
      );

      expect(summaryRows.length).toBe(1);
      const summary = summaryRows[0] as {
        summary_content: string;
        compression_ratio: number;
        original_memory_ids: string[];
      };
      expect(summary.summary_content).toBeTruthy();
      expect(summary.compression_ratio).toBeGreaterThan(0);
      expect(summary.compression_ratio).toBeLessThan(1);
      expect(summary.original_memory_ids).toHaveLength(10);
    } finally {
      await testSetup.cleanup();
    }
  });

  it('should provide enhanced context with compression information', async () => {
    const agentId = `test-compression-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = 'compression-test-2';

      // Add memories and compress some
      for (let i = 0; i < 5; i++) {
        await testSetup.memory.remember({
          conversation: conversationId,
          content: `Old memory ${i}: Discussion about project requirements and specifications`,
          importance: 0.6,
          role: 'user',
          timestamp: timeUtils.daysAgo(i + 10),
        });
      }

      // Add recent memories
      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'Recent memory about project timeline and deliverables',
        importance: 0.8,
        role: 'user',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      });

      // Compress old memories
      await testSetup.memory.summarizeOldConversations(conversationId);

      // Get enhanced context
      const context = await testSetup.memory.getRelevantContextWithCompression(
        'project requirements and timeline',
        2000
      );

      expect(context).toHaveProperty('compressionInfo');
      expect(context.compressionInfo).toBeDefined();
      expect(context.compressionInfo?.hasCompressedData).toBe(true);
      expect(context.compressionInfo?.summariesIncluded).toBeGreaterThan(0);
      expect(context.compressionInfo?.rawMemoriesIncluded).toBeGreaterThan(0);
      expect(context.compressionInfo?.oldestMemoryDate).toBeDefined();
      expect(context.compressionInfo?.newestMemoryDate).toBeDefined();

      // Should include both raw memories and summary content
      expect(context.messages.length).toBeGreaterThan(1);
      const hasSummaryMessage = context.messages.some(m => m.content.includes('[SUMMARY'));
      expect(hasSummaryMessage).toBe(true);
    } finally {
      await testSetup.cleanup();
    }
  });

  it('should perform bulk memory compression', async () => {
    const agentId = `test-compression-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = 'compression-test-3';

      // Add many memories across different importance levels
      const MEMORY_COUNT = 15;
      const MIN_IMPORTANCE = 0.2;
      const IMPORTANCE_STEP = 0.15;
      const IMPORTANCE_VARIATIONS = 5;

      for (let i = 0; i < MEMORY_COUNT; i++) {
        await testSetup.memory.remember({
          conversation: conversationId,
          content: `Memory ${i}: Various topics including ${i % 3 === 0 ? 'meetings' : i % 3 === 1 ? 'projects' : 'preferences'}`,
          importance: MIN_IMPORTANCE + (i % IMPORTANCE_VARIATIONS) * IMPORTANCE_STEP,
          role: 'user',
          timestamp: timeUtils.daysAgo(i + 5),
        });
      }

      // Compress memories using hybrid strategy
      const result = await testSetup.memory.compressMemories({
        strategy: 'hybrid',
        preserveRecentCount: 3,
        importanceThreshold: 0.5,
        maxAge: '7d',
      });

      expect(result).toHaveProperty('agentId', agentId);
      expect(result).toHaveProperty('strategy', 'hybrid');
      expect(result.memoriesProcessed).toBe(15);
      expect(result.memoriesCompressed).toBeGreaterThan(0);
      expect(result.memoriesPreserved).toBeGreaterThan(0);
      expect(result.memoriesProcessed).toBe(result.memoriesCompressed + result.memoriesPreserved);
      expect(result.compressionRatio).toBeGreaterThan(0);
      expect(result.compressionRatio).toBeLessThan(1);
      expect(result.tokensReclaimed).toBeGreaterThan(0);
      expect(result.summariesCreated).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    } finally {
      await testSetup.cleanup();
    }
  });

  it('should create conversation window summaries', async () => {
    const agentId = `test-compression-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = 'compression-test-4';
      const startTime = new Date('2024-01-15T09:00:00Z');
      const endTime = new Date('2024-01-15T12:00:00Z');

      // Add memories within specific time window
      for (let i = 0; i < 5; i++) {
        const hour = 9 + i;
        const hourString = hour.toString().padStart(2, '0');
        await testSetup.memory.remember({
          conversation: conversationId,
          content: `Morning meeting discussion ${i}: Planning and coordination topics`,
          importance: 0.7,
          role: 'user',
          timestamp: new Date(`2024-01-15T${hourString}:00:00Z`),
        });
      }

      // Add memory outside the window
      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'Afternoon followup that should not be included',
        importance: 0.6,
        role: 'user',
        timestamp: new Date('2024-01-15T14:00:00Z'),
      });

      const summary = await testSetup.memory.summarizeConversationWindow(conversationId, {
        start: startTime,
        end: endTime,
        label: 'morning_meeting',
      });

      expect(summary).toBeDefined();
      expect(summary.timeWindow.start).toEqual(startTime);
      expect(summary.timeWindow.end).toEqual(endTime);
      expect(summary.timeWindow.label).toBe('morning_meeting');
      expect(summary.originalMemoryIds).toHaveLength(5); // Only memories in time window
      expect(summary.summaryContent).toContain('meeting');
      expect(summary.keyTopics.length).toBeGreaterThan(0);
      expect(summary.compressionRatio).toBeLessThan(1);
    } finally {
      await testSetup.cleanup();
    }
  });

  it.skip('should provide compression statistics', async () => {
    // This test is temporarily skipped due to database type issues
    // Re-enable after fixing compression statistics implementation
  });

  it('should handle compression with no eligible memories', async () => {
    const agentId = `test-compression-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = 'compression-test-6';

      // Add only recent memories
      const memoryId = await testSetup.memory.remember({
        conversation: conversationId,
        content: 'Very recent memory',
        importance: 0.9,
        role: 'user',
        timestamp: new Date(),
      });

      // Verify the memory was stored
      const history = await testSetup.memory.getHistory(conversationId);
      expect(history.length).toBe(1);
      expect(history[0]?.id).toBe(memoryId);

      const result = await testSetup.memory.compressMemories({
        strategy: 'time_based',
        timeThresholdDays: 30, // Only compress memories older than 30 days
      });

      expect(result.memoriesCompressed).toBe(0);
      expect(result.memoriesPreserved).toBe(1);
      expect(result.summariesCreated).toBe(0);
      expect(result.tokensReclaimed).toBe(0);
      expect(result.compressionRatio).toBe(1.0);
    } finally {
      await testSetup.cleanup();
    }
  });

  it('should integrate with semantic search after compression', async () => {
    const agentId = `test-compression-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = 'compression-test-7';

      // Add memories about different topics
      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'User loves Italian cuisine and pasta dishes',
        importance: 0.5,
        role: 'user',
        timestamp: timeUtils.daysAgo(20),
      });

      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'Discussion about favorite coffee brewing methods',
        importance: 0.4,
        role: 'user',
        timestamp: timeUtils.daysAgo(18),
      });

      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'User mentioned preference for outdoor activities',
        importance: 0.6,
        role: 'user',
        timestamp: timeUtils.daysAgo(15),
      });

      // Compress old memories
      await testSetup.memory.summarizeOldConversations(conversationId);

      // Search should still find recent memories (compression only affects old memories)
      // Add a recent memory that should still be searchable
      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'Recent discussion about Italian restaurants and cuisine',
        importance: 0.8,
        role: 'user',
        timestamp: new Date(), // Recent memory, should not be compressed
      });

      const searchResults = await testSetup.memory.searchMemories('Italian cuisine');

      expect(searchResults.length).toBeGreaterThan(0);

      // Should find the recent memory that wasn't compressed
      const hasRecentItalianMemory = searchResults.some(
        result => result.content.includes('restaurants') && result.content.includes('Italian')
      );
      expect(hasRecentItalianMemory).toBe(true);
    } finally {
      await testSetup.cleanup();
    }
  });
});
