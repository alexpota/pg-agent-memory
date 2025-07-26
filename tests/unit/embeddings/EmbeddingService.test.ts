/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, no-undef */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmbeddingService } from '../../../src/embeddings/EmbeddingService.js';

// Mock @xenova/transformers
vi.mock('@xenova/transformers', () => {
  return {
    pipeline: vi.fn(),
    env: {
      allowLocalModels: true,
      allowRemoteModels: false,
    },
  };
});

interface MockFeatureExtractor {
  (...args: unknown[]): Promise<{ data: number[] }>;
}

interface MockPipeline {
  (...args: unknown[]): Promise<MockFeatureExtractor>;
}

describe('EmbeddingService', () => {
  let embeddingService: EmbeddingService;
  let mockFeatureExtractor: MockFeatureExtractor;
  let mockPipeline: MockPipeline;

  beforeEach(async () => {
    // Reset singleton
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (EmbeddingService as any).instance = null;

    // Get mocked pipeline
    const { pipeline } = await import('@xenova/transformers');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPipeline = pipeline as any;

    // Setup feature extractor mock
    mockFeatureExtractor = vi.fn().mockResolvedValue({
      data: [0.1, 0.2, 0.3, 0.4, 0.5], // Use regular array to avoid precision issues
    }) as MockFeatureExtractor;

    (mockPipeline as ReturnType<typeof vi.fn>).mockResolvedValue(mockFeatureExtractor);

    embeddingService = EmbeddingService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (EmbeddingService as any).instance = null;
  });

  describe('singleton pattern', () => {
    it('should return same instance across calls', () => {
      const instance1 = EmbeddingService.getInstance();
      const instance2 = EmbeddingService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(embeddingService);
    });

    it('should maintain singleton across different modules', () => {
      const instance1 = EmbeddingService.getInstance();

      (EmbeddingService as any).instance = null;
      const instance2 = EmbeddingService.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = EmbeddingService.getInstance();

      (EmbeddingService as any).instance = null;
      const instance2 = EmbeddingService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should initialize with correct model configuration', async () => {
      await embeddingService.initialize();

      expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    });

    it('should handle model loading errors', async () => {
      mockPipeline.mockRejectedValue(new Error('Model loading failed'));

      await expect(embeddingService.initialize()).rejects.toThrow('Model loading failed');
    });

    it('should only initialize once', async () => {
      await embeddingService.initialize();
      await embeddingService.initialize();

      expect(mockPipeline as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialization', async () => {
      const promises = [
        embeddingService.initialize(),
        embeddingService.initialize(),
        embeddingService.initialize(),
      ];

      await Promise.all(promises);

      expect(mockPipeline as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    });

    it('should set initialization flag correctly', async () => {
      const newService = EmbeddingService.getInstance();
      expect((newService as any).isInitialized).toBe(false);

      await newService.initialize();

      expect((newService as any).isInitialized).toBe(true);
    });

    it('should handle network errors during initialization', async () => {
      mockPipeline.mockRejectedValue(new Error('Network error'));

      await expect(embeddingService.initialize()).rejects.toThrow('Network error');
      expect((embeddingService as any).isInitialized).toBe(false);
    });

    it('should handle invalid model configuration', async () => {
      mockPipeline.mockRejectedValue(new Error('Invalid model'));

      await expect(embeddingService.initialize()).rejects.toThrow('Invalid model');
    });
  });

  describe('generateEmbedding', () => {
    beforeEach(async () => {
      await embeddingService.initialize();
    });

    it('should generate embeddings for valid text', async () => {
      const text = 'Hello world, this is a test message';

      const embedding = await embeddingService.generateEmbedding(text);

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(mockFeatureExtractor).toHaveBeenCalledWith(text, {
        pooling: 'mean',
        normalize: true,
      });
    });

    it('should handle empty text', async () => {
      await expect(embeddingService.generateEmbedding('')).rejects.toThrow(
        'Cannot generate embedding for empty text'
      );
    });

    it('should handle very long text', async () => {
      const longText = 'A'.repeat(10000);

      const embedding = await embeddingService.generateEmbedding(longText);

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should handle special characters and unicode', async () => {
      const specialText = 'Hello! @#$%^&*()_+ 世界 🌍 emoji test';

      const embedding = await embeddingService.generateEmbedding(specialText);

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should handle multiline text', async () => {
      const multilineText = 'Line 1\nLine 2\nLine 3\n\nLine 5';

      const embedding = await embeddingService.generateEmbedding(multilineText);

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should handle JSON-like text', async () => {
      const jsonText = '{"key": "value", "number": 42, "array": [1, 2, 3]}';

      const embedding = await embeddingService.generateEmbedding(jsonText);

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should handle HTML-like text', async () => {
      const htmlText = '<div class="content">Hello <b>world</b>!</div>';

      const embedding = await embeddingService.generateEmbedding(htmlText);

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should throw error if not initialized', async () => {
      const uninitializedService = EmbeddingService.getInstance();
      (uninitializedService as any).pipeline = null;
      (uninitializedService as any).isInitialized = false;

      await expect(uninitializedService.generateEmbedding('test')).rejects.toThrow(
        'Embedding service not initialized'
      );
    });

    it('should handle pipeline execution errors', async () => {
      mockFeatureExtractor.mockRejectedValue(new Error('Pipeline execution failed'));

      await expect(embeddingService.generateEmbedding('test')).rejects.toThrow(
        'Pipeline execution failed'
      );
    });

    it('should handle invalid pipeline response', async () => {
      mockFeatureExtractor.mockResolvedValue(null);

      await expect(embeddingService.generateEmbedding('test')).rejects.toThrow(
        'Failed to generate embedding'
      );
    });

    it('should handle pipeline response without data', async () => {
      mockFeatureExtractor.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });

      await expect(embeddingService.generateEmbedding('test')).rejects.toThrow(
        'Failed to generate embedding'
      );
    });

    it('should handle empty embedding data', async () => {
      mockFeatureExtractor.mockResolvedValue({ data: [] });

      const embedding = await embeddingService.generateEmbedding('test');

      expect(embedding).toEqual([]);
    });

    it('should handle large embedding vectors', async () => {
      const largeEmbedding = new Array(1536).fill(0).map((_, i) => i / 1536);
      mockFeatureExtractor.mockResolvedValue({ data: largeEmbedding });

      const embedding = await embeddingService.generateEmbedding('test');

      expect(embedding).toHaveLength(1536);
      expect(embedding[0]).toBe(0);
      expect(embedding[1535]).toBeCloseTo(0.999, 3);
    });
  });

  describe('input validation', () => {
    beforeEach(async () => {
      await embeddingService.initialize();
    });

    it('should reject null input', async () => {
      await expect(embeddingService.generateEmbedding(null as any)).rejects.toThrow(
        'Text must be a string'
      );
    });

    it('should reject undefined input', async () => {
      await expect(embeddingService.generateEmbedding(undefined as any)).rejects.toThrow(
        'Text must be a string'
      );
    });

    it('should reject number input', async () => {
      await expect(embeddingService.generateEmbedding(123 as any)).rejects.toThrow(
        'Text must be a string'
      );
    });

    it('should reject object input', async () => {
      await expect(embeddingService.generateEmbedding({} as any)).rejects.toThrow(
        'Text must be a string'
      );
    });

    it('should reject array input', async () => {
      await expect(embeddingService.generateEmbedding([] as any)).rejects.toThrow(
        'Text must be a string'
      );
    });

    it('should reject boolean input', async () => {
      await expect(embeddingService.generateEmbedding(true as any)).rejects.toThrow(
        'Text must be a string'
      );
    });
  });

  describe('performance', () => {
    beforeEach(async () => {
      await embeddingService.initialize();
    });

    it('should generate embeddings quickly', async () => {
      const startTime = Date.now();

      await embeddingService.generateEmbedding('Performance test message');

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
    });

    it('should handle concurrent requests efficiently', async () => {
      const texts = [
        'First text for embedding',
        'Second text for embedding',
        'Third text for embedding',
        'Fourth text for embedding',
        'Fifth text for embedding',
      ];

      const startTime = Date.now();
      const promises = texts.map(text => embeddingService.generateEmbedding(text));
      const embeddings = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(embeddings).toHaveLength(5);
      expect(duration).toBeLessThan(2000);
      expect(mockFeatureExtractor).toHaveBeenCalledTimes(5);
    });

    it('should handle memory efficiently with repeated calls', async () => {
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(embeddingService.generateEmbedding(`Message ${i}`));
      }

      const embeddings = await Promise.all(promises);

      expect(embeddings).toHaveLength(50);
      expect(mockFeatureExtractor).toHaveBeenCalledTimes(50);
    });
  });

  describe('error recovery', () => {
    beforeEach(async () => {
      await embeddingService.initialize();
    });

    it('should recover from temporary pipeline errors', async () => {
      mockFeatureExtractor
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValue({ data: [0.1, 0.2, 0.3] });

      await expect(embeddingService.generateEmbedding('test1')).rejects.toThrow('Temporary error');

      const embedding = await embeddingService.generateEmbedding('test2');
      expect(embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should handle out of memory errors', async () => {
      mockFeatureExtractor.mockRejectedValue(new Error('Out of memory'));

      await expect(embeddingService.generateEmbedding('test')).rejects.toThrow('Out of memory');
    });

    it('should handle model corruption errors', async () => {
      mockFeatureExtractor.mockRejectedValue(new Error('Model corrupted'));

      await expect(embeddingService.generateEmbedding('test')).rejects.toThrow('Model corrupted');
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await embeddingService.initialize();
    });

    it('should handle whitespace-only text', async () => {
      await expect(embeddingService.generateEmbedding('   \n\t  ')).rejects.toThrow(
        'Cannot generate embedding for empty text'
      );
    });

    it('should handle text with only numbers', async () => {
      const embedding = await embeddingService.generateEmbedding('123456789');

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should handle text with only symbols', async () => {
      const embedding = await embeddingService.generateEmbedding('!@#$%^&*()');

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should handle extremely long single word', async () => {
      const longWord = 'supercalifragilisticexpialidocious'.repeat(100);

      const embedding = await embeddingService.generateEmbedding(longWord);

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });

    it('should handle text with mixed encodings', async () => {
      const mixedText = 'English 中文 العربية русский ñoël café';

      const embedding = await embeddingService.generateEmbedding(mixedText);

      expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });
  });

  describe('memory management', () => {
    beforeEach(async () => {
      await embeddingService.initialize();
    });

    it('should not accumulate memory with many calls', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100; i++) {
        await embeddingService.generateEmbedding(`Test message ${i}`);
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });

    it('should handle garbage collection properly', async () => {
      const embeddings = [];

      for (let i = 0; i < 10; i++) {
        const embedding = await embeddingService.generateEmbedding(`Message ${i}`);
        embeddings.push(embedding);
      }

      expect(embeddings).toHaveLength(10);
      embeddings.length = 0; // Clear array

      if (global.gc) {
        global.gc();
      }

      // Should still work after cleanup
      const newEmbedding = await embeddingService.generateEmbedding('New message');
      expect(newEmbedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    });
  });

  describe('generateEmbeddings (batch)', () => {
    beforeEach(async () => {
      await embeddingService.initialize();
    });

    it('should generate embeddings for multiple texts', async () => {
      const texts = ['Hello world', 'Test message', 'Another text'];

      const embeddings = await embeddingService.generateEmbeddings(texts);

      expect(embeddings).toHaveLength(3);
      expect(embeddings[0]).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(embeddings[1]).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(embeddings[2]).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
      expect(mockFeatureExtractor).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array', async () => {
      const embeddings = await embeddingService.generateEmbeddings([]);

      expect(embeddings).toEqual([]);
      expect(mockFeatureExtractor).not.toHaveBeenCalled();
    });

    it('should process large batches efficiently', async () => {
      const texts = Array(50)
        .fill(0)
        .map((_, i) => `Text ${i}`);

      const embeddings = await embeddingService.generateEmbeddings(texts);

      expect(embeddings).toHaveLength(50);
      expect(mockFeatureExtractor).toHaveBeenCalledTimes(50);
    });

    it('should throw error if not initialized', async () => {
      const uninitializedService = EmbeddingService.getInstance();
      (uninitializedService as any).isInitialized = false;

      await expect(uninitializedService.generateEmbeddings(['test'])).rejects.toThrow(
        'Embedding service not initialized'
      );
    });
  });

  describe('cosineSimilarity (static)', () => {
    it('should calculate similarity between identical vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0];

      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity between orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];

      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(0.0, 5);
    });

    it('should calculate similarity between opposite vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [-1, 0, 0];

      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2);

      expect(similarity).toBeCloseTo(-1.0, 5);
    });

    it('should handle zero vectors', () => {
      const vec1 = [0, 0, 0];
      const vec2 = [1, 2, 3];

      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2);

      expect(similarity).toBe(0);
    });

    it('should throw error for different vector dimensions', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2];

      expect(() => EmbeddingService.cosineSimilarity(vec1, vec2)).toThrow(
        'Embedding vectors must have the same dimensions'
      );
    });

    it('should handle floating point vectors', () => {
      const vec1 = [0.1, 0.2, 0.3];
      const vec2 = [0.4, 0.5, 0.6];

      const similarity = EmbeddingService.cosineSimilarity(vec1, vec2);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('getModelInfo', () => {
    it('should return correct model information when not initialized', () => {
      const info = embeddingService.getModelInfo();

      expect(info).toEqual({
        name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        initialized: false,
      });
    });

    it('should return correct model information when initialized', async () => {
      await embeddingService.initialize();

      const info = embeddingService.getModelInfo();

      expect(info).toEqual({
        name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        initialized: true,
      });
    });
  });

  describe('cleanup', () => {
    it('should reset service state', async () => {
      await embeddingService.initialize();
      expect(embeddingService.getModelInfo().initialized).toBe(true);

      embeddingService.cleanup();

      const info = embeddingService.getModelInfo();
      expect(info.initialized).toBe(false);
      expect((embeddingService as any).embedder).toBeNull();
      expect((embeddingService as any).initializationPromise).toBeNull();
    });

    it('should allow reinitialization after cleanup', async () => {
      await embeddingService.initialize();
      embeddingService.cleanup();

      await embeddingService.initialize();

      expect(embeddingService.getModelInfo().initialized).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should use correct transformers environment settings', async () => {
      const { env } = await import('@xenova/transformers');

      expect(env.allowLocalModels).toBe(true);
      expect(env.allowRemoteModels).toBe(false);
    });

    it('should use optimal model parameters', async () => {
      await embeddingService.initialize();

      expect(mockPipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    });

    it('should use correct generation parameters', async () => {
      await embeddingService.initialize();
      await embeddingService.generateEmbedding('test');

      expect(mockFeatureExtractor).toHaveBeenCalledWith('test', {
        pooling: 'mean',
        normalize: true,
      });
    });
  });
});
