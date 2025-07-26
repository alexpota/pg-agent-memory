# Contributing to pg-agent-memory

Thank you for your interest in contributing to pg-agent-memory! We welcome contributions from the community and appreciate your help in making this project better.

## Development Setup

### Prerequisites

- **Node.js**: v22.0.0 or higher
- **PostgreSQL**: v12 or higher with pgvector extension
- **Docker and Docker Compose** (recommended for development)

### Peer Dependencies

- **pg**: >=8.0.0 (PostgreSQL client library)

### Getting Started

1. **Fork and Clone**
   ```bash
   git fork https://github.com/alexpota/pg-agent-memory
   git clone https://github.com/yourusername/pg-agent-memory.git
   cd pg-agent-memory
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start Development Environment (Docker-First Approach)**
   ```bash
   # Start PostgreSQL with pgvector
   npm run dev:up
   
   # View database logs (optional)
   npm run dev:logs
   ```

4. **Alternative: Manual PostgreSQL Setup**
   ```bash
   # If you prefer using local PostgreSQL
   createdb agent_memory
   psql agent_memory -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

5. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your database connection details (if needed)
   ```

6. **Run Tests**
   ```bash
   npm test                      # Unit tests only (no database needed)
   npm run test:integration      # Integration tests with Docker PostgreSQL
   npm run test:docker           # All tests with Docker setup
   ```

7. **Build and Validate**
   ```bash
   npm run build                 # Build the package
   npm run type-check            # TypeScript validation
   npm run lint                  # ESLint validation
   ```

## Development Workflow

### Branching Strategy

We use a simplified Git workflow (as per CLAUDE.md):

- **main**: Production-ready code
- **feat/feature-name**: New features
- **fix/bug-name**: Bug fixes
- **docs/topic**: Documentation updates
- **chore/task**: Maintenance tasks
- **test/improvement**: Test improvements
- **refactor/component**: Code refactoring
- **perf/optimization**: Performance improvements

### Commit Standards

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add vector similarity search
fix: resolve memory leak in connection pooling
docs: update API documentation
test: add integration tests for memory compression
chore: update dependencies
```

**Commit Types:**
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `refactor:` - Code refactoring
- `perf:` - Performance improvements

### Pre-commit Validation

Our Husky pre-commit hooks automatically run:
1. **Type checking** (`npm run type-check`) - Ensures TypeScript compiles
2. **Linting and formatting** (`lint-staged`) - ESLint with auto-fix + Prettier for changed files only
3. **Tests** (`npm test`) - Full unit test suite must pass
4. **Build validation** - Ensures project builds successfully

If validation fails, fix the issues and commit again. This prevents broken code from entering the repository.

## Code Standards

### TypeScript Guidelines

- **Strict Mode**: All code must pass TypeScript strict checks
- **Type Safety**: Prefer explicit types over `any`
- **Interfaces**: Use interfaces for public APIs
- **Documentation**: TSDoc comments for all public methods

```typescript
/**
 * Retrieves conversation history with optional filtering
 * @param conversation - Conversation identifier
 * @param limit - Maximum number of messages to retrieve
 * @returns Promise resolving to array of messages
 */
async getHistory(conversation: string, limit = 50): Promise<Message[]> {
  // Implementation
}
```

### Testing Requirements

- **Coverage**: Maintain 85%+ test coverage
- **Test Types** (following our naming conventions):
  - `*.unit.test.ts` - Unit tests with mocked dependencies
  - `*.basic.integration.test.ts` - Basic integration scenarios  
  - `*.vector-search.integration.test.ts` - Vector operation validation
  - `*.multi-agent.integration.test.ts` - Multi-agent memory sharing
  - `*.e2e.test.ts` - Complete user workflow tests
  - `*.benchmark.test.ts` - Performance measurement tests

