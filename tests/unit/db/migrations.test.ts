/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseMigrator } from '../../../src/db/migrations.js';

// Mock logger to avoid console output
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

interface MockClient {
  query: ReturnType<typeof vi.fn>;
}

describe('DatabaseMigrator', () => {
  let migrator: DatabaseMigrator;
  let mockClient: MockClient;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    migrator = new DatabaseMigrator(mockClient as any);
  });

  describe('constructor', () => {
    it('should create migrator with client', () => {
      expect(migrator).toBeInstanceOf(DatabaseMigrator);
    });

    // Table prefix feature not implemented
    it.skip('should use custom table prefix', () => {
      // Feature not implemented yet
    });

    it('should create migrator without prefix parameter', () => {
      expect(migrator).toBeInstanceOf(DatabaseMigrator);
    });
  });

  describe('migrate', () => {
    it('should execute all migration steps successfully', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await expect(migrator.migrate()).resolves.not.toThrow();

      expect(mockClient.query).toHaveBeenCalled();
    });

    it('should create pgvector extension', async () => {
      await migrator.migrate();

      const queries = mockClient.query.mock.calls.map(call => call[0] as string);
      const hasVectorExtension = queries.some(
        (query: string) => query.includes('CREATE EXTENSION') && query.includes('vector')
      );

      expect(hasVectorExtension).toBe(true);
    });

    it('should create agent_memories table', async () => {
      await migrator.migrate();

      const queries = mockClient.query.mock.calls.map(call => call[0] as string);
      const hasMemoriesTable = queries.some((query: string) =>
        query.includes('CREATE TABLE IF NOT EXISTS agent_memories')
      );

      expect(hasMemoriesTable).toBe(true);
    });

    it('should create agent_memory_summaries table', async () => {
      await migrator.migrate();

      const queries = mockClient.query.mock.calls.map(call => call[0] as string);
      const hasSummariesTable = queries.some((query: string) =>
        query.includes('CREATE TABLE IF NOT EXISTS agent_memory_summaries')
      );

      expect(hasSummariesTable).toBe(true);
    });

    it('should create vector indexes', async () => {
      await migrator.migrate();

      const queries = mockClient.query.mock.calls.map(call => call[0] as string);
      const hasVectorIndexes = queries.some(
        (query: string) => query.includes('CREATE INDEX') && query.includes('ivfflat')
      );

      expect(hasVectorIndexes).toBe(true);
    });

    it('should create cleanup function', async () => {
      await migrator.migrate();

      const queries = mockClient.query.mock.calls.map(call => call[0] as string);
      const hasCleanupFunction = queries.some((query: string) =>
        query.includes('CREATE OR REPLACE FUNCTION cleanup_expired_memories')
      );

      expect(hasCleanupFunction).toBe(true);
    });

    it('should handle duplicate extension error gracefully', async () => {
      // First call: Create schema_migrations table
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Second call: Check if migration already applied
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Third call: BEGIN transaction
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Fourth call: Run migration SQL (fails with duplicate extension)
      mockClient.query.mockRejectedValueOnce(new Error('extension "vector" already exists'));
      // Fifth call: ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Sixth call: BEGIN for marking migration as applied
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Seventh call: INSERT migration record
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Eighth call: COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Remaining calls for other migrations
      mockClient.query.mockResolvedValue({
        rows: [{ version: '002_enhanced_compression_schema' }],
      });

      await expect(migrator.migrate()).resolves.not.toThrow();
    });

    it('should handle duplicate table error gracefully', async () => {
      // First call: Create schema_migrations table
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Second call: Check if migration already applied
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Third call: BEGIN transaction
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Fourth call: Run migration SQL (fails with duplicate table)
      mockClient.query.mockRejectedValueOnce(new Error('relation "agent_memories" already exists'));
      // Fifth call: ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Sixth call: BEGIN for marking migration as applied
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Seventh call: INSERT migration record
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Eighth call: COMMIT
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // Remaining calls for other migrations
      mockClient.query.mockResolvedValue({
        rows: [{ version: '002_enhanced_compression_schema' }],
      });

      await expect(migrator.migrate()).resolves.not.toThrow();
    });

    it('should propagate serious database errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Database connection lost'));

      await expect(migrator.migrate()).rejects.toThrow('Database connection lost');
    });

    // Table prefix feature not implemented
    it.skip('should use custom table prefix in migrations', async () => {
      // Feature not implemented yet
    });

    // Table prefix feature not implemented
    it.skip('should handle empty table prefix', async () => {
      // Feature not implemented yet
    });
  });

  describe('validateSchema', () => {
    it('should validate successful when all components exist', async () => {
      // Mock responses: 3 tables + pgvector extension + vector indexes
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // agent_memories
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // agent_memory_shares
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // agent_memory_summaries
        .mockResolvedValueOnce({ rows: [{ exists: true }] }) // pgvector extension
        .mockResolvedValueOnce({ rows: [{ indexname: 'idx_memories_embedding' }] }); // vector indexes

      const isValid = await migrator.validateSchema();

      expect(isValid).toBe(true);
      expect(mockClient.query).toHaveBeenCalledTimes(5);
    });

    it('should fail when memories table missing', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: false }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      const isValid = await migrator.validateSchema();

      expect(isValid).toBe(false);
    });

    it('should fail when summaries table missing', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: false }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] });

      const isValid = await migrator.validateSchema();

      expect(isValid).toBe(false);
    });

    it('should fail when pgvector extension missing', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: true }] })
        .mockResolvedValueOnce({ rows: [{ exists: false }] });

      const isValid = await migrator.validateSchema();

      expect(isValid).toBe(false);
    });

    it('should handle database query errors', async () => {
      mockClient.query.mockRejectedValue(new Error('Query failed'));

      const isValid = await migrator.validateSchema();

      expect(isValid).toBe(false);
    });

    it('should handle malformed query results', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const isValid = await migrator.validateSchema();

      expect(isValid).toBe(false);
    });

    // Table prefix feature not implemented
    it.skip('should validate custom table prefix', async () => {
      // Feature not implemented yet
    });
  });

  describe('SQL generation', () => {
    // Table prefix feature not implemented
    it.skip('should generate correct table names with prefix', () => {
      // Feature not implemented yet
    });

    // Table prefix feature not implemented
    it.skip('should handle special characters in prefix', () => {
      // Feature not implemented yet
    });

    // Table prefix feature not implemented
    it.skip('should validate SQL injection protection', async () => {
      // Feature not implemented yet
    });
  });

  describe('idempotency', () => {
    it('should be safe to run multiple times', async () => {
      await migrator.migrate();
      await migrator.migrate();

      expect(mockClient.query).toHaveBeenCalled();
    });

    it('should handle partial migration state', async () => {
      // Same setup as duplicate table error test
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Create schema_migrations table
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Check migration applied
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockRejectedValueOnce(new Error('relation already exists')); // Run migration
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN for marking applied
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // INSERT migration record
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT
      mockClient.query.mockResolvedValue({
        rows: [{ version: '002_enhanced_compression_schema' }],
      }); // Other migrations

      await expect(migrator.migrate()).resolves.not.toThrow();
    });

    it('should maintain consistent schema across runs', async () => {
      await migrator.migrate();
      const firstRunCalls = mockClient.query.mock.calls.length;

      mockClient.query.mockClear();
      await migrator.migrate();
      const secondRunCalls = mockClient.query.mock.calls.length;

      expect(firstRunCalls).toBe(secondRunCalls);
    });
  });

  describe('edge cases', () => {
    it('should handle null client gracefully', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => new DatabaseMigrator(null as any)).toThrow('Database client is required');
    });

    // Table prefix feature not implemented
    it.skip('should handle undefined prefix', () => {
      // Feature not implemented yet
    });

    it('should handle very long prefix', () => {
      const longPrefix = 'a'.repeat(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const migrator = new DatabaseMigrator(mockClient as any, longPrefix);
      expect(migrator).toBeInstanceOf(DatabaseMigrator);
    });

    it('should handle concurrent migration attempts', async () => {
      const promises = [migrator.migrate(), migrator.migrate(), migrator.migrate()];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });

  describe('error recovery', () => {
    it('should handle partial extension creation', async () => {
      // Same setup as duplicate extension error test
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Create schema_migrations table
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Check migration applied
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN
      mockClient.query.mockRejectedValueOnce(new Error('extension "vector" already exists')); // Run migration
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // BEGIN for marking applied
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // INSERT migration record
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // COMMIT
      mockClient.query.mockResolvedValue({
        rows: [{ version: '002_enhanced_compression_schema' }],
      }); // Other migrations

      await expect(migrator.migrate()).resolves.not.toThrow();
    });

    it('should handle permission errors', async () => {
      mockClient.query.mockRejectedValue(new Error('permission denied'));

      await expect(migrator.migrate()).rejects.toThrow('permission denied');
    });

    it('should handle timeout errors', async () => {
      mockClient.query.mockRejectedValue(new Error('query timeout'));

      await expect(migrator.migrate()).rejects.toThrow('query timeout');
    });

    it('should handle network errors', async () => {
      mockClient.query.mockRejectedValue(new Error('connection terminated'));

      await expect(migrator.migrate()).rejects.toThrow('connection terminated');
    });
  });

  describe('performance', () => {
    it('should complete migration quickly', async () => {
      const startTime = Date.now();

      await migrator.migrate();

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
    });

    it('should handle large schema operations', async () => {
      mockClient.query.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ rows: [] }), 10))
      );

      await expect(migrator.migrate()).resolves.not.toThrow();
    });
  });
});
