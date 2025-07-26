#!/bin/bash

# Development environment setup with Docker
# Starts PostgreSQL with pgvector for local development

set -e

echo "🚀 pg-agent-memory Development Environment"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check docker compose command (prefer modern 'docker compose')
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    echo "⚠️  Using legacy docker-compose command. Consider updating to Docker with Compose plugin."
    COMPOSE_CMD="docker-compose"
else
    echo "❌ Docker Compose not found. Please install Docker with Compose plugin."
    exit 1
fi

# Parse command
COMMAND=${1:-up}

case $COMMAND in
    up|start)
        echo "🐳 Starting PostgreSQL with pgvector..."
        $COMPOSE_CMD up -d
        
        echo "⏳ Waiting for database to be ready..."
        sleep 5
        
        echo ""
        echo "✅ Development database ready!"
        echo ""
        echo "📋 Connection Details:"
        echo "   DATABASE_URL=postgresql://agent_user:agent_pass@localhost:5433/agent_memory"
        echo ""
        echo "🔧 Next steps:"
        echo "   1. Copy .env.example to .env"
        echo "   2. Run: npm run example:basic"
        echo "   3. Run: npm run test:integration"
        ;;
        
    down|stop)
        echo "🛑 Stopping development database..."
        $COMPOSE_CMD down
        echo "✅ Database stopped"
        ;;
        
    clean)
        echo "🧹 Cleaning up database and volumes..."
        $COMPOSE_CMD down -v
        echo "✅ Database and data cleaned"
        ;;
        
    logs)
        echo "📜 Database logs:"
        $COMPOSE_CMD logs -f postgres
        ;;
        
    shell)
        echo "🔍 Connecting to database shell..."
        $COMPOSE_CMD exec postgres psql -U agent_user -d agent_memory
        ;;
        
    status)
        echo "📊 Database status:"
        $COMPOSE_CMD ps
        ;;
        
    *)
        echo "Usage: $0 {up|down|clean|logs|shell|status}"
        echo ""
        echo "Commands:"
        echo "  up/start - Start development database"
        echo "  down/stop - Stop database (data persists)"
        echo "  clean - Stop database and delete all data"
        echo "  logs - Show database logs"
        echo "  shell - Connect to PostgreSQL shell"
        echo "  status - Show container status"
        exit 1
        ;;
esac