#!/usr/bin/env node

// Quick Start - Show core value in 8 lines
// Setup: docker-compose up -d (starts PostgreSQL)
import { AgentMemory } from '../dist/index.js';

const memory = new AgentMemory({ 
  agent: 'demo-bot',
  connectionString: 'postgresql://agent_user:agent_pass@localhost:5432/agent_memory'
});

await memory.initialize();

await memory.remember({
  conversation: 'demo-chat',
  content: 'User prefers TypeScript and VS Code',
  role: 'user'
});

// Get conversation history (always works)
const history = await memory.getHistory('demo-chat');
console.log('Stored memory:', history[0]?.content);

await memory.disconnect();