import { AgentMemory } from '../src/index.js';

/**
 * Basic usage example for pg-agent-memory
 * 
 * This example demonstrates:
 * - Setting up agent memory with PostgreSQL
 * - Storing conversation memories with semantic embeddings
 * - Retrieving relevant context using similarity search
 * - Memory expiration and cleanup
 */

async function basicUsage() {
  // Initialize agent memory with PostgreSQL connection
  const memory = new AgentMemory({
    agent: 'customer-support-bot',
    connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/memory_db',
  });

  try {
    // Initialize database schema and embeddings model
    console.log('Initializing agent memory...');
    await memory.initialize();
    console.log('✅ Memory system initialized');

    // Store conversation memories
    console.log('\n📝 Storing conversation memories...');
    
    const memoryId1 = await memory.remember({
      conversation: 'user-123',
      content: 'User prefers email notifications over SMS',
      role: 'user',
      importance: 0.8,
      metadata: { category: 'preferences', source: 'support_chat' }
    });
    
    const memoryId2 = await memory.remember({
      conversation: 'user-123',
      content: 'User has premium subscription until March 2025',
      role: 'assistant',
      importance: 0.9,
      expires: '90d' // Expire in 90 days
    });

    const memoryId3 = await memory.remember({
      conversation: 'user-123',
      content: 'User reported issue with mobile app crashes on iOS',
      role: 'user',
      importance: 0.7,
      metadata: { category: 'bug_report', platform: 'ios' }
    });

    console.log(`✅ Stored 3 memories: ${memoryId1.slice(0, 12)}...`);

    // Retrieve conversation history
    console.log('\n📚 Retrieving conversation history...');
    const history = await memory.getHistory('user-123');
    console.log(`✅ Found ${history.length} memories in conversation`);
    
    for (const msg of history) {
      console.log(`  - ${msg.role}: ${msg.content.slice(0, 50)}...`);
    }

    // Semantic search across memories
    console.log('\n🔍 Searching for notification-related memories...');
    const notificationMemories = await memory.searchMemories('notification settings');
    console.log(`✅ Found ${notificationMemories.length} relevant memories`);
    
    for (const msg of notificationMemories) {
      console.log(`  - Relevance: ${msg.importance} | ${msg.content}`);
    }

    // Get relevant context for a query
    console.log('\n🎯 Getting relevant context for user support...');
    const context = await memory.getRelevantContext(
      'user-123',
      'user account information and preferences',
      1000 // max tokens
    );
    
    console.log(`✅ Retrieved context with ${context.messages.length} messages`);
    console.log(`   Relevance score: ${context.relevanceScore.toFixed(3)}`);
    console.log(`   Total tokens: ${context.totalTokens}`);
    
    for (const msg of context.messages) {
      console.log(`  - ${msg.content}`);
    }

    // Search across multiple conversations
    console.log('\n🌐 Searching across all agent memories...');
    const allIssues = await memory.searchMemories('app issues problems', {
      limit: 5,
      importance: { min: 0.5 }
    });
    
    console.log(`✅ Found ${allIssues.length} issue-related memories`);

    // Clean up expired memories
    console.log('\n🧹 Cleaning up expired memories...');
    // Note: This is automatically done during initialization
    console.log('✅ Cleanup completed');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Always disconnect when done
    await memory.disconnect();
    console.log('\n👋 Disconnected from memory system');
  }
}

// Run the example
if (import.meta.url === `file://${process.argv[1]}`) {
  basicUsage().catch(console.error);
}

export { basicUsage };