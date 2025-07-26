import { describe, it, expect } from 'vitest';
import { AgentMemory } from '../../src/memory/AgentMemory.js';
import { UniversalTokenizer } from '../../src/tokenization/UniversalTokenizer.js';
import type {
  MemoryConfig,
  ModelProviderConfig,
  Message,
  ModelProvider,
} from '../../src/types/index.js';
import { setupIntegrationTest } from './helpers/testSetup.js';
import { TIME_MS } from '../../src/utils/timeConstants.js';

describe.skipIf(!process.env.DATABASE_URL)('Multi-Model Integration', () => {
  const connectionString = process.env.DATABASE_URL!;

  describe('AgentMemory with Multi-Model Configuration', () => {
    it('should initialize with single OpenAI provider (backward compatibility)', async () => {
      const agentId = `test-agent-openai-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
        const config: Partial<MemoryConfig> = {
          agent: agentId,
          connectionString,
          maxTokens: 4000,
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        // Should work with default OpenAI configuration
        const message: Message = {
          conversation: 'test-conv-1',
          content: 'Hello, this is a test message for OpenAI compatibility',
          role: 'user',
          importance: 0.8,
          timestamp: new Date(),
        };

        const memoryId = await memory.remember(message);
        expect(memoryId).toMatch(/^mem_[A-Z0-9]+$/);

        const context = await memory.recall({ conversation: 'test-conv-1' });
        expect(context.messages).toHaveLength(1);
        expect(context.messages[0].content).toBe(message.content);

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
    });

    it('should initialize with multiple model providers', async () => {
      const agentId = `test-agent-multimodel-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
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
          agent: agentId,
          connectionString,
          modelProviders: providers,
          defaultProvider: 'anthropic-claude',
          tokenCountingStrategy: 'hybrid',
          maxTokens: 8000,
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        // Test that memory operations work with multi-model setup
        const conversationId = `multi-model-conv-${Date.now()}`;
        const messages: Message[] = [
          {
            conversation: conversationId,
            content: 'This message should be processed with Anthropic token counting',
            role: 'user',
            importance: 0.9,
            timestamp: new Date(),
          },
          {
            conversation: conversationId,
            content: 'And this response should also use the Anthropic multiplier',
            role: 'assistant',
            importance: 0.8,
            timestamp: new Date(),
          },
        ];

        const memoryIds: string[] = [];
        for (const message of messages) {
          const id = await memory.remember(message);
          memoryIds.push(id);
        }

        expect(memoryIds).toHaveLength(2);

        const context = await memory.recall({ conversation: conversationId });
        expect(context.messages).toHaveLength(2);
        expect(context.totalTokens).toBeGreaterThan(0);

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
    });

    it('should handle token counting with different providers', async () => {
      const agentId = `test-agent-tokens-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
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
          agent: agentId,
          connectionString,
          modelProviders: providers,
          defaultProvider: 'deepseek-efficient',
          tokenCountingStrategy: 'fast',
          maxTokens: 4000,
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        const testMessage = 'A'.repeat(1000); // 1000 character message
        const conversationId = `token-test-conv-${Date.now()}`;

        const message: Message = {
          conversation: conversationId,
          content: testMessage,
          role: 'user',
          importance: 0.7,
          timestamp: new Date(),
        };

        await memory.remember(message);

        const context = await memory.recall({ conversation: conversationId });

        // DeepSeek should count fewer tokens than OpenAI for the same text
        expect(context.totalTokens).toBeGreaterThan(0);
        expect(context.totalTokens).toBeLessThan(500); // Should be efficient due to 0.85 multiplier

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
    });

    it('should respect token limits with multi-model configuration', async () => {
      const agentId = `test-agent-limits-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
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
          agent: agentId,
          connectionString,
          modelProviders: providers,
          defaultProvider: 'small-context',
          maxTokens: 100, // Small limit for testing
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        // This should succeed (small message)
        const conversationId = `limit-test-conv-${Date.now()}`;
        const smallMessage: Message = {
          conversation: conversationId,
          content: 'Small message',
          role: 'user',
          importance: 0.5,
          timestamp: new Date(),
        };

        await expect(memory.remember(smallMessage)).resolves.toMatch(/^mem_[A-Z0-9]+$/);

        // This should fail (large message exceeding token limit)
        const largeMessage: Message = {
          conversation: conversationId,
          content: 'A'.repeat(2000), // Very large message
          role: 'user',
          importance: 0.5,
          timestamp: new Date(),
        };

        await expect(memory.remember(largeMessage)).rejects.toThrow('Token limit exceeded');

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
    });

    it('should handle semantic search with multi-model setup', async () => {
      const agentId = `test-agent-search-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
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
          agent: agentId,
          connectionString,
          modelProviders: providers,
          defaultProvider: 'search-provider',
          tokenCountingStrategy: 'hybrid',
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        // Add some test memories
        const conversationId = `search-conv-${Date.now()}`;
        const memories = [
          {
            conversation: conversationId,
            content: 'I love programming in TypeScript',
            role: 'user' as const,
            importance: 0.8,
            timestamp: new Date(),
          },
          {
            conversation: conversationId,
            content: 'JavaScript is also a great language',
            role: 'user' as const,
            importance: 0.7,
            timestamp: new Date(),
          },
          {
            conversation: conversationId,
            content: 'Python is useful for data science',
            role: 'user' as const,
            importance: 0.6,
            timestamp: new Date(),
          },
        ];

        for (const msg of memories) {
          await memory.remember(msg);
        }

        // Search for programming-related content
        const searchResults = await memory.searchMemories('programming languages');

        expect(searchResults.length).toBeGreaterThan(0);
        expect(searchResults.some(msg => msg.content.includes('TypeScript'))).toBe(true);

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
    });

    it('should compress memories with multi-model token counting', async () => {
      const agentId = `test-agent-compression-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
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
          agent: agentId,
          connectionString,
          modelProviders: providers,
          defaultProvider: 'compression-provider',
          tokenCountingStrategy: 'fast',
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        // Add many memories to trigger compression
        const conversation = `compression-test-conv-${Date.now()}`;
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
          preserveRecentCount: 2, // Only preserve 2 most recent memories
        });

        expect(compressionResult.memoriesProcessed).toBe(MEMORY_COUNT);
        expect(compressionResult.memoriesCompressed).toBeGreaterThan(0);
        expect(compressionResult.summariesCreated).toBeGreaterThan(0);
        expect(compressionResult.tokensReclaimed).toBeGreaterThan(0);

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
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
            tokenMultiplier: 1.0,
          },
        ],
      };

      expect(() => new AgentMemory(invalidConfig)).toThrow();
    });

    it('should handle missing default provider gracefully', async () => {
      const agentId = `test-agent-no-default-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
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
          agent: agentId,
          connectionString,
          modelProviders: providers,
          // No defaultProvider specified
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        // Should still work by using the first available provider
        const conversationId = `no-default-conv-${Date.now()}`;
        const message: Message = {
          conversation: conversationId,
          content: 'Test message without default provider',
          role: 'user',
          importance: 0.7,
          timestamp: new Date(),
        };

        const memoryId = await memory.remember(message);
        expect(memoryId).toMatch(/^mem_[A-Z0-9]+$/);

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
    });

    it('should handle empty providers array', async () => {
      const agentId = `test-agent-empty-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
        const config: Partial<MemoryConfig> = {
          agent: agentId,
          connectionString,
          modelProviders: [], // Empty array
          tokenCountingStrategy: 'fast',
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        // Should fall back to default OpenAI configuration
        const conversationId = `empty-providers-conv-${Date.now()}`;
        const message: Message = {
          conversation: conversationId,
          content: 'Test with empty providers array',
          role: 'user',
          importance: 0.5,
          timestamp: new Date(),
        };

        const memoryId = await memory.remember(message);
        expect(memoryId).toMatch(/^mem_[A-Z0-9]+$/);

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
    });
  });

  describe('Performance with Multiple Providers', () => {
    it('should maintain performance with multiple providers configured', async () => {
      const agentId = `test-agent-performance-${Date.now()}`;
      const testSetup = await setupIntegrationTest(agentId);

      try {
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
          agent: agentId,
          connectionString,
          modelProviders: providers,
          defaultProvider: 'perf-provider-0',
          tokenCountingStrategy: 'fast',
        };

        const memory = new AgentMemory(config);
        await memory.initialize();

        const startTime = Date.now();

        // Add multiple memories rapidly
        const conversationId = `perf-test-conv-${Date.now()}`;
        const promises = Array.from({ length: 20 }, (_, i) =>
          memory.remember({
            conversation: conversationId,
            content: `Performance test message ${i}`,
            role: i % 2 === 0 ? 'user' : 'assistant',
            importance: 0.5,
            timestamp: new Date(),
          })
        );

        await Promise.all(promises);

        const duration = Date.now() - startTime;

        // Should complete all operations reasonably quickly
        expect(duration).toBeLessThan(5000); // 5 seconds for 20 operations

        // Verify all memories were stored
        const context = await memory.recall({ conversation: conversationId });
        expect(context.messages).toHaveLength(20);

        await memory.disconnect();
      } finally {
        await testSetup.cleanup();
      }
    });
  });
});
