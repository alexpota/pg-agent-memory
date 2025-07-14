#!/bin/bash

# Docker integration test runner for pg-agent-memory
# Spins up PostgreSQL with pgvector for testing

set -e

echo "🐳 Starting PostgreSQL with pgvector in Docker..."

# Container name
CONTAINER_NAME="pg-agent-memory-test"
DB_NAME="agent_memory_test"
DB_USER="test_user"
DB_PASSWORD="test_pass"
DB_PORT="5433"

# Stop and remove existing container if exists
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Start PostgreSQL with pgvector
echo "📦 Starting PostgreSQL 16 with pgvector..."

# Try to pull image first (ignore credential errors)
docker pull pgvector/pgvector:pg16 2>/dev/null || echo "⚠️  Could not pull image, will try to use local or let Docker pull it..."

# Run container
docker run -d \
  --name $CONTAINER_NAME \
  -e POSTGRES_DB=$DB_NAME \
  -e POSTGRES_USER=$DB_USER \
  -e POSTGRES_PASSWORD=$DB_PASSWORD \
  -p $DB_PORT:5432 \
  pgvector/pgvector:pg16

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to start..."
sleep 5

# Check if container is running
if ! docker ps | grep -q $CONTAINER_NAME; then
  echo "❌ Failed to start PostgreSQL container"
  exit 1
fi

# Set test database URL
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:$DB_PORT/$DB_NAME"
export TEST_DATABASE_URL=$DATABASE_URL

echo "✅ PostgreSQL ready at: $DATABASE_URL"

# Run tests sequentially to avoid race conditions
echo ""
echo "🧪 Running integration tests..."
echo "Using DATABASE_URL: $DATABASE_URL"
echo "Running database tests..."
DATABASE_URL="$DATABASE_URL" npx vitest run tests/integration/database.test.ts

echo ""
echo "Running embeddings tests..."
DATABASE_URL="$DATABASE_URL" npx vitest run tests/integration/embeddings.test.ts

# Run examples if requested
if [ "$1" = "--with-examples" ]; then
  echo ""
  echo "📚 Running examples..."
  npm run example:all
fi

# Cleanup
echo ""
echo "🧹 Cleaning up..."
docker stop $CONTAINER_NAME
docker rm $CONTAINER_NAME

echo "✅ Docker tests complete!"