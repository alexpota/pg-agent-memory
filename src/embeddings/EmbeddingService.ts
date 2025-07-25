import { pipeline, FeatureExtractionPipeline, env } from '@xenova/transformers';
import { logger } from '../utils/logger.js';

/**
 * Local embedding service using Sentence Transformers
 * Provides zero-cost, privacy-first vector embeddings
 */
export class EmbeddingService {
  private static instance: EmbeddingService;
  private embedder: FeatureExtractionPipeline | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private readonly modelName = 'Xenova/all-MiniLM-L6-v2'; // 384 dimensions, excellent quality

  private constructor() {}

  /**
   * Get singleton instance of embedding service
   */
  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * Initialize the embedding model (downloads model on first run)
   * Subsequent calls are fast as model is cached locally
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Handle concurrent initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Try to initialize with default settings (multi-threading enabled)
      this.embedder = await pipeline('feature-extraction', this.modelName);
      this.isInitialized = true;
      logger.info('Embedding service initialized with multi-threading enabled');
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Check if it's the blob:nodedata worker error
      if (errorMessage.includes('blob:nodedata') || errorMessage.includes('worker script')) {
        logger.warn('Worker thread initialization failed, retrying with single thread...');

        try {
          // Disable multithreading and retry
          // See: https://github.com/microsoft/onnxruntime/issues/14445
          env.backends.onnx.wasm.numThreads = 1;

          this.embedder = await pipeline('feature-extraction', this.modelName);
          this.isInitialized = true;
          logger.info('Embedding service initialized with single thread (worker threads disabled)');
        } catch (retryError) {
          // Reset so next attempt can try again
          this.initializationPromise = null;
          throw new Error(
            `Failed to initialize embedding model after retry: ${(retryError as Error).message}`
          );
        }
      } else {
        // Reset so next attempt can try again
        this.initializationPromise = null;
        throw new Error(`Failed to initialize embedding model: ${errorMessage}`);
      }
    }
  }

  /**
   * Generate embedding vector for text content
   * @param text - Text to embed (will be truncated to ~500 tokens if too long)
   * @returns 384-dimensional normalized embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isInitialized || !this.embedder) {
      throw new Error('Embedding service not initialized. Call initialize() first.');
    }

    if (typeof text !== 'string') {
      throw new Error('Text must be a string');
    }

    if (!text.trim()) {
      throw new Error('Cannot generate embedding for empty text');
    }

    // Truncate very long text to prevent memory issues
    const truncatedText = text.length > 2000 ? text.slice(0, 2000) + '...' : text;

    try {
      // Generate embedding with mean pooling and L2 normalization
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const output = await this.embedder(truncatedText, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert tensor to regular array
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return Array.from(output.data as Float32Array);
    } catch (error) {
      throw new Error(`Failed to generate embedding: ${(error as Error).message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * More efficient than calling generateEmbedding multiple times
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isInitialized || !this.embedder) {
      throw new Error('Embedding service not initialized. Call initialize() first.');
    }

    if (texts.length === 0) {
      return [];
    }

    // Process in batches to avoid memory issues
    const batchSize = 16;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(text => this.generateEmbedding(text));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   * @param embedding1 - First embedding vector
   * @param embedding2 - Second embedding vector
   * @returns Similarity score between -1 and 1 (higher = more similar)
   */
  static cosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embedding vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      const val1 = embedding1[i] ?? 0;
      const val2 = embedding2[i] ?? 0;
      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    }

    // Handle zero vectors
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Get model information
   */
  getModelInfo(): { name: string; dimensions: number; initialized: boolean } {
    return {
      name: this.modelName,
      dimensions: 384, // MiniLM-L6-v2 outputs 384-dim vectors
      initialized: this.isInitialized,
    };
  }

  /**
   * Cleanup resources (mainly for testing)
   */
  cleanup(): void {
    this.embedder = null;
    this.isInitialized = false;
    this.initializationPromise = null;
  }
}
