# Contributing to pg-agent-memory

Thank you for your interest in contributing to pg-agent-memory! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v12 or higher with pgvector extension
- **npm**: v8.0.0 or higher

### Getting Started

1. **Fork and Clone**
   ```bash
   git clone https://github.com/[your-username]/pg-agent-memory.git
   cd pg-agent-memory
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Database**
   ```bash
   # Install PostgreSQL and pgvector extension
   # Create a test database
   createdb pg_agent_memory_test
   ```

4. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your database connection details
   ```

5. **Run Tests**
   ```bash
   npm test                    # Unit tests only
   npm run test:integration    # Requires PostgreSQL
   npm run test:all           # All tests
   ```

6. **Build and Validate**
   ```bash
   npm run build              # Build the package
   npm run validate           # Full validation (recommended before commits)
   npm run validate:quick     # Quick validation (type check + lint)
   ```

## Development Workflow

### Branching Strategy

- **main**: Production-ready code
- **develop**: Integration branch for features
- **feature/[name]**: Individual feature branches
- **fix/[name]**: Bug fix branches

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

Our pre-commit hooks automatically run:
1. **Type checking** - Ensures TypeScript compiles
2. **Linting** - ESLint with auto-fix for changed files
3. **Tests** - Unit tests must pass
4. **Formatting** - Prettier formatting

If validation fails, fix the issues and commit again.

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

- **Coverage**: Minimum 95% line coverage
- **Test Types**:
  - `*.unit.test.ts` - Unit tests with mocks
  - `*.integration.test.ts` - Integration tests with real PostgreSQL
  - `*.e2e.test.ts` - End-to-end workflow tests

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
   npm run validate  # Must pass completely
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
├── memory/           # Core memory management
├── types/           # TypeScript definitions
├── errors/          # Error classes
├── db/             # Database schema and migrations
└── index.ts        # Main exports

tests/
├── unit/           # Unit tests with mocks
├── integration/    # Integration tests with real DB
└── setup.ts       # Test configuration
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