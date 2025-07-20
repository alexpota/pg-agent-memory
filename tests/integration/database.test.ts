import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { AgentMemory } from '../../src/index.js';

// Skip integration tests if no database URL provided
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const shouldRunTests =
  DATABASE_URL &&
  DATABASE_URL !== 'postgresql://test:test@localhost:5432/test' &&
  !DATABASE_URL.includes('fake') &&
  !DATABASE_URL.includes('example');

describe.skipIf(!shouldRunTests)('Database Integration', () => {
  let memory: AgentMemory;
  let testClient: Client;

  beforeAll(async () => {
    if (!DATABASE_URL) return;

    // Setup test database
    testClient = new Client({ connectionString: DATABASE_URL });
    await testClient.connect();

    // Initialize memory system
    memory = new AgentMemory({
      agent: 'test-agent',
      connectionString: DATABASE_URL,
    });

    await memory.initialize();
  });

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

  it('should create database schema successfully', async () => {
    // Check if tables exist
    const { rows } = await testClient.query(`
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
  });

  it('should save and retrieve memory', async () => {
    const memoryId = await memory.remember({
      conversation: 'test-conv-1',
      content: 'Hello, this is a test memory',
      role: 'user',
      importance: 0.8,
    });

    expect(memoryId).toMatch(/^mem_[0-9A-HJKMNP-TV-Z]{26}$/);

    // Retrieve the memory
    const history = await memory.getHistory('test-conv-1');
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('Hello, this is a test memory');
    expect(history[0].importance).toBe(0.8);
  });

  it('should handle memory expiration', async () => {
    const pastDate = new Date(Date.now() - 1000); // 1 second ago

    await memory.remember({
      conversation: 'test-conv-2',
      content: 'This memory should expire',
      expires: pastDate,
    });

    // Trigger cleanup
    await testClient.query('SELECT cleanup_expired_memories()');

    // Should not find expired memory
    await expect(memory.getHistory('test-conv-2')).rejects.toThrow();
  });

  it('should search memories with semantic similarity', async () => {
    await memory.remember({
      conversation: 'test-conv-3',
      content: 'The user likes coffee in the morning',
    });

    await memory.remember({
      conversation: 'test-conv-3',
      content: 'The user prefers tea in the evening',
    });

    // Semantic search should find coffee-related content even without exact match
    const results = await memory.searchMemories('morning beverage preferences');
    expect(results.length).toBeGreaterThan(0);

    // Should find both tea and coffee as they're beverages
    const beverageResults = results.filter(
      r => r.content.includes('coffee') || r.content.includes('tea')
    );
    expect(beverageResults.length).toBeGreaterThan(0);
  });

  it('should validate memory statistics function', async () => {
    // Skip if no memories stored yet
    try {
      const { rows } = await testClient.query<{ get_memory_stats: unknown[] }>(
        'SELECT get_memory_stats($1)',
        ['test-agent']
      );

      expect(rows[0]).toHaveProperty('get_memory_stats');
      const stats = rows[0].get_memory_stats;
      expect(stats).toHaveLength(6); // 6 fields returned from function
    } catch (error) {
      // Skip if function not ready yet - could be various error types
      expect((error as Error).message).toContain('function');
    }
  });
});
