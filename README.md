# pg-agent-memory

> Stateful AI agent memory layer for PostgreSQL with pgvector. TypeScript-first with intelligent context management and semantic search.

[![npm version](https://img.shields.io/npm/v/pg-agent-memory.svg)](https://www.npmjs.com/package/pg-agent-memory)
[![Node.js](https://img.shields.io/node/v/pg-agent-memory.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

## Why pg-agent-memory?

### The Problem: AI Agents Forget Everything

<table>
<tr>
<td width="50%">

**❌ Without pg-agent-memory**
```js
// Day 1: User shares preference
await openai.chat.completions.create({
  messages: [
    { role: "user", content: "I prefer Python" }
  ]
});
// AI: "Got it! I'll remember that."

// Day 2: User asks for help
await openai.chat.completions.create({
  messages: [
    { role: "user", content: "Help me start a project" }
  ]
});
// AI: "What language would you like to use?"
// 😤 Forgot everything!
```

</td>
<td width="50%">

**✅ With pg-agent-memory**
```js
// Day 1: Store preference
await memory.remember({
  conversation: userId,
  content: "User prefers Python",
  role: "system"
});

// Day 2: Retrieve context
const context = await memory.getHistory(userId);
await openai.chat.completions.create({
  messages: [
    ...context,
    { role: "user", content: "Help me start a project" }
  ]
});
// AI: "I'll create a Python project for you!"
// 🎯 Remembers everything!
```

</td>
</tr>
</table>

## Features

- **Persistent Memory** - Conversations continue across sessions
- **Multi-Model Support** - OpenAI, Anthropic, DeepSeek, Google, Meta + custom providers
- **Prompt Caching** - Up to 75% cost savings with automatic caching (OpenAI, Anthropic, DeepSeek, Google)
- **Memory Compression** - Automatic summarization with 4 compression strategies
- **Semantic Search** - Find relevant memories using AI embeddings
- **Universal Tokenizer** - Accurate token counting based on official provider documentation
- **TypeScript First** - Full type safety with autocomplete
- **PostgreSQL Native** - Uses your existing database
- **Zero-Cost Embeddings** - Local Sentence Transformers (@xenova/transformers)
- **High Performance** - <5ms memory operations, <20ms vector search

### Coming Soon
- Multi-agent memory sharing
- Memory graph visualization
- Pattern detection

## Quick Start

```bash
# Install
npm install pg-agent-memory

# Start PostgreSQL with Docker (includes pgvector)
docker-compose up -d

# Run example
npm start
```

### Installation

```bash
npm install pg-agent-memory
```

### Database Setup

**Option 1: Docker (Recommended)**
```bash
# Use included docker-compose.yml
docker-compose up -d
```

**Option 2: Existing PostgreSQL**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
```

### Basic Usage

```typescript
import { AgentMemory } from 'pg-agent-memory';

const memory = new AgentMemory({
  agent: 'my-assistant',
  connectionString: 'postgresql://user:pass@localhost:5432/db'
});

// Initialize (downloads embedding model on first run)
await memory.initialize();

// Store conversation memory
const memoryId = await memory.remember({
  conversation: 'user-123',
  content: 'User prefers email notifications',
  importance: 0.8
});

// Semantic search across memories
const relevant = await memory.searchMemories('notification preferences');

// Get relevant context for a query
const context = await memory.getRelevantContext(
  'user-123',
  'user communication preferences', 
  1000 // max tokens
);

console.log(`Found ${context.messages.length} relevant memories`);
console.log(`Relevance score: ${context.relevanceScore}`);

// Cleanup
await memory.disconnect();
```

## Multi-Model Support

Configure multiple AI providers with accurate token counting and prompt caching:

```typescript
const memory = new AgentMemory({
  agent: 'multi-model-bot',
  connectionString,
  modelProviders: [
    {
      name: 'gpt-4o',
      provider: 'openai',
      model: 'gpt-4o',
      tokenLimits: { context: 128000, output: 4000 }
      // Automatic prompt caching: Up to 75% cost savings + 80% latency reduction
      // Cache hits for prompts 1024+ tokens with exact prefix matches
    },
    {
      name: 'claude-sonnet',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      tokenLimits: { context: 200000, output: 4000 }
      // Context caching available: 90% cost savings on repeated prompts
    },
    {
      name: 'deepseek-coder',
      provider: 'deepseek', 
      model: 'deepseek-coder',
      tokenLimits: { context: 32000, output: 4000 }
      // KV cache available: ~90% cost reduction
    },
    {
      name: 'gemini-pro',
      provider: 'google',
      model: 'gemini-1.5-pro',
      tokenLimits: { context: 1048576, output: 8192 }
      // Context caching available: Significant cost reduction
    },
    {
      name: 'llama-3',
      provider: 'meta',
      model: 'llama-3.1-70b',
      tokenLimits: { context: 128000, output: 4000 }
      // More efficient tokenizer: ~44% fewer tokens than OpenAI
    }
  ],
  defaultProvider: 'gpt-4o',
  tokenCountingStrategy: 'hybrid' // 'precise', 'fast', or 'hybrid'
});

// Token counting uses official provider documentation:
// - OpenAI: ~4 chars/token or 0.75 words/token (official baseline)
// - Anthropic: ~3.5 chars/token (14% more tokens)
// - DeepSeek: ~3.3 chars/token (20% more tokens)
// - Google: ~4 chars/token (same as OpenAI)
// - Meta/Llama: ~0.75 tokens/word (44% fewer tokens - more efficient)
await memory.remember({
  conversation: userId,
  content: longText,
  provider: 'gpt-4o' // Automatic prompt caching for repeated content
});
```

## Memory Compression

Automatic memory compression with multiple strategies:

```typescript
// Enable compression for large conversations
const compressionResult = await memory.compressMemories({
  strategy: 'hybrid', // 'token_based', 'time_based', 'importance_based', 'hybrid'
  maxAge: '7d',
  targetCompressionRatio: 0.6
});

console.log(`Compressed ${compressionResult.memoriesCompressed} memories`);
console.log(`Token savings: ${compressionResult.tokensSaved}`);

// Get context with automatic compression
const context = await memory.getRelevantContextWithCompression(
  'coding preferences',
  4000 // Automatically compresses if needed
);
```

## Real-World Integration

### With OpenAI
```typescript
import OpenAI from 'openai';
import { AgentMemory } from 'pg-agent-memory';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const memory = new AgentMemory({ agent: 'support-bot', connectionString });

// Retrieve conversation history
const history = await memory.getHistory(userId);

// Include memory in AI request
const completion = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ]
});

// Store the interaction
await memory.remember({
  conversation: userId,
  content: userMessage,
  role: 'user'
});

await memory.remember({
  conversation: userId,
  content: completion.choices[0].message.content,
  role: 'assistant'
});
```

### With Anthropic Claude
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AgentMemory } from 'pg-agent-memory';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const memory = new AgentMemory({ 
  agent: 'claude-assistant', 
  connectionString,
  modelProviders: [{
    name: 'claude',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    tokenLimits: { context: 200000, output: 4000 }
  }]
});

// Get conversation with compression for large contexts
const context = await memory.getRelevantContextWithCompression(
  'user preferences and history',
  180000 // Near Claude's context limit
);

const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [
    ...context.messages.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ]
});

// Store the interaction
await memory.remember({
  conversation: userId,
  content: message.content[0].text,
  role: 'assistant'
});
```

### With Vercel AI SDK
```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { AgentMemory } from 'pg-agent-memory';

const memory = new AgentMemory({ agent: 'chat-assistant', connectionString });

export async function POST(req: Request) {
  const { messages, userId } = await req.json();
  
  // Get user's conversation history
  const history = await memory.getHistory(userId);
  
  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant with memory.',
    messages: [...history, ...messages],
  });
  
  // Store the conversation
  for (const message of messages) {
    await memory.remember({
      conversation: userId,
      ...message
    });
  }
  
  return result.toDataStreamResponse();
}
```

## API Reference

### AgentMemory

#### Constructor

```typescript
new AgentMemory(config: MemoryConfig)
```

**MemoryConfig:**
- `agent: string` - Unique agent identifier
- `connectionString: string` - PostgreSQL connection string  
- `tablePrefix?: string` - Table prefix (default: 'agent')
- `maxTokens?: number` - Max tokens per memory (default: 4000)
- `embeddingDimensions?: number` - Vector dimensions (default: 384)

#### Methods

##### `initialize(): Promise<void>`
Initialize database schema and embedding model.

##### `remember(message: Message): Promise<string>`
Store a conversation memory.

**Message:**
```typescript
{
  conversation: string;    // Conversation ID
  content: string;         // Memory content
  role?: 'user' | 'assistant' | 'system';
  importance?: number;     // 0-1 relevance score
  metadata?: Record<string, unknown>;
  expires?: Date | string; // Expiration (e.g., '30d', '1h')
}
```

##### `recall(filter: MemoryFilter): Promise<Context>`
Retrieve memories with filtering.

##### `getHistory(conversation: string, limit?: number): Promise<Message[]>`
Get chronological conversation history.

##### `getRelevantContext(conversation: string, query: string, maxTokens: number): Promise<Context>`
Find semantically relevant memories for a query.

##### `searchMemories(query: string, filters?: MemoryFilter): Promise<Message[]>`
Semantic search across all agent memories.

##### `deleteMemory(memoryId: string): Promise<void>`
Delete specific memory.

##### `deleteConversation(conversation: string): Promise<void>`
Delete entire conversation.

## Examples

### Chatbot Integration

```typescript
import { AgentMemory } from 'pg-agent-memory';

class ChatBot {
  private memory: AgentMemory;

  constructor() {
    this.memory = new AgentMemory({
      agent: 'chatbot',
      connectionString: process.env.DATABASE_URL
    });
  }

  async processMessage(userId: string, message: string) {
    // Store user message
    await this.memory.remember({
      conversation: userId,
      content: message,
      role: 'user'
    });

    // Get relevant context
    const context = await this.memory.getRelevantContext(
      userId, 
      message, 
      800
    );

    // Generate response using context
    const response = await this.generateResponse(message, context);

    // Store bot response  
    await this.memory.remember({
      conversation: userId,
      content: response,
      role: 'assistant'
    });

    return response;
  }
}
```

### Advanced Filtering

```typescript
// Search with filters
const memories = await memory.searchMemories('user preferences', {
  importance: { min: 0.7 },
  dateRange: { 
    start: new Date('2024-01-01'),
    end: new Date('2024-12-31')
  },
  metadata: { category: 'user_settings' },
  limit: 10
});

// Get memories by role
const userMessages = await memory.recall({
  conversation: 'user-123',
  role: 'user',
  limit: 50
});
```

## Running Examples

```bash
# Set database URL
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"

# Run basic example
npm run example:basic

# Run chatbot example  
npm run example:chatbot

# Run all examples
npm run example:all
```

## Development

### Quick Start with Docker

```bash
# Clone repository
git clone <repository>
cd pg-agent-memory
npm install

# Start PostgreSQL with pgvector
npm run dev:up

# Copy environment variables
cp .env.example .env

# Run examples
npm run example:basic

# Run tests
npm run test:docker
```

### Docker Commands

```bash
# Start development database
npm run dev:up

# Stop database (data persists)
npm run dev:down

# View database logs
npm run dev:logs

# Clean everything (including data)
npm run dev:clean

# Connect to PostgreSQL shell
bash scripts/docker-dev.sh shell
```

### Manual Setup

If you prefer using your own PostgreSQL:

```bash
# Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

# Set connection string
export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"

# Run tests
npm test
npm run test:integration
```

### Testing

```bash
# Unit tests (no database needed)
npm test

# Integration tests with Docker
npm run test:docker

# Integration tests with custom database
export DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"
npm run test:integration

# All tests
npm run test:all
```

### Database Requirements

- PostgreSQL 12+
- pgvector extension

### Performance

- **Memory operations**: <5ms p99
- **Vector search**: <20ms p99  
- **Embedding generation**: ~10ms local
- **Model size**: ~23MB (cached after first download)
- **Token counting**: Sub-millisecond estimation, based on official provider ratios
- **Prompt caching**: Up to 75% cost + 80% latency reduction (OpenAI automatic, others available)

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   AgentMemory   │────│  EmbeddingService │────│ @xenova/trans.. │
│                 │    │                  │    │   (Local Model) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌──────────────────┐
│   PostgreSQL    │────│     pgvector     │
│   (Memories)    │    │  (Vector Search) │
└─────────────────┘    └──────────────────┘
```

**Components:**
- **AgentMemory**: Main API for memory operations
- **EmbeddingService**: Local text-to-vector conversion using @xenova/transformers
- **PostgreSQL**: Persistent storage with ACID properties
- **pgvector**: Efficient vector similarity search
- **@xenova/transformers**: Local Sentence Transformers model (all-MiniLM-L6-v2)

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test`
4. Submit a pull request

## Support

- [GitHub Issues](https://github.com/alexpota/pg-agent-memory/issues)
- [Documentation](https://github.com/alexpota/pg-agent-memory#readme)