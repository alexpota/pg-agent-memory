import { encoding_for_model } from 'tiktoken';
import {
  ModelProvider,
  ModelProviderConfig,
  TokenCountResult,
  TokenCountingOptions,
  UniversalTokenizerInterface,
  TokenCountingStrategy,
} from '../types/index.js';
import { logger } from '../utils/logger.js';
import { MemoryError } from '../errors/index.js';

/**
 * Universal tokenizer that supports multiple AI model providers
 * with intelligent fallback strategies and caching
 */
export class UniversalTokenizer implements UniversalTokenizerInterface {
  private readonly openaiTokenizer = encoding_for_model('gpt-3.5-turbo');
  private readonly providers = new Map<string, ModelProviderConfig>();
  private readonly cache = new Map<string, { result: TokenCountResult; timestamp: number }>();
  private readonly defaultStrategy: TokenCountingStrategy;

  // Research-backed token multipliers for different providers
  private readonly providerMultipliers: Record<ModelProvider, number> = {
    openai: 1.0, // Baseline
    anthropic: 1.15, // Claude uses ~15% more tokens than OpenAI
    deepseek: 0.85, // DeepSeek is ~15% more efficient
    google: 1.1, // Gemini similar to OpenAI, slightly higher
    meta: 1.25, // Llama tends to use more tokens
    custom: 1.2, // Conservative estimate for unknown providers
  };

  constructor(
    providers: ModelProviderConfig[] = [],
    defaultStrategy: TokenCountingStrategy = 'hybrid'
  ) {
    this.defaultStrategy = defaultStrategy;

    // Register providers
    providers.forEach((provider: ModelProviderConfig) => {
      this.providers.set(provider.name, provider);
    });

    logger.info(`UniversalTokenizer initialized with ${providers.length} providers`, {
      providers: providers.map((p: ModelProviderConfig) => ({
        name: p.name,
        provider: p.provider,
      })),
      defaultStrategy,
    });
  }

  countTokens(
    text: string,
    options: Partial<TokenCountingOptions> = {}
  ): Promise<TokenCountResult> {
    return new Promise(resolve => {
      const startTime = Date.now();

      // Safely extract options with proper type checking
      const strategy: TokenCountingStrategy = options.strategy ?? this.defaultStrategy;
      const useCache: boolean = options.useCache ?? true;
      const provider: string | undefined = options.provider;

      // Check cache first
      if (useCache) {
        const cached = this.getCachedResult(text, options);
        if (cached) {
          resolve(cached);
          return;
        }
      }

      try {
        let result: TokenCountResult;

        // If specific provider requested, use it
        if (provider) {
          result = this.countTokensForProvider(text, provider, strategy);
        } else {
          // Use default provider or fall back to estimation
          const providersArray = Array.from(this.providers.values());
          if (providersArray.length > 0) {
            const defaultProvider = providersArray[0]!;
            result = this.countTokensForProvider(text, defaultProvider.name, strategy);
          } else {
            result = this.createEstimationResult(text, 'openai', startTime);
          }
        }

        // Cache the result
        if (useCache) {
          this.cacheResult(text, options, result);
        }

        resolve(result);
      } catch (error) {
        logger.warn('Token counting failed, falling back to estimation', {
          error: (error as Error).message,
          textLength: text.length,
        });

        // Fallback to estimation
        resolve(this.createEstimationResult(text, 'openai', startTime));
      }
    });
  }

  private countTokensForProvider(
    text: string,
    providerName: string,
    strategy: TokenCountingStrategy
  ): TokenCountResult {
    const startTime = Date.now();
    const provider: ModelProviderConfig | undefined = this.providers.get(providerName);

    if (!provider) {
      throw new MemoryError(`Provider '${providerName}' not found`);
    }

    // Decide method based on strategy and text size
    const textLength = text.length;
    const useAPI = this.shouldUseAPI(strategy, textLength, provider);

    if (useAPI && provider.apiKey) {
      return this.countTokensViaAPI(text, provider, startTime);
    } else if (strategy === 'fast') {
      // Fast strategy always uses estimation, regardless of provider
      return this.createEstimationResult(text, provider.provider, startTime);
    } else if (provider.provider === 'openai') {
      return this.countTokensViaTiktoken(text, provider, startTime);
    } else {
      return this.createEstimationResult(text, provider.provider, startTime);
    }
  }

  private shouldUseAPI(
    strategy: TokenCountingStrategy,
    textLength: number,
    provider: ModelProviderConfig
  ): boolean {
    switch (strategy) {
      case 'precise':
        return true;
      case 'fast':
        return false;
      case 'hybrid':
        // Use API for small texts (<1000 chars), estimation for large
        return textLength < 1000 && !!provider.apiKey;
      default:
        return false;
    }
  }

  private countTokensViaAPI(
    text: string,
    provider: ModelProviderConfig,
    startTime: number
  ): TokenCountResult {
    if (provider.provider === 'openai') {
      return this.countTokensViaTiktoken(text, provider, startTime);
    }
    return this.createEstimationResult(text, provider.provider, startTime);
  }

  private countTokensViaTiktoken(
    text: string,
    provider: ModelProviderConfig,
    startTime: number
  ): TokenCountResult {
    const tokens = this.openaiTokenizer.encode(text).length;
    const multiplier: number =
      provider.tokenMultiplier ?? this.providerMultipliers[provider.provider];
    const adjustedTokens = Math.ceil(tokens * multiplier);

    return {
      tokens: adjustedTokens,
      provider: provider.provider,
      method: 'tiktoken',
      accuracy: provider.provider === 'openai' ? 'high' : 'medium',
      processingTimeMs: Date.now() - startTime,
      cached: false,
    };
  }

  private createEstimationResult(
    text: string,
    provider: ModelProvider,
    startTime: number
  ): TokenCountResult {
    const estimatedTokens = this.estimateTokens(text, provider);

    return {
      tokens: estimatedTokens,
      provider,
      method: 'estimation',
      accuracy: 'medium',
      processingTimeMs: Date.now() - startTime,
      cached: false,
    };
  }

  estimateTokens(text: string, provider: string): number {
    // Universal baseline: ~3.5 characters per token (English average)
    const baseTokens = Math.ceil(text.length / 3.5);

    // Apply provider-specific multiplier
    const providerKey = provider as ModelProvider;
    const multiplier: number =
      this.providerMultipliers[providerKey] ?? this.providerMultipliers.custom;

    return Math.ceil(baseTokens * multiplier);
  }

  getProviderInfo(providerName: string): ModelProviderConfig | undefined {
    return this.providers.get(providerName);
  }

  isProviderAvailable(providerName: string): boolean {
    const provider: ModelProviderConfig | undefined = this.providers.get(providerName);
    return !!provider;
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Token counting cache cleared');
  }

  private getCachedResult(
    text: string,
    options: Partial<TokenCountingOptions>
  ): TokenCountResult | null {
    const cacheKey = this.createCacheKey(text, options);
    const cached = this.cache.get(cacheKey);

    if (!cached) return null;

    const maxAge: number = options.maxCacheAge ?? 300000; // 5 minutes
    const age = Date.now() - cached.timestamp;

    if (age > maxAge) {
      this.cache.delete(cacheKey);
      return null;
    }

    return { ...cached.result, cached: true };
  }

  private cacheResult(
    text: string,
    options: Partial<TokenCountingOptions>,
    result: TokenCountResult
  ): void {
    const cacheKey: string = this.createCacheKey(text, options);
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    // Cleanup old cache entries (simple LRU)
    if (this.cache.size > 1000) {
      const firstEntry = this.cache.keys().next();
      if (!firstEntry.done && firstEntry.value) {
        this.cache.delete(firstEntry.value);
      }
    }
  }

  private createCacheKey(text: string, options: Partial<TokenCountingOptions>): string {
    // Create a hash-like key from text and options
    const optionsString: string = JSON.stringify({
      provider: options.provider ?? null,
      strategy: options.strategy ?? null,
    });

    return `${text.length}_${text.slice(0, 50)}_${optionsString}`;
  }

  // Static helper methods for backward compatibility
  static createDefault(): UniversalTokenizer {
    return new UniversalTokenizer([], 'hybrid');
  }

  static createWithOpenAI(): UniversalTokenizer {
    const openaiProvider: ModelProviderConfig = {
      name: 'default-openai',
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      tokenLimits: {
        context: 4000,
        output: 1000,
      },
      tokenMultiplier: 1.0,
    };

    return new UniversalTokenizer([openaiProvider], 'fast');
  }
}
