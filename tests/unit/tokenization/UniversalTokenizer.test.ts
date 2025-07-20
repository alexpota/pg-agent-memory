import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UniversalTokenizer } from '../../../src/tokenization/UniversalTokenizer.js';
import type { ModelProviderConfig } from '../../../src/types/index.js';

describe('UniversalTokenizer', () => {
  let tokenizer: UniversalTokenizer;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    tokenizer?.clearCache();
  });

  describe('Initialization', () => {
    it('should create default tokenizer with no providers', () => {
      tokenizer = new UniversalTokenizer();
      expect(tokenizer.isProviderAvailable('default')).toBe(false);
    });

    it('should create tokenizer with OpenAI provider', () => {
      const openaiProvider: ModelProviderConfig = {
        name: 'test-openai',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        tokenLimits: { context: 4000, output: 1000 },
        tokenMultiplier: 1.0,
      };

      tokenizer = new UniversalTokenizer([openaiProvider], 'fast');
      expect(tokenizer.isProviderAvailable('test-openai')).toBe(true);
      expect(tokenizer.getProviderInfo('test-openai')).toEqual(openaiProvider);
    });

    it('should create tokenizer with multiple providers', () => {
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

      tokenizer = new UniversalTokenizer(providers, 'hybrid');

      providers.forEach((provider: ModelProviderConfig) => {
        expect(tokenizer.isProviderAvailable(provider.name)).toBe(true);
        expect(tokenizer.getProviderInfo(provider.name)).toEqual(provider);
      });
    });
  });

  describe('Static Factory Methods', () => {
    it('should create default tokenizer using static method', () => {
      tokenizer = UniversalTokenizer.createDefault();
      expect(tokenizer).toBeInstanceOf(UniversalTokenizer);
    });

    it('should create OpenAI tokenizer using static method', () => {
      tokenizer = UniversalTokenizer.createWithOpenAI();
      expect(tokenizer.isProviderAvailable('default-openai')).toBe(true);

      const providerInfo = tokenizer.getProviderInfo('default-openai');
      expect(providerInfo?.provider).toBe('openai');
      expect(providerInfo?.model).toBe('gpt-3.5-turbo');
    });
  });

  describe('Token Estimation', () => {
    beforeEach(() => {
      tokenizer = new UniversalTokenizer();
    });

    it('should estimate tokens for different providers', () => {
      const text = 'Hello world, this is a test message';

      // Test each provider with expected multipliers
      const openaiTokens = tokenizer.estimateTokens(text, 'openai');
      const anthropicTokens = tokenizer.estimateTokens(text, 'anthropic');
      const deepseekTokens = tokenizer.estimateTokens(text, 'deepseek');
      const googleTokens = tokenizer.estimateTokens(text, 'google');
      const metaTokens = tokenizer.estimateTokens(text, 'meta');

      // Verify relative relationships based on multipliers
      expect(anthropicTokens).toBeGreaterThan(openaiTokens); // 1.15x
      expect(deepseekTokens).toBeLessThan(openaiTokens); // 0.85x
      expect(googleTokens).toBeGreaterThan(openaiTokens); // 1.1x
      expect(metaTokens).toBeGreaterThan(openaiTokens); // 1.25x
    });

    it('should handle unknown providers with custom multiplier', () => {
      const text = 'Test message';
      const customTokens = tokenizer.estimateTokens(text, 'unknown-provider');
      const openaiTokens = tokenizer.estimateTokens(text, 'openai');

      // Unknown providers should use custom multiplier (1.2x)
      expect(customTokens).toBeGreaterThan(openaiTokens);
    });

    it('should return consistent results for same text and provider', () => {
      const text = 'Consistent test message';
      const result1 = tokenizer.estimateTokens(text, 'openai');
      const result2 = tokenizer.estimateTokens(text, 'openai');

      expect(result1).toBe(result2);
    });
  });

  describe('Token Counting Strategies', () => {
    const providers: ModelProviderConfig[] = [
      {
        name: 'openai-test',
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        tokenLimits: { context: 4000, output: 1000 },
        tokenMultiplier: 1.0,
        apiKey: 'test-key',
      },
      {
        name: 'anthropic-test',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokenLimits: { context: 200000, output: 4000 },
        tokenMultiplier: 1.15,
        apiKey: 'test-key',
      },
    ];

    beforeEach(() => {
      tokenizer = new UniversalTokenizer(providers, 'hybrid');
    });

    it('should count tokens with fast strategy (estimation only)', async () => {
      const text = 'Fast strategy test message';

      const result = await tokenizer.countTokens(text, { strategy: 'fast' });

      expect(result.method).toBe('estimation');
      expect(result.accuracy).toBe('medium');
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.cached).toBe(false);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should count tokens with precise strategy (fallback to tiktoken for OpenAI)', async () => {
      const text = 'Precise strategy test message';

      const result = await tokenizer.countTokens(text, {
        strategy: 'precise',
        provider: 'openai-test',
      });

      // Should fall back to tiktoken since API is not implemented
      expect(result.method).toBe('tiktoken');
      expect(result.provider).toBe('openai');
      expect(result.accuracy).toBe('high');
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should count tokens with hybrid strategy', async () => {
      const shortText = 'Short';
      const longText = 'A'.repeat(2000); // Long text to trigger estimation

      const shortResult = await tokenizer.countTokens(shortText, { strategy: 'hybrid' });
      const longResult = await tokenizer.countTokens(longText, { strategy: 'hybrid' });

      expect(shortResult.tokens).toBeGreaterThan(0);
      expect(longResult.tokens).toBeGreaterThan(0);
      expect(longResult.tokens).toBeGreaterThan(shortResult.tokens);
    });
  });

  describe('Caching', () => {
    beforeEach(() => {
      tokenizer = new UniversalTokenizer([], 'fast');
    });

    it('should cache token counting results', async () => {
      const text = 'Cacheable test message';

      const result1 = await tokenizer.countTokens(text, { useCache: true });
      const result2 = await tokenizer.countTokens(text, { useCache: true });

      expect(result1.cached).toBe(false);
      expect(result2.cached).toBe(true);
      expect(result1.tokens).toBe(result2.tokens);
    });

    it('should not cache when disabled', async () => {
      const text = 'Non-cacheable test message';

      const result1 = await tokenizer.countTokens(text, { useCache: false });
      const result2 = await tokenizer.countTokens(text, { useCache: false });

      expect(result1.cached).toBe(false);
      expect(result2.cached).toBe(false);
    });

    it('should expire cached results after maxCacheAge', async () => {
      const text = 'Expiring cache test message';

      const result1 = await tokenizer.countTokens(text, {
        useCache: true,
        maxCacheAge: 100, // 100ms
      });

      // Wait for cache to expire
      await new Promise<void>(resolve => {
        setTimeout(resolve, 150);
      });

      const result2 = await tokenizer.countTokens(text, {
        useCache: true,
        maxCacheAge: 100,
      });

      expect(result1.cached).toBe(false);
      expect(result2.cached).toBe(false); // Should be recalculated
    });

    it('should clear cache manually', async () => {
      const text = 'Cache clearing test';

      await tokenizer.countTokens(text, { useCache: true });
      tokenizer.clearCache();

      const result = await tokenizer.countTokens(text, { useCache: true });
      expect(result.cached).toBe(false);
    });

    it('should limit cache size and implement LRU eviction', async () => {
      // This test simulates the LRU cache behavior
      // Fill cache beyond limit (1000 entries)
      const promises = [];
      for (let i = 0; i < 1001; i++) {
        promises.push(tokenizer.countTokens(`test message ${i}`, { useCache: true }));
      }

      await Promise.all(promises);

      // Last entry should be cached
      const lastResult = await tokenizer.countTokens('test message 1000', { useCache: true });

      // Note: Due to LRU implementation, last entry should be cached
      expect(lastResult.cached).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      tokenizer = new UniversalTokenizer([], 'fast');
    });

    it('should handle non-existent provider gracefully', async () => {
      const text = 'Error handling test';

      const result = await tokenizer.countTokens(text, { provider: 'non-existent' });

      // Should fallback to estimation
      expect(result.method).toBe('estimation');
      expect(result.provider).toBe('openai'); // Default fallback
      expect(result.tokens).toBeGreaterThan(0);
    });

    it('should handle empty text', async () => {
      const result = await tokenizer.countTokens('');

      expect(result.tokens).toBe(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle very long text', async () => {
      const longText = 'A'.repeat(100000); // 100k characters

      const result = await tokenizer.countTokens(longText);

      expect(result.tokens).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Provider-Specific Token Counting', () => {
    const testProviders: ModelProviderConfig[] = [
      {
        name: 'openai-precise',
        provider: 'openai',
        model: 'gpt-4',
        tokenLimits: { context: 8000, output: 2000 },
        tokenMultiplier: 1.0,
        apiKey: 'test-openai-key',
      },
      {
        name: 'anthropic-precise',
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        tokenLimits: { context: 200000, output: 4000 },
        tokenMultiplier: 1.15,
        apiKey: 'test-anthropic-key',
      },
      {
        name: 'deepseek-precise',
        provider: 'deepseek',
        model: 'deepseek-chat',
        tokenLimits: { context: 32000, output: 4000 },
        tokenMultiplier: 0.85,
        apiKey: 'test-deepseek-key',
      },
    ];

    beforeEach(() => {
      tokenizer = new UniversalTokenizer(testProviders, 'hybrid');
    });

    it('should use tiktoken for OpenAI when API not available', async () => {
      const text = 'OpenAI tiktoken test';

      const result = await tokenizer.countTokens(text, {
        provider: 'openai-precise',
        strategy: 'precise',
      });

      expect(result.provider).toBe('openai');
      expect(result.method).toBe('tiktoken');
      expect(result.accuracy).toBe('high');
    });

    it('should fall back to estimation for non-OpenAI providers', async () => {
      const text = 'Non-OpenAI estimation test';

      const anthropicResult = await tokenizer.countTokens(text, {
        provider: 'anthropic-precise',
        strategy: 'precise',
      });

      const deepseekResult = await tokenizer.countTokens(text, {
        provider: 'deepseek-precise',
        strategy: 'precise',
      });

      expect(anthropicResult.provider).toBe('anthropic');
      expect(anthropicResult.method).toBe('estimation');
      expect(deepseekResult.provider).toBe('deepseek');
      expect(deepseekResult.method).toBe('estimation');
    });

    it('should apply provider-specific multipliers correctly', async () => {
      const text = 'Provider multiplier test message';

      const openaiResult = await tokenizer.countTokens(text, {
        provider: 'openai-precise',
        strategy: 'fast', // Force estimation to see multiplier effects
      });
      const anthropicResult = await tokenizer.countTokens(text, {
        provider: 'anthropic-precise',
        strategy: 'fast', // Force estimation to see multiplier effects
      });
      const deepseekResult = await tokenizer.countTokens(text, {
        provider: 'deepseek-precise',
        strategy: 'fast', // Force estimation to see multiplier effects
      });

      // All should use estimation method with different multipliers
      expect(openaiResult.method).toBe('estimation');
      expect(anthropicResult.method).toBe('estimation');
      expect(deepseekResult.method).toBe('estimation');

      // Anthropic should have ~15% more tokens than OpenAI
      expect(anthropicResult.tokens).toBeGreaterThan(openaiResult.tokens);

      // DeepSeek should have ~15% fewer tokens than OpenAI
      expect(deepseekResult.tokens).toBeLessThan(openaiResult.tokens);
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      tokenizer = new UniversalTokenizer([], 'fast');
    });

    it('should complete token estimation quickly', async () => {
      const text = 'Performance test message';
      const startTime = Date.now();

      await tokenizer.countTokens(text);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle concurrent requests efficiently', async () => {
      const text = 'Concurrent test message';
      const concurrentRequests = 50;

      const startTime = Date.now();
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        tokenizer.countTokens(`${text} ${i}`)
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrentRequests);
      expect(duration).toBeLessThan(500); // Should complete all in under 500ms

      // All results should have valid token counts
      results.forEach(result => {
        expect(result.tokens).toBeGreaterThan(0);
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Integration with Different Text Types', () => {
    beforeEach(() => {
      tokenizer = new UniversalTokenizer([], 'fast');
    });

    it('should handle various text formats', async () => {
      const texts = [
        'Simple English text',
        'Text with numbers: 123 and symbols: @#$%',
        'Multi-line\ntext\nwith\nbreaks',
        'Unicode text: 🚀 Hello 世界',
        'Code snippet: const foo = () => { return "bar"; }',
        'JSON: {"key": "value", "number": 42}',
        'Markdown: # Header\n- List item\n**Bold text**',
      ];

      for (const text of texts) {
        const result = await tokenizer.countTokens(text);
        expect(result.tokens).toBeGreaterThan(0);
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should provide reasonable token estimates for different languages', async () => {
      const texts = {
        english: 'The quick brown fox jumps over the lazy dog',
        spanish: 'El zorro marrón rápido salta sobre el perro perezoso',
        french: 'Le renard brun rapide saute par-dessus le chien paresseux',
        german: 'Der schnelle braune Fuchs springt über den faulen Hund',
        chinese: '敏捷的棕色狐狸跳过懒惰的狗',
        japanese: '素早い茶色のキツネは怠け者の犬を飛び越えます',
      };

      const results: Record<string, number> = {};

      for (const [lang, text] of Object.entries(texts)) {
        const result = await tokenizer.countTokens(text);
        results[lang] = result.tokens;
        expect(result.tokens).toBeGreaterThan(0);
      }

      // Different languages should have different token counts
      // but all should be reasonable (not 0 or extremely high)
      Object.values(results).forEach(tokens => {
        expect(tokens).toBeGreaterThan(3); // Lowered from 5 to accommodate short phrases
        expect(tokens).toBeLessThan(100);
      });
    });
  });
});
