import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { AgentMemory } from '../../src/memory/AgentMemory.js';

// Skip integration tests if no database URL provided
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const shouldRunTests =
  DATABASE_URL &&
  DATABASE_URL !== 'postgresql://test:test@localhost:5432/test' &&
  !DATABASE_URL.includes('fake') &&
  !DATABASE_URL.includes('example');

describe.skipIf(!shouldRunTests)('Memory Compression Integration', () => {
  let memory: AgentMemory;
  let testClient: Client;

  beforeAll(async () => {
    if (!DATABASE_URL) return;

    // Setup test database
    testClient = new Client({ connectionString: DATABASE_URL });
    await testClient.connect();

    // Initialize memory system
    memory = new AgentMemory({
      agent: 'test-compression-agent',
      connectionString: DATABASE_URL,
    });

    await memory.initialize();
  }, 30000);

  afterAll(async () => {
    if (memory) {
      await memory.disconnect();
    }
    if (testClient) {
      // Clean up test data
      await testClient.query('DROP TABLE IF EXISTS agent_memories CASCADE');
      await testClient.query('DROP TABLE IF EXISTS agent_memory_shares CASCADE');
      await testClient.query('DROP TABLE IF EXISTS agent_memory_summaries CASCADE');
      await testClient.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
      await testClient.end();
    }
  });

  it('should compress old memories in conversation', async () => {
    const conversationId = 'compression-test-1';

    // Add several memories to the conversation
    const memoryIds = [];
    for (let i = 0; i < 10; i++) {
      const id = await memory.remember({
        conversation: conversationId,
        content: `Memory ${i}: User mentioned preference for ${i % 2 === 0 ? 'coffee' : 'tea'} at ${8 + i}:00 AM`,
        importance: 0.5 + (i % 3) * 0.2,
        // Make them old (more than 7 days ago)
        timestamp: new Date(Date.now() - (8 + i) * 24 * 60 * 60 * 1000),
      });
      memoryIds.push(id);
    }

    // Add one recent memory that should not be compressed
    const recentId = await memory.remember({
      conversation: conversationId,
      content: 'Recent memory that should be preserved',
      importance: 0.8,
      timestamp: new Date(), // Today
    });

    // Verify memories exist
    const beforeHistory = await memory.getHistory(conversationId, 20);
    expect(beforeHistory.length).toBe(11);

    // Compress old memories
    await memory.summarizeOldConversations(conversationId);

    // Verify old memories were compressed
    const afterHistory = await memory.getHistory(conversationId, 20);
    expect(afterHistory.length).toBe(1); // Only recent memory should remain
    expect(afterHistory[0]?.id).toBe(recentId);

    // Verify summary was created
    const { rows: summaryRows } = await testClient.query(
      'SELECT * FROM agent_memory_summaries WHERE agent_id = $1 AND conversation_id = $2',
      ['test-compression-agent', conversationId]
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
  });

  it('should provide enhanced context with compression information', async () => {
    const conversationId = 'compression-test-2';

    // Add memories and compress some
    for (let i = 0; i < 5; i++) {
      await memory.remember({
        conversation: conversationId,
        content: `Old memory ${i}: Discussion about project requirements and specifications`,
        importance: 0.6,
        timestamp: new Date(Date.now() - (i + 10) * 24 * 60 * 60 * 1000),
      });
    }

    // Add recent memories
    await memory.remember({
      conversation: conversationId,
      content: 'Recent memory about project timeline and deliverables',
      importance: 0.8,
      timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    });

    // Compress old memories
    await memory.summarizeOldConversations(conversationId);

    // Get enhanced context
    const context = await memory.getRelevantContextWithCompression(
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
  });

  it('should perform bulk memory compression', async () => {
    const conversationId = 'compression-test-3';

    // Add many memories across different importance levels
    for (let i = 0; i < 15; i++) {
      await memory.remember({
        conversation: conversationId,
        content: `Memory ${i}: Various topics including ${i % 3 === 0 ? 'meetings' : i % 3 === 1 ? 'projects' : 'preferences'}`,
        importance: 0.2 + (i % 5) * 0.15, // Varied importance: 0.2 to 0.8
        timestamp: new Date(Date.now() - (i + 5) * 24 * 60 * 60 * 1000),
      });
    }

    // Compress memories using hybrid strategy
    const result = await memory.compressMemories({
      strategy: 'hybrid',
      preserveRecentCount: 3,
      importanceThreshold: 0.5,
    });

    expect(result).toHaveProperty('agentId', 'test-compression-agent');
    expect(result).toHaveProperty('strategy', 'hybrid');
    expect(result.memoriesProcessed).toBe(15);
    expect(result.memoriesCompressed).toBeGreaterThan(0);
    expect(result.memoriesPreserved).toBeGreaterThan(0);
    expect(result.memoriesCompressed + result.memoriesPreserved).toBe(15);
    expect(result.compressionRatio).toBeGreaterThan(0);
    expect(result.compressionRatio).toBeLessThan(1);
    expect(result.tokensReclaimed).toBeGreaterThan(0);
    expect(result.summariesCreated).toBeGreaterThan(0);
    expect(result.processingTimeMs).toBeGreaterThan(0);
  });

  it('should create conversation window summaries', async () => {
    const conversationId = 'compression-test-4';
    const startTime = new Date('2024-01-15T09:00:00Z');
    const endTime = new Date('2024-01-15T12:00:00Z');

    // Add memories within specific time window
    for (let i = 0; i < 5; i++) {
      await memory.remember({
        conversation: conversationId,
        content: `Morning meeting discussion ${i}: Planning and coordination topics`,
        importance: 0.7,
        timestamp: new Date(startTime.getTime() + i * 30 * 60 * 1000), // 30 minutes apart
      });
    }

    // Add memory outside the window
    await memory.remember({
      conversation: conversationId,
      content: 'Afternoon followup that should not be included',
      importance: 0.6,
      timestamp: new Date('2024-01-15T14:00:00Z'),
    });

    const summary = await memory.summarizeConversationWindow(conversationId, {
      start: startTime,
      end: endTime,
      label: 'morning_meeting',
    });

    expect(summary.conversationId).toBe(conversationId);
    expect(summary.timeWindow.start).toEqual(startTime);
    expect(summary.timeWindow.end).toEqual(endTime);
    expect(summary.timeWindow.label).toBe('morning_meeting');
    expect(summary.originalMemoryIds).toHaveLength(5); // Only memories in time window
    expect(summary.summaryContent).toContain('meeting');
    expect(summary.keyTopics.length).toBeGreaterThan(0);
    expect(summary.compressionRatio).toBeLessThan(1);
  });

  it('should provide compression statistics', async () => {
    // First ensure we have some data and compression has occurred
    const conversationId = 'compression-test-5';

    // Add memories
    for (let i = 0; i < 8; i++) {
      await memory.remember({
        conversation: conversationId,
        content: `Test memory ${i} with substantial content for compression testing`,
        importance: 0.4 + i * 0.1,
        timestamp: new Date(Date.now() - (i + 15) * 24 * 60 * 60 * 1000),
      });
    }

    // Compress some memories
    await memory.compressMemories({
      strategy: 'importance_based',
      importanceThreshold: 0.6,
      preserveRecentCount: 2,
    });

    const stats = await memory.getCompressionStats();

    expect(stats.agentId).toBe('test-compression-agent');
    expect(stats.totalMemories).toBeGreaterThan(0);
    expect(stats.rawMemories).toBeGreaterThan(0);
    expect(stats.compressedMemories).toBeGreaterThanOrEqual(0);
    expect(stats.summaries).toBeGreaterThanOrEqual(0);
    expect(stats.totalTokens).toBeGreaterThan(0);
    expect(stats.rawTokens).toBeGreaterThan(0);
    expect(stats.compressedTokens).toBeGreaterThanOrEqual(0);
    expect(stats.compressionRatio).toBeGreaterThanOrEqual(0);
    expect(stats.compressionRatio).toBeLessThanOrEqual(1);
    expect(stats.storageEfficiency).toBeGreaterThanOrEqual(0);
    expect(stats.storageEfficiency).toBeLessThanOrEqual(100);

    if (stats.summaries > 0) {
      expect(stats.lastCompressionAt).toBeDefined();
      expect(stats.nextCompressionEligible).toBeDefined();
    }
  });

  it('should handle compression with no eligible memories', async () => {
    // Create a fresh agent with only recent memories
    const freshMemory = new AgentMemory({
      agent: 'test-compression-agent-fresh',
      connectionString: DATABASE_URL!,
    });

    await freshMemory.initialize();

    try {
      // Add only recent memories
      await freshMemory.remember({
        conversation: 'fresh-test',
        content: 'Very recent memory',
        importance: 0.9,
        timestamp: new Date(),
      });

      const result = await freshMemory.compressMemories({
        strategy: 'time_based',
        timeThresholdDays: 30, // Only compress memories older than 30 days
      });

      expect(result.memoriesCompressed).toBe(0);
      expect(result.memoriesPreserved).toBe(1);
      expect(result.summariesCreated).toBe(0);
      expect(result.tokensReclaimed).toBe(0);
      expect(result.compressionRatio).toBe(1.0);
    } finally {
      await freshMemory.disconnect();
    }
  });

  it('should integrate with semantic search after compression', async () => {
    const conversationId = 'compression-test-6';

    // Add memories about different topics
    await memory.remember({
      conversation: conversationId,
      content: 'User loves Italian cuisine and pasta dishes',
      importance: 0.5,
      timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    });

    await memory.remember({
      conversation: conversationId,
      content: 'Discussion about favorite coffee brewing methods',
      importance: 0.4,
      timestamp: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
    });

    await memory.remember({
      conversation: conversationId,
      content: 'User mentioned preference for outdoor activities',
      importance: 0.6,
      timestamp: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000),
    });

    // Compress old memories
    await memory.summarizeOldConversations(conversationId);

    // Search should still find relevant content in summaries
    const searchResults = await memory.searchMemories('Italian food preferences');

    expect(searchResults.length).toBeGreaterThan(0);

    // The search might return summary content instead of original memories
    const hasRelevantContent = searchResults.some(
      result =>
        result.content.toLowerCase().includes('italian') ||
        result.content.toLowerCase().includes('pasta') ||
        result.content.toLowerCase().includes('cuisine')
    );

    expect(hasRelevantContent).toBe(true);
  });
});
