import { describe, it, expect } from 'vitest';
import { setupIntegrationTest } from './helpers/testSetup.js';
import { EmbeddingService } from '../../src/index.js';

describe.skipIf(!process.env.DATABASE_URL)('Vector Operations Integration', () => {
  it('should generate embeddings for text content', async () => {
    const embeddingService = EmbeddingService.getInstance();

    try {
      await embeddingService.initialize();
      const text = 'The user prefers coffee over tea in the morning';
      const embedding = await embeddingService.generateEmbedding(text);

      expect(embedding).toHaveLength(384);
      expect(embedding.every(val => typeof val === 'number')).toBe(true);
      expect(embedding.some(val => val !== 0)).toBe(true); // Not all zeros
    } finally {
      embeddingService.cleanup();
    }
  }, 30000);

  it('should calculate cosine similarity correctly', async () => {
    const embeddingService = EmbeddingService.getInstance();

    try {
      await embeddingService.initialize();
      const text1 = 'I love drinking coffee in the morning';
      const text2 = 'Morning coffee is my favorite beverage';
      const text3 = 'The weather is sunny today';

      const embedding1 = await embeddingService.generateEmbedding(text1);
      const embedding2 = await embeddingService.generateEmbedding(text2);
      const embedding3 = await embeddingService.generateEmbedding(text3);

      const similarity12 = EmbeddingService.cosineSimilarity(embedding1, embedding2);
      const similarity13 = EmbeddingService.cosineSimilarity(embedding1, embedding3);

      // Similar texts should have higher similarity
      expect(similarity12).toBeGreaterThan(similarity13);
      expect(similarity12).toBeGreaterThan(0.5); // Coffee texts should be quite similar
      expect(similarity13).toBeLessThan(0.5); // Coffee vs weather should be less similar
    } finally {
      embeddingService.cleanup();
    }
  }, 30000);

  it('should store and retrieve memories with embeddings', async () => {
    const agentId = `test-vector-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      const memoryId = await testSetup.memory.remember({
        conversation: 'test-embeddings-1',
        content: 'User loves Italian pasta dishes',
        role: 'user',
        importance: 0.9,
        timestamp: new Date(),
      });

      // Verify memory is stored with embedding
      const { rows } = await testSetup.testClient.query(
        'SELECT content, embedding FROM agent_memories WHERE id = $1',
        [memoryId]
      );

      expect(rows).toHaveLength(1);
      expect((rows[0] as { content: string }).content).toBe('User loves Italian pasta dishes');
      expect((rows[0] as { embedding: unknown }).embedding).toBeDefined();

      // Parse and validate embedding
      const storedEmbedding = JSON.parse((rows[0] as { embedding: string }).embedding) as number[];
      expect(storedEmbedding).toHaveLength(384);
    } finally {
      await testSetup.cleanup();
    }
  }, 30000);

  it('should perform semantic search across memories', async () => {
    const agentId = `test-vector-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      // Store related memories
      await testSetup.memory.remember({
        conversation: 'test-embeddings-2',
        content: 'User enjoys eating spaghetti carbonara',
        role: 'user',
        importance: 0.7,
        timestamp: new Date(),
      });

      await testSetup.memory.remember({
        conversation: 'test-embeddings-2',
        content: 'Weather forecast shows rain tomorrow',
        role: 'assistant',
        importance: 0.3,
        timestamp: new Date(),
      });

      await testSetup.memory.remember({
        conversation: 'test-embeddings-2',
        content: 'Italian restaurants serve excellent pasta',
        role: 'user',
        importance: 0.8,
        timestamp: new Date(),
      });

      // Search for pasta-related content
      const results = await testSetup.memory.searchMemories('pasta dishes');

      // Should find pasta-related memories, not weather
      expect(results.length).toBeGreaterThan(0);

      const contents = results.map(r => r.content);
      const pastaMemories = contents.filter(
        content =>
          content.includes('pasta') || content.includes('spaghetti') || content.includes('Italian')
      );

      expect(pastaMemories.length).toBeGreaterThan(0);

      // Weather memory should not be in top results
      const weatherMemories = contents.filter(content => content.includes('weather'));
      expect(weatherMemories.length).toBe(0);
    } finally {
      await testSetup.cleanup();
    }
  }, 30000);

  it('should retrieve relevant context using semantic similarity', async () => {
    const agentId = `test-vector-agent-${Date.now()}`;
    const testSetup = await setupIntegrationTest(agentId);

    try {
      await testSetup.memory.remember({
        conversation: 'test-context-1',
        content: 'User has dietary restrictions - vegetarian',
        role: 'user',
        importance: 0.8,
        timestamp: new Date(),
      });

      await testSetup.memory.remember({
        conversation: 'test-context-1',
        content: 'User mentioned loving pizza margherita',
        role: 'user',
        importance: 0.7,
        timestamp: new Date(),
      });

      await testSetup.memory.remember({
        conversation: 'test-context-1',
        content: 'Discussion about weekend weather plans',
        role: 'user',
        importance: 0.3,
        timestamp: new Date(),
      });

      // Query for food-related context
      const context = await testSetup.memory.getRelevantContext(
        'test-context-1',
        'food preferences and dietary needs',
        1000
      );

      expect(context.messages.length).toBeGreaterThan(0);
      expect(context.relevanceScore).toBeGreaterThan(0);

      // Should prioritize food-related memories
      const foodRelated = context.messages.filter(
        m =>
          m.content.includes('dietary') ||
          m.content.includes('pizza') ||
          m.content.includes('vegetarian')
      );

      expect(foodRelated.length).toBeGreaterThan(0);
    } finally {
      await testSetup.cleanup();
    }
  }, 30000);

  it('should handle batch embedding generation', async () => {
    const embeddingService = EmbeddingService.getInstance();

    try {
      await embeddingService.initialize();
      const texts = [
        'First memory about cooking',
        'Second memory about sports',
        'Third memory about technology',
      ];

      const embeddings = await embeddingService.generateEmbeddings(texts);

      expect(embeddings).toHaveLength(3);
      expect(embeddings.every(emb => emb.length === 384)).toBe(true);

      // Each embedding should be different
      const similarity01 = EmbeddingService.cosineSimilarity(embeddings[0], embeddings[1]);
      const similarity02 = EmbeddingService.cosineSimilarity(embeddings[0], embeddings[2]);

      expect(similarity01).toBeLessThan(0.9); // Different topics
      expect(similarity02).toBeLessThan(0.9); // Different topics
    } finally {
      embeddingService.cleanup();
    }
  }, 30000);

  it('should validate embedding service model info', async () => {
    const embeddingService = EmbeddingService.getInstance();

    try {
      await embeddingService.initialize();
      const modelInfo = embeddingService.getModelInfo();

      expect(modelInfo.name).toBe('Xenova/all-MiniLM-L6-v2');
      expect(modelInfo.dimensions).toBe(384);
      expect(modelInfo.initialized).toBe(true);
    } finally {
      embeddingService.cleanup();
    }
  }, 30000);
});
