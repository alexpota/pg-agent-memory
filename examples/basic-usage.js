#!/usr/bin/env node

// Basic Usage - Essential CRUD operations
// Setup: docker compose up -d (starts PostgreSQL)
import { AgentMemory } from '../dist/index.js';

const memory = new AgentMemory({ 
  agent: 'basic-demo',
  connectionString: 'postgresql://agent_user:agent_pass@localhost:5432/agent_memory'
});

await memory.initialize();

// Store memory
const memoryId = await memory.remember({
  conversation: 'user-123',
  content: 'User prefers email notifications over SMS',
  role: 'user',
  importance: 0.8
});

// Get all conversation history (reliable)
const history = await memory.getHistory('user-123');
console.log(`Stored ${history.length} memories for user-123`);
console.log('Latest memory:', history[history.length - 1]?.content);

// Search memories (exact keyword match)
const results = await memory.searchMemories('email');
console.log(`Found ${results.length} memories containing "email"`);

await memory.disconnect();