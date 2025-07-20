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
    const parseExpiration = (
      memory as unknown as { parseExpiration: (expires?: Date | string | null) => Date | null }
    ).parseExpiration.bind(memory);

    expect(parseExpiration(undefined)).toBeNull();
    expect(parseExpiration(null)).toBeNull();

    const date = new Date();
    expect(parseExpiration(date)).toBe(date);

    // Test relative time parsing
    const hourResult = parseExpiration('2h');
    expect(hourResult).toBeInstanceOf(Date);

    const dayResult = parseExpiration('7d');
    expect(dayResult).toBeInstanceOf(Date);

    const weekResult = parseExpiration('2w');
    expect(weekResult).toBeInstanceOf(Date);
  });

  it('should generate unique IDs', () => {
    const memory = new AgentMemory({
      agent: 'test-agent',
      connectionString: 'postgresql://test:test@localhost:5432/test',
    });

    // Access private method through type assertion for testing
    const generateId = (memory as unknown as { generateId: () => string }).generateId.bind(memory);

    const id1 = generateId();
    const id2 = generateId();

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^mem_[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
