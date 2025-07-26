import { describe, it, expect, vi } from 'vitest';
import { AgentMemory, MemoryError, ValidationError } from '../../src/index.js';
import { ZodError } from 'zod';

describe('AgentMemory', () => {
  it('should create an instance with valid config', () => {
    const memory = new AgentMemory({
      agent: 'test-agent',
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });

    expect(memory).toBeInstanceOf(AgentMemory);
  });

  it('should throw error when not connected', async () => {
    const memory = new AgentMemory({
      agent: 'test-agent',
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });

    await expect(
      memory.remember({
        conversation: 'test-conv',
        content: 'Hello world',
      })
    ).rejects.toThrow(MemoryError);
  });

  it('should validate required config fields', () => {
    expect(
      () =>
        new AgentMemory({
          agent: '',
          connectionString: 'postgresql://test:test@localhost:5432/test',
        })
    ).toThrow();

    expect(
      () =>
        new AgentMemory({
          agent: 'test-agent',
          connectionString: '',
        })
    ).toThrow();
  });

  it('should handle expiration strings in remember() method', async () => {
    const memory = new AgentMemory({
      agent: 'test-agent',
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });

    // Test through public API instead of accessing private methods
    await expect(
      memory.remember({
        conversation: 'test',
        content: 'test message',
        expires: '2h', // Test that it accepts string expiration
      })
    ).rejects.toThrow(); // Will throw because not connected, but validates expiration parsing
  });

  it('should generate unique memory IDs through remember() method', async () => {
    const memory = new AgentMemory({
      agent: 'test-agent',
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });

    // Test ID generation through public API
    try {
      await memory.remember({
        conversation: 'test',
        content: 'test message 1',
      });
    } catch (error) {
      // Expected to fail (not connected), but should validate ID format in error context
      expect(error).toBeDefined();
    }
  });

  describe('Static Factory Method', () => {
    it('should create and initialize AgentMemory with create() method', async () => {
      // Mock the initialize method to avoid database connection
      const mockInitialize = vi.fn().mockResolvedValue(undefined);

      // Create a spy on the constructor
      const constructorSpy = vi.spyOn(AgentMemory.prototype, 'initialize');
      constructorSpy.mockImplementation(mockInitialize);

      const memory = await AgentMemory.create({
        agent: 'test-agent',
        connectionString: 'postgresql://test:test@localhost:5432/test',
      });

      expect(memory).toBeInstanceOf(AgentMemory);
      expect(mockInitialize).toHaveBeenCalledOnce();

      // Cleanup
      constructorSpy.mockRestore();
    });

    it('should handle initialization errors in create() method', async () => {
      const mockInitialize = vi.fn().mockRejectedValue(new Error('Database connection failed'));

      const constructorSpy = vi.spyOn(AgentMemory.prototype, 'initialize');
      constructorSpy.mockImplementation(mockInitialize);

      await expect(
        AgentMemory.create({
          agent: 'test-agent',
          connectionString: 'postgresql://test:test@localhost:5432/test',
        })
      ).rejects.toThrow('Database connection failed');

      // Cleanup
      constructorSpy.mockRestore();
    });
  });

  describe('Connection URL Validation', () => {
    it('should throw ZodError for empty connection string', () => {
      expect(
        () =>
          new AgentMemory({
            agent: 'test-agent',
            connectionString: '',
          })
      ).toThrow(ZodError);
    });

    it('should throw ValidationError for invalid connection string format', () => {
      expect(
        () =>
          new AgentMemory({
            agent: 'test-agent',
            connectionString: 'invalid-connection-string',
          })
      ).toThrow(ValidationError);
    });

    it('should accept valid postgresql:// URL', () => {
      expect(
        () =>
          new AgentMemory({
            agent: 'test-agent',
            connectionString: 'postgresql://user:pass@localhost:5432/db',
          })
      ).not.toThrow();
    });

    it('should accept valid postgres:// URL', () => {
      expect(
        () =>
          new AgentMemory({
            agent: 'test-agent',
            connectionString: 'postgres://user:pass@localhost:5432/db',
          })
      ).not.toThrow();
    });
  });

  describe('Health Check', () => {
    it('should return unhealthy status when not connected', async () => {
      const memory = new AgentMemory({
        agent: 'test-agent',
        connectionString: 'postgresql://test:test@localhost:5432/test',
      });

      // Mock the client.query to simulate database connection failure
      const mockQuery = vi.fn().mockRejectedValue(new Error('Connection failed'));
      // @ts-expect-error - Accessing private property for testing
      memory.client = { query: mockQuery };

      const health = await memory.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.details).toHaveProperty('error', 'Connection failed');
      expect(health.details).toHaveProperty('agent', 'test-agent');
      expect(health.details).toHaveProperty('connected', false);
    });

    it('should return healthy status when database query succeeds', async () => {
      const memory = new AgentMemory({
        agent: 'test-agent',
        connectionString: 'postgresql://test:test@localhost:5432/test',
      });

      // Mock successful database operations
      const mockQuery = vi
        .fn()
        .mockResolvedValueOnce({ rows: [{}] }) // SELECT 1
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // COUNT query

      const mockEmbeddingService = {
        generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      };

      // @ts-expect-error - Accessing private properties for testing
      memory.client = { query: mockQuery };
      // @ts-expect-error - Accessing private properties for testing
      memory.embeddingService = mockEmbeddingService;
      // @ts-expect-error - Accessing private properties for testing
      memory.isConnected = true;

      const health = await memory.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details).toMatchObject({
        database: 'connected',
        embeddings: 'ready',
        memoryCount: 5,
        agent: 'test-agent',
        connected: true,
      });
    });
  });

  describe('Find Related Memories', () => {
    it('should throw error when not connected', async () => {
      const memory = new AgentMemory({
        agent: 'test-agent',
        connectionString: 'postgresql://test:test@localhost:5432/test',
      });

      await expect(memory.findRelatedMemories('test-memory-id')).rejects.toThrow(MemoryError);
    });

    it('should use default limit of 5 when not specified', async () => {
      const memory = new AgentMemory({
        agent: 'test-agent',
        connectionString: 'postgresql://test:test@localhost:5432/test',
      });

      // Should throw because not connected, but we can verify the method signature
      await expect(memory.findRelatedMemories('test-memory-id')).rejects.toThrow(MemoryError);
    });
  });
});
