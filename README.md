# pg-agent-memory

Stateful AI agent memory layer for PostgreSQL with pgvector. TypeScript-first with intelligent context management and semantic search.

## Features

- **Semantic Memory Search** - Find relevant context using vector similarity
- **Local Embeddings** - Zero-cost embeddings with Sentence Transformers  
- **PostgreSQL Native** - Built on battle-tested database infrastructure
- **TypeScript First** - Full type safety with Zod validation
- **Time-Ordered IDs** - ULID-based memory IDs for chronological sorting
- **Automatic Cleanup** - Configurable memory expiration and cleanup
- **Performance Optimized** - Sub-5ms memory operations, <20ms vector search

## Quick Start

### Installation

```bash
npm install pg-agent-memory pg pgvector
```

### Database Setup

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Database will be automatically set up on first run
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

### Setup

```bash
git clone <repository>
cd pg-agent-memory
npm install
```

### Testing

```bash
# Unit tests
npm test

# Integration tests (requires PostgreSQL)
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

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   AgentMemory   │────│  EmbeddingService │────│ SentenceTransf. │
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
- **EmbeddingService**: Local text-to-vector conversion  
- **PostgreSQL**: Persistent storage with ACID properties
- **pgvector**: Efficient vector similarity search

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