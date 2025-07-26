#!/usr/bin/env node

// No Setup Demo - Works with any PostgreSQL connection
// Usage: DATABASE_URL=postgresql://user:pass@host:port/db node examples/no-setup-demo.js

import { AgentMemory } from '../dist/index.js';

async function runDemo() {
  try {
    console.log('🚀 Starting pg-agent-memory no-setup demo...\n');

    // Auto-detect PostgreSQL connection
    const connectionString = 
      process.env.DATABASE_URL || 
      process.env.POSTGRES_URL || 
      'postgresql://postgres:postgres@localhost:5432/postgres';

    console.log(`📡 Connecting to: ${connectionString.replace(/:\/\/.*@/, '://***@')}`);

    // Use static factory method for cleaner setup
    const memory = await AgentMemory.create({
      agent: 'demo-assistant',
      connectionString
    });

    console.log('✅ Memory initialized successfully\n');

    // Health check
    const health = await memory.healthCheck();
    console.log('🏥 Health check:', health.status);
    if (health.details.memoryCount !== undefined) {
      console.log(`📊 Existing memories: ${health.details.memoryCount}\n`);
    }

    // Store some demo memories
    console.log('💾 Storing demo memories...');
    
    const memory1 = await memory.remember({
      conversation: 'demo-chat',
      content: 'User prefers TypeScript over JavaScript for better type safety',
      role: 'user',
      importance: 0.8
    });
    console.log(`  ✓ Memory 1 stored: ${memory1}`);

    const memory2 = await memory.remember({
      conversation: 'demo-chat', 
      content: 'User is building a web application with PostgreSQL database',
      role: 'user',
      importance: 0.7
    });
    console.log(`  ✓ Memory 2 stored: ${memory2}`);

    const memory3 = await memory.remember({
      conversation: 'demo-chat',
      content: 'User mentioned they use VS Code as their primary editor',
      role: 'assistant',
      importance: 0.6
    });
    console.log(`  ✓ Memory 3 stored: ${memory3}\n`);

    // Semantic search
    console.log('🔍 Semantic search: "programming preferences"');
    const searchResults = await memory.searchMemories('programming preferences', { limit: 3 });
    searchResults.forEach((result, i) => {
      console.log(`  ${i + 1}. "${result.content.substring(0, 60)}..."`);
    });
    console.log();

    // Find related memories
    console.log(`🔗 Finding memories related to: ${memory1.substring(0, 8)}...`);
    const related = await memory.findRelatedMemories(memory1, 2);
    related.forEach((result, i) => {
      console.log(`  ${i + 1}. "${result.content.substring(0, 60)}..."`);
    });
    console.log();

    // Get conversation history
    console.log('📚 Conversation history:');
    const history = await memory.getHistory('demo-chat');
    history.forEach((msg, i) => {
      console.log(`  ${i + 1}. [${msg.role}] ${msg.content.substring(0, 50)}...`);
    });
    console.log();

    // Get relevant context
    console.log('🎯 Getting relevant context for: "What technologies does the user prefer?"');
    const context = await memory.getRelevantContext(
      'demo-chat',
      'What technologies does the user prefer?',
      500 // max tokens
    );
    console.log(`  📊 Found ${context.messages.length} relevant memories`);
    console.log(`  🎯 Relevance score: ${context.relevanceScore.toFixed(2)}`);
    console.log(`  📝 Token count: ${context.totalTokens}`);
    console.log();

    // Final health check
    const finalHealth = await memory.healthCheck();
    console.log('🏥 Final health check:', finalHealth.status);
    console.log(`📊 Total memories: ${finalHealth.details.memoryCount}`);

    await memory.disconnect();
    console.log('\n✅ Demo completed successfully!');
    console.log('\n🎉 pg-agent-memory is working perfectly!');
    console.log('Next steps:');
    console.log('  1. Check out the full documentation in README.md');
    console.log('  2. Explore more examples in the examples/ directory');
    console.log('  3. Start building your AI agent with persistent memory!');

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    console.log('\n🛠️  Troubleshooting:');
    console.log('  1. Ensure PostgreSQL is running and accessible');
    console.log('  2. Check your DATABASE_URL environment variable');
    console.log('  3. Ensure pgvector extension is installed: CREATE EXTENSION vector;');
    console.log('  4. For Docker setup: docker compose up -d');
    process.exit(1);
  }
}

runDemo();