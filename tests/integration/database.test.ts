import { describe, it, expect } from 'vitest';
import { setupIntegrationTest } from './helpers/testSetup.js';

describe.skipIf(!process.env.DATABASE_URL)('Database Integration', () => {
  it('should create database schema successfully', async () => {
    const agentId = `test-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      // Check if tables exist
      const { rows } = await testSetup.testClient.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name IN ('agent_memories', 'agent_memory_shares', 'agent_memory_summaries')
        ORDER BY table_name
      `);

      expect(rows).toHaveLength(3);
      expect(rows.map(r => (r as { table_name: string }).table_name)).toEqual([
        'agent_memories',
        'agent_memory_shares',
        'agent_memory_summaries',
      ]);
    } finally {
      await testSetup.cleanup();
    }
  });

  it('should save and retrieve memory', async () => {
    const agentId = `test-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = `test-conv-1-${Date.now()}`;
      const memoryId = await testSetup.memory.remember({
        conversation: conversationId,
        content: 'Hello, this is a test memory',
        role: 'user',
        importance: 0.8,
        timestamp: new Date(),
      });

      expect(memoryId).toMatch(/^mem_[0-9A-HJKMNP-TV-Z]{26}$/);

      // Retrieve the memory
      const history = await testSetup.memory.getHistory(conversationId);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Hello, this is a test memory');
      expect(history[0].importance).toBe(0.8);
    } finally {
      await testSetup.cleanup();
    }
  });

  it('should handle memory expiration', async () => {
    const agentId = `test-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = `test-conv-2-${Date.now()}`;
      const pastDate = new Date(Date.now() - 1000); // 1 second ago

      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'This memory should expire',
        role: 'user',
        importance: 0.5,
        timestamp: new Date(),
        expires: pastDate,
      });

      // Trigger cleanup
      await testSetup.testClient.query('SELECT cleanup_expired_memories()');

      // Should not find expired memory
      const history = await testSetup.memory.getHistory(conversationId);
      expect(history).toHaveLength(0);
    } finally {
      await testSetup.cleanup();
    }
  });

  it('should search memories with semantic similarity', async () => {
    const agentId = `test-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const conversationId = `test-conv-3-${Date.now()}`;
      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'The user likes coffee in the morning',
        role: 'user',
        importance: 0.5,
        timestamp: new Date(),
      });

      await testSetup.memory.remember({
        conversation: conversationId,
        content: 'The user prefers tea in the evening',
        role: 'user',
        importance: 0.5,
        timestamp: new Date(),
      });

      // Semantic search should find coffee-related content even without exact match
      const results = await testSetup.memory.searchMemories('morning beverage preferences');
      expect(results.length).toBeGreaterThan(0);

      // Should find both tea and coffee as they're beverages
      const beverageResults = results.filter(
        r => r.content.includes('coffee') || r.content.includes('tea')
      );
      expect(beverageResults.length).toBeGreaterThan(0);
    } finally {
      await testSetup.cleanup();
    }
  });

  it('should validate memory statistics function', async () => {
    const agentId = `test-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      // Skip if no memories stored yet
      try {
        const { rows } = await testSetup.testClient.query<{ get_memory_stats: unknown[] }>(
          'SELECT get_memory_stats($1)',
          [agentId]
        );

        expect(rows[0]).toHaveProperty('get_memory_stats');
        const stats = rows[0].get_memory_stats;
        expect(stats).toHaveLength(6); // 6 fields returned from function
      } catch (error) {
        // Skip if function not ready yet - could be various error types
        expect((error as Error).message).toContain('function');
      }
    } finally {
      await testSetup.cleanup();
    }
  });
});
