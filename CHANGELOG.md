# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [Unreleased]

### Features

- Core memory operations (remember, recall, forget, clear)
- PostgreSQL + pgvector integration for vector similarity search
- Semantic search with local embeddings (@xenova/transformers)
- ULID-based ID generation for optimal performance
- Database migration system with pgvector extension
- Docker development environment
- Comprehensive test suite (unit + integration)
- Static factory method for cleaner initialization
- Health check functionality for production monitoring
- Performance metrics logging with sub-millisecond precision
- Vector similarity search for finding related memories
- Connection URL validation with detailed error messages

### Performance

- ULID ID generation: 28M operations/second
- Sub-5ms memory operations with performance.now() timing
- Optimized vector similarity search with cosine distance
- Efficient database queries with prepared statements

### Documentation

- Complete API documentation with TypeScript types
- Docker setup guide and examples
- No-setup demo showcasing all features
- Security guidelines and best practices