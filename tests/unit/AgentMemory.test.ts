import { describe, it, expect } from 'vitest';
import { AgentMemory, MemoryError } from '../../src/index.js';

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

  it('should parse expiration strings correctly', () => {
    const memory = new AgentMemory({
      agent: 'test-agent',
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });

    // Access private method through type assertion for testing
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const parseExpiration = (memory as any).parseExpiration.bind(memory);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    expect(parseExpiration(undefined)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    expect(parseExpiration(null)).toBeNull();

    const date = new Date();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    expect(parseExpiration(date)).toBe(date);

    // Test relative time parsing
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const hourResult = parseExpiration('2h');
    expect(hourResult).toBeInstanceOf(Date);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const dayResult = parseExpiration('7d');
    expect(dayResult).toBeInstanceOf(Date);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const weekResult = parseExpiration('2w');
    expect(weekResult).toBeInstanceOf(Date);
  });

  it('should generate unique IDs', () => {
    const memory = new AgentMemory({
      agent: 'test-agent',
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });

    // Access private method through type assertion for testing
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const generateId = (memory as any).generateId.bind(memory);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const id1 = generateId();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const id2 = generateId();

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^mem_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
