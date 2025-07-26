#!/bin/bash

# Docker integration test runner for pg-agent-memory
# Uses docker compose for reliable PostgreSQL with pgvector setup

set -e

echo "🐳 Starting PostgreSQL with pgvector using docker compose..."

# Detect docker compose command (prefer modern 'docker compose')
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Docker Compose not found. Please install Docker with Compose plugin."
    exit 1
fi

echo "ℹ️ Using: $DOCKER_COMPOSE"

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up Docker containers..."
    $DOCKER_COMPOSE down -v
}
trap cleanup EXIT

# Start PostgreSQL container
echo "🚀 Starting PostgreSQL container..."
$DOCKER_COMPOSE up -d postgres

# Wait for PostgreSQL to be healthy
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if $DOCKER_COMPOSE exec -T postgres pg_isready -h localhost -p 5432 -U agent_user &> /dev/null; then
        echo "✅ PostgreSQL is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ PostgreSQL failed to start after 60 seconds"
        $DOCKER_COMPOSE logs postgres
        exit 1
    fi
    echo "⏳ Waiting for PostgreSQL... ($i/30)"
    sleep 2
done

# Set test database URL (matches docker compose configuration)
export DATABASE_URL="postgresql://agent_user:agent_pass@localhost:5433/agent_memory"
export TEST_DATABASE_URL="$DATABASE_URL"
export NODE_ENV=test

echo "✅ PostgreSQL ready at: $DATABASE_URL"

# Run comprehensive test suite
echo ""
echo "🔬 Running unit tests (fast, no database required)..."
npm test

echo ""
echo "🔬 Running integration tests with PostgreSQL..."
npm run test:integration

echo ""
echo "🏃 Running performance benchmarks..."
npm run benchmark

# Run examples if requested
if [ "$1" = "--with-examples" ]; then
  echo ""
  echo "📚 Running examples..."
  npm run example:all
fi

echo "✅ All Docker tests completed successfully!"