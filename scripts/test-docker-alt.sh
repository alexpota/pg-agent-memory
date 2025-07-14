#!/bin/bash

# Alternative Docker test runner using official PostgreSQL image
# This avoids the pgvector/pgvector image if there are pull issues

set -e

echo "🐳 Starting PostgreSQL in Docker (alternative method)..."

# Container name
CONTAINER_NAME="pg-agent-memory-test"
DB_NAME="agent_memory_test"
DB_USER="test_user"
DB_PASSWORD="test_pass"
DB_PORT="5433"

# Stop and remove existing container if exists
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Use official PostgreSQL image
echo "📦 Starting PostgreSQL 16..."
docker run -d \
  --name $CONTAINER_NAME \
  -e POSTGRES_DB=$DB_NAME \
  -e POSTGRES_USER=$DB_USER \
  -e POSTGRES_PASSWORD=$DB_PASSWORD \
  -p $DB_PORT:5432 \
  postgres:16-alpine

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to start..."
for i in {1..30}; do
  if docker exec $CONTAINER_NAME pg_isready -U $DB_USER -d $DB_NAME &>/dev/null; then
    echo "✅ PostgreSQL is ready!"
    break
  fi
  echo -n "."
  sleep 1
done
echo ""

# Install pgvector extension
echo "📦 Installing pgvector extension..."
docker exec $CONTAINER_NAME sh -c "
  apk add --no-cache git make gcc musl-dev postgresql-dev && \
  cd /tmp && \
  git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git && \
  cd pgvector && \
  make && \
  make install
"

# Create extension in database
echo "🔧 Creating vector extension..."
docker exec $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Set test database URL
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:$DB_PORT/$DB_NAME"
export TEST_DATABASE_URL=$DATABASE_URL

echo "✅ PostgreSQL with pgvector ready at: $DATABASE_URL"

# Run tests
echo ""
echo "🧪 Running integration tests..."
npm run test:integration

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