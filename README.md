# pg-agent-memory

> Stateful AI Agent Memory Layer for PostgreSQL with pgvector - TypeScript-first with intelligent context management

[![npm version](https://img.shields.io/npm/v/pg-agent-memory.svg)](https://www.npmjs.com/package/pg-agent-memory)
[![Node.js](https://img.shields.io/node/v/pg-agent-memory.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen.svg)](./coverage)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

## Overview

pg-agent-memory provides a stateful memory layer for AI agents using PostgreSQL and pgvector. It solves the critical problem of persistent memory and context management across conversations.

## Features

- 🧠 **Intelligent Memory Management**: Automatic conversation history with smart compression
- 🎯 **Context Optimization**: Intelligent chunking and relevance-based retrieval  
- 🔗 **Multi-Agent Support**: Memory sharing with granular access controls
- ⚡ **Performance First**: <5ms memory operations, <20ms vector search
- 🛡️ **Production Ready**: Built-in error handling, monitoring, and observability
- 📊 **Memory Analytics**: Visual knowledge graphs and pattern detection
- 🔧 **TypeScript Native**: Full type safety with excellent developer experience

## Quick Start

### Installation

```bash
npm install pg-agent-memory pg pgvector
```

### Basic Usage

```typescript
import { AgentMemory } from 'pg-agent-memory';

const memory = new AgentMemory({
  agent: 'customer-support-bot',
  connectionString: process.env.DATABASE_URL
});

// Save a memory
await memory.remember({
  conversation: 'user-123',
  content: 'User prefers email notifications',
  importance: 0.8,
  expires: '30d'
});

// Recall relevant context
const context = await memory.recall({
  conversation: 'user-123',
  relevanceThreshold: 0.7
});
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the package
npm run build

# Start development
npm run dev
```

## License

[MIT](./LICENSE) © Alex Potapenko