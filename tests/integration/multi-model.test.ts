import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentMemory } from '../../src/memory/AgentMemory.js';
import { UniversalTokenizer } from '../../src/tokenization/UniversalTokenizer.js';
import type {
  MemoryConfig,
  ModelProviderConfig,
  Message,
  ModelProvider,
} from '../../src/types/index.js';
import { Client } from 'pg';
import { TIME_MS } from '../../src/utils/timeConstants.js';

// Skip integration tests if no database URL provided
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const shouldRunTests =
  DATABASE_URL &&
  DATABASE_URL !== 'postgresql://test:test@localhost:5432/test' &&
  !DATABASE_URL.includes('fake') &&
  !DATABASE_URL.includes('example');

describe.skipIf(!shouldRunTests)('Multi-Model Integration', () => {
  let client: Client;
  let memory: AgentMemory;
  let connectionString: string;

  beforeAll(async () => {
    if (!DATABASE_URL) return;

    connectionString = DATABASE_URL;
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    if (memory) {
      await memory.disconnect();
    }
    if (client) {
      // Clean up test data
      await client.query('DROP TABLE IF EXISTS agent_memories CASCADE');
      await client.query('DROP TABLE IF EXISTS agent_memory_shares CASCADE');
      await client.query('DROP TABLE IF EXISTS agent_memory_summaries CASCADE');
      await client.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
      await client.end();
    }
  });

  describe('AgentMemory with Multi-Model Configuration', () => {
    it('should initialize with single OpenAI provider (backward compatibility)', async () => {
      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-openai',
        connectionString,
        maxTokens: 4000,
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      // Should work with default OpenAI configuration
      const message: Message = {
        conversation: 'test-conv-1',
        content: 'Hello, this is a test message for OpenAI compatibility',
        role: 'user',
        importance: 0.8,
      };

      const memoryId = await memory.remember(message);
      expect(memoryId).toMatch(/^mem_[A-Z0-9]+$/);

      const context = await memory.recall({ conversation: 'test-conv-1' });
      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].content).toBe(message.content);
    });

    it('should initialize with multiple model providers', async () => {
      const providers: ModelProviderConfig[] = [
        {
          name: 'openai-gpt4',
          provider: 'openai',
          model: 'gpt-4',
          tokenLimits: { context: 8000, output: 2000 },
          tokenMultiplier: 1.0,
        },
        {
          name: 'anthropic-claude',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          tokenLimits: { context: 200000, output: 4000 },
          tokenMultiplier: 1.15,
        },
        {
          name: 'deepseek-chat',
          provider: 'deepseek',
          model: 'deepseek-chat',
          tokenLimits: { context: 32000, output: 4000 },
          tokenMultiplier: 0.85,
        },
      ];

      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-multimodel',
        connectionString,
        modelProviders: providers,
        defaultProvider: 'anthropic-claude',
        tokenCountingStrategy: 'hybrid',
        maxTokens: 8000,
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      // Test that memory operations work with multi-model setup
      const messages: Message[] = [
        {
          conversation: 'multi-model-conv',
          content: 'This message should be processed with Anthropic token counting',
          role: 'user',
          importance: 0.9,
        },
        {
          conversation: 'multi-model-conv',
          content: 'And this response should also use the Anthropic multiplier',
          role: 'assistant',
          importance: 0.8,
        },
      ];

      const memoryIds = [];
      for (const message of messages) {
        const id = await memory.remember(message);
        memoryIds.push(id);
      }

      expect(memoryIds).toHaveLength(2);

      const context = await memory.recall({ conversation: 'multi-model-conv' });
      expect(context.messages).toHaveLength(2);
      expect(context.totalTokens).toBeGreaterThan(0);
    });

    it('should handle token counting with different providers', async () => {
      const providers: ModelProviderConfig[] = [
        {
          name: 'openai-efficient',
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          tokenLimits: { context: 4000, output: 1000 },
          tokenMultiplier: 1.0,
        },
        {
          name: 'deepseek-efficient',
          provider: 'deepseek',
          model: 'deepseek-chat',
          tokenLimits: { context: 32000, output: 4000 },
          tokenMultiplier: 0.85, // 15% more efficient
        },
      ];

      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-tokens',
        connectionString,
        modelProviders: providers,
        defaultProvider: 'deepseek-efficient',
        tokenCountingStrategy: 'fast',
        maxTokens: 4000,
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      const testMessage = 'A'.repeat(1000); // 1000 character message

      const message: Message = {
        conversation: 'token-test-conv',
        content: testMessage,
        role: 'user',
        importance: 0.7,
      };

      await memory.remember(message);

      const context = await memory.recall({ conversation: 'token-test-conv' });

      // DeepSeek should count fewer tokens than OpenAI for the same text
      expect(context.totalTokens).toBeGreaterThan(0);
      expect(context.totalTokens).toBeLessThan(500); // Should be efficient due to 0.85 multiplier
    });

    it('should respect token limits with multi-model configuration', async () => {
      const providers: ModelProviderConfig[] = [
        {
          name: 'small-context',
          provider: 'custom',
          model: 'test-model',
          tokenLimits: { context: 100, output: 50 }, // Very small limits
          tokenMultiplier: 1.2,
        },
      ];

      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-limits',
        connectionString,
        modelProviders: providers,
        defaultProvider: 'small-context',
        maxTokens: 100, // Small limit for testing
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      // This should succeed (small message)
      const smallMessage: Message = {
        conversation: 'limit-test-conv',
        content: 'Small message',
        role: 'user',
        importance: 0.5,
      };

      await expect(memory.remember(smallMessage)).resolves.toMatch(/^mem_[A-Z0-9]+$/);

      // This should fail (large message exceeding token limit)
      const largeMessage: Message = {
        conversation: 'limit-test-conv',
        content: 'A'.repeat(2000), // Very large message
        role: 'user',
        importance: 0.5,
      };

      await expect(memory.remember(largeMessage)).rejects.toThrow('Token limit exceeded');
    });

    it('should handle semantic search with multi-model setup', async () => {
      const providers: ModelProviderConfig[] = [
        {
          name: 'search-provider',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          tokenLimits: { context: 200000, output: 4000 },
          tokenMultiplier: 1.15,
        },
      ];

      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-search',
        connectionString,
        modelProviders: providers,
        defaultProvider: 'search-provider',
        tokenCountingStrategy: 'hybrid',
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      // Add some test memories
      const memories = [
        {
          conversation: 'search-conv',
          content: 'I love programming in TypeScript',
          role: 'user' as const,
          importance: 0.8,
        },
        {
          conversation: 'search-conv',
          content: 'JavaScript is also a great language',
          role: 'user' as const,
          importance: 0.7,
        },
        {
          conversation: 'search-conv',
          content: 'Python is useful for data science',
          role: 'user' as const,
          importance: 0.6,
        },
      ];

      for (const msg of memories) {
        await memory.remember(msg);
      }

      // Search for programming-related content
      const searchResults = await memory.searchMemories('programming languages');

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults.some(msg => msg.content.includes('TypeScript'))).toBe(true);
    });

    it('should compress memories with multi-model token counting', async () => {
      const providers: ModelProviderConfig[] = [
        {
          name: 'compression-provider',
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          tokenLimits: { context: 4000, output: 1000 },
          tokenMultiplier: 1.0,
        },
      ];

      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-compression',
        connectionString,
        modelProviders: providers,
        defaultProvider: 'compression-provider',
        tokenCountingStrategy: 'fast',
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      // Add many memories to trigger compression
      const conversation = 'compression-test-conv';
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

      const MEMORY_COUNT = 10;
      const OLDEST_MEMORY_DAYS = 20;
      const BASE_IMPORTANCE = 0.3;
      const IMPORTANCE_INCREMENT = 0.05;

      for (let i = 0; i < MEMORY_COUNT; i++) {
        const timestampDaysAgo = new Date();
        timestampDaysAgo.setDate(timestampDaysAgo.getDate() - (OLDEST_MEMORY_DAYS - i)); // 20-11 days ago (older first)

        const message: Message = {
          conversation,
          content: `Old memory content ${i} with some details`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          importance: BASE_IMPORTANCE + i * IMPORTANCE_INCREMENT, // 0.3 to 0.75 importance
          timestamp: timestampDaysAgo,
        };
        await memory.remember(message);
      }

      // Verify memories were stored with old timestamps
      const storedMemories = await memory.recall({ conversation, limit: 20 });
      expect(storedMemories.messages).toHaveLength(MEMORY_COUNT);

      expect(storedMemories.messages[0].timestamp.getTime()).toBeLessThan(
        Date.now() - TIME_MS.WEEK
      );

      // Run compression
      const COMPRESSION_THRESHOLD_DAYS = 5;
      const compressionResult = await memory.compressMemories({
        strategy: 'time_based',
        timeThresholdDays: COMPRESSION_THRESHOLD_DAYS, // Compress memories older than 5 days
      });

      expect(compressionResult.memoriesProcessed).toBe(MEMORY_COUNT);
      expect(compressionResult.memoriesCompressed).toBeGreaterThan(0);
      expect(compressionResult.summariesCreated).toBeGreaterThan(0);
      expect(compressionResult.tokensReclaimed).toBeGreaterThan(0);
    });
  });

  describe('UniversalTokenizer Integration', () => {
    it('should work independently with various providers', async () => {
      const providers: ModelProviderConfig[] = [
        {
          name: 'test-openai',
          provider: 'openai',
          model: 'gpt-4',
          tokenLimits: { context: 8000, output: 2000 },
          tokenMultiplier: 1.0,
        },
        {
          name: 'test-anthropic',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          tokenLimits: { context: 200000, output: 4000 },
          tokenMultiplier: 1.15,
        },
        {
          name: 'test-deepseek',
          provider: 'deepseek',
          model: 'deepseek-chat',
          tokenLimits: { context: 32000, output: 4000 },
          tokenMultiplier: 0.85,
        },
      ];

      const tokenizer = new UniversalTokenizer(providers, 'hybrid');
      const testText = 'This is a comprehensive test message for multi-model token counting';

      // Test each provider
      for (const provider of providers) {
        const result = await tokenizer.countTokens(testText, { provider: provider.name });

        expect(result.tokens).toBeGreaterThan(0);
        expect(result.provider).toBe(provider.provider);
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      }

      // Test estimation for all providers
      const estimations = providers.map(p => ({
        provider: p.provider,
        tokens: tokenizer.estimateTokens(testText, p.provider),
      }));

      // Verify relative token counts based on multipliers
      const openaiTokens = estimations.find(e => e.provider === 'openai')?.tokens ?? 0;
      const anthropicTokens = estimations.find(e => e.provider === 'anthropic')?.tokens ?? 0;
      const deepseekTokens = estimations.find(e => e.provider === 'deepseek')?.tokens ?? 0;

      expect(anthropicTokens).toBeGreaterThan(openaiTokens); // 1.14x multiplier
      expect(deepseekTokens).toBeGreaterThan(openaiTokens); // 1.2x multiplier
    });

    it('should work independently with various providers', async () => {
      const providers: ModelProviderConfig[] = [
        {
          name: 'test-openai',
          provider: 'openai',
          model: 'gpt-4',
          tokenLimits: { context: 8000, output: 2000 },
          tokenMultiplier: 1.0,
        },
        {
          name: 'test-anthropic',
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          tokenLimits: { context: 200000, output: 4000 },
          tokenMultiplier: 1.15,
        },
        {
          name: 'test-deepseek',
          provider: 'deepseek',
          model: 'deepseek-chat',
          tokenLimits: { context: 32000, output: 4000 },
          tokenMultiplier: 0.85,
        },
      ];

      const tokenizer = new UniversalTokenizer(providers, 'hybrid');
      const testText = 'This is a comprehensive test message for multi-model token counting';

      // Test each provider
      for (const provider of providers) {
        const result = await tokenizer.countTokens(testText, { provider: provider.name });

        expect(result.tokens).toBeGreaterThan(0);
        expect(result.provider).toBe(provider.provider);
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      }

      // Test estimation for all providers
      const estimations = providers.map(p => ({
        provider: p.provider,
        tokens: tokenizer.estimateTokens(testText, p.provider),
      }));

      // Verify relative token counts based on multipliers
      const openaiTokens = estimations.find(e => e.provider === 'openai')?.tokens ?? 0;
      const anthropicTokens = estimations.find(e => e.provider === 'anthropic')?.tokens ?? 0;
      const deepseekTokens = estimations.find(e => e.provider === 'deepseek')?.tokens ?? 0;

      expect(anthropicTokens).toBeGreaterThan(openaiTokens); // 1.14x multiplier
      expect(deepseekTokens).toBeGreaterThan(openaiTokens); // 1.2x multiplier
    });
  });

  describe('Configuration Validation', () => {
    it('should validate model provider configurations', () => {
      // Invalid provider type should throw error
      const invalidConfig = {
        agent: 'test-agent-invalid',
        connectionString,
        modelProviders: [
          {
            name: 'invalid-provider',
            provider: 'invalid-type' as ModelProvider, // Invalid provider type
            model: 'test-model',
            tokenLimits: { context: 4000, output: 1000 },
          },
        ],
      };

      expect(() => new AgentMemory(invalidConfig)).toThrow();
    });

    it('should handle missing default provider gracefully', async () => {
      const providers: ModelProviderConfig[] = [
        {
          name: 'only-provider',
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          tokenLimits: { context: 4000, output: 1000 },
          tokenMultiplier: 1.0,
        },
      ];

      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-no-default',
        connectionString,
        modelProviders: providers,
        // No defaultProvider specified
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      // Should still work by using the first available provider
      const message: Message = {
        conversation: 'no-default-conv',
        content: 'Test message without default provider',
        role: 'user',
        importance: 0.7,
      };

      const memoryId = await memory.remember(message);
      expect(memoryId).toMatch(/^mem_[A-Z0-9]+$/);
    });

    it('should handle empty providers array', async () => {
      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-empty',
        connectionString,
        modelProviders: [], // Empty array
        tokenCountingStrategy: 'fast',
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      // Should fall back to default OpenAI configuration
      const message: Message = {
        conversation: 'empty-providers-conv',
        content: 'Test with empty providers array',
        role: 'user',
        importance: 0.5,
      };

      const memoryId = await memory.remember(message);
      expect(memoryId).toMatch(/^mem_[A-Z0-9]+$/);
    });
  });

  describe('Performance with Multiple Providers', () => {
    it('should maintain performance with multiple providers configured', async () => {
      const providers: ModelProviderConfig[] = Array.from({ length: 10 }, (_, i) => ({
        name: `perf-provider-${i}`,
        provider: (i % 3 === 0
          ? 'openai'
          : i % 3 === 1
            ? 'anthropic'
            : 'deepseek') as ModelProvider,
        model: 'test-model',
        tokenLimits: { context: 4000, output: 1000 },
        tokenMultiplier: 1.0 + i * 0.1,
      }));

      const config: Partial<MemoryConfig> = {
        agent: 'test-agent-performance',
        connectionString,
        modelProviders: providers,
        defaultProvider: 'perf-provider-0',
        tokenCountingStrategy: 'fast',
      };

      memory = new AgentMemory(config);
      await memory.initialize();

      const startTime = Date.now();

      // Add multiple memories rapidly
      const promises = Array.from({ length: 20 }, (_, i) =>
        memory.remember({
          conversation: 'perf-test-conv',
          content: `Performance test message ${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          importance: 0.5,
        })
      );

      await Promise.all(promises);

      const duration = Date.now() - startTime;

      // Should complete all operations reasonably quickly
      expect(duration).toBeLessThan(5000); // 5 seconds for 20 operations

      // Verify all memories were stored
      const context = await memory.recall({ conversation: 'perf-test-conv' });
      expect(context.messages).toHaveLength(20);
    });
  });
});