```typescript
describe('AgentMemory', () => {
  it('should store and retrieve memories correctly', async () => {
    const memory = new AgentMemory(config);
    await memory.initialize();
    
    const memoryId = await memory.remember({
      conversation: 'test-conv',
      content: 'Test message'
    });
    
    const history = await memory.getHistory('test-conv');
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('Test message');
  });
});
```

### Code Quality Standards

- **ESLint**: All code must pass linting
- **Prettier**: Consistent code formatting
- **Performance**: Consider memory usage and query efficiency
- **Security**: Input validation and SQL injection prevention

## Pull Request Process

### Before Opening a PR

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes**
   - Follow coding standards
   - Add tests for new functionality
   - Update documentation if needed

3. **Validate Changes**
   ```bash
   npm run build                 # Build must succeed
   npm run type-check            # TypeScript validation
   npm run lint                  # ESLint validation
   npm test                      # Unit tests must pass
   npm run test:integration      # Integration tests (if applicable)
   ```

4. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: your descriptive commit message"
   ```

### PR Requirements

- **Description**: Clear description of changes and motivation
- **Tests**: All tests must pass
- **Coverage**: Maintain or improve test coverage
- **Documentation**: Update docs for API changes
- **Breaking Changes**: Clearly document any breaking changes

### PR Template

```markdown
## Description
Brief description of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Added tests for new functionality

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No breaking changes (or clearly documented)
```

## Architecture Guidelines

### Project Structure

```
src/
├── core/               # Core AgentMemory class
├── adapters/           # Database adapters
├── embeddings/         # Embedding services
├── tokenization/       # Token counting utilities
├── migrations/         # Database migrations
├── types/              # TypeScript definitions
├── errors/             # Error classes
└── index.ts            # Main exports

tests/
├── unit/               # Unit tests with mocks
│   ├── AgentMemory.test.ts
│   ├── compression.test.ts
│   ├── db/
│   │   └── migrations.test.ts
│   ├── embeddings/
│   │   └── EmbeddingService.test.ts
│   ├── errors/
│   ├── memory/
│   │   └── AgentMemory.test.ts
│   └── tokenization/
│       └── UniversalTokenizer.test.ts
├── integration/        # Integration tests with real DB
│   ├── compression.test.ts
│   ├── database.test.ts
│   ├── embeddings.test.ts
│   └── multi-model.test.ts
└── setup.ts           # Test configuration and helpers
```

### Design Principles

1. **TypeScript First**: Strong typing throughout
2. **Performance**: Optimize for memory operations <5ms
3. **Reliability**: Comprehensive error handling
4. **Extensibility**: Plugin architecture for future features
5. **Security**: Input validation and secure defaults

## Getting Help

### Resources

- **Documentation**: Check README.md and inline TSDoc
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions

### Reporting Issues

When reporting bugs, include:

1. **Environment Details**
   - Node.js version
   - PostgreSQL version
   - Operating system
   - pg-agent-memory version

2. **Steps to Reproduce**
   ```typescript
   // Minimal reproducible example
   const memory = new AgentMemory({ /* config */ });
   // Steps that cause the issue
   ```

3. **Expected vs Actual Behavior**
4. **Error Messages** (full stack traces)
5. **Additional Context**

### Feature Requests

For new features:

1. **Check existing issues** for similar requests
2. **Describe the use case** and motivation
3. **Propose an API design** if applicable
4. **Consider backwards compatibility**

## Release Process

### Version Strategy

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] Git tag created
- [ ] npm package published

## Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- **Be respectful** in all interactions
- **Be constructive** in feedback and criticism
- **Be patient** with new contributors
- **Follow GitHub's Community Guidelines**

### Recognition

Contributors will be recognized in:
- **CONTRIBUTORS.md** - All contributors listed
- **Release Notes** - Major contributors highlighted
- **Package.json** - Core maintainers listed

## Questions?

- **GitHub Issues**: Technical questions and bug reports
- **GitHub Discussions**: General questions and ideas
- **Email**: alex.potapenko.dev@gmail.com for sensitive issues

Thank you for contributing to pg-agent-memory! 🚀