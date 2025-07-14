-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Memories table for storing agent conversations and context
CREATE TABLE IF NOT EXISTS agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    metadata JSONB DEFAULT '{}',
    importance REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
    embedding vector(1536), -- OpenAI ada-002 dimensions
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT valid_role CHECK (role IN ('user', 'assistant', 'system')),
    CONSTRAINT valid_importance CHECK (importance >= 0 AND importance <= 1)
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_memories_agent_conversation ON agent_memories(agent_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_memories_agent_created ON agent_memories(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_conversation_created ON agent_memories(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON agent_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_expires ON agent_memories(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_role ON agent_memories(role);

-- Vector similarity search index (HNSW for best performance)
CREATE INDEX IF NOT EXISTS idx_memories_embedding_hnsw ON agent_memories 
USING hnsw (embedding vector_cosine_ops) 
WHERE embedding IS NOT NULL;

-- IVFFlat index as fallback for smaller datasets
CREATE INDEX IF NOT EXISTS idx_memories_embedding_ivfflat ON agent_memories 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
WHERE embedding IS NOT NULL;

-- Composite index for filtered vector searches
CREATE INDEX IF NOT EXISTS idx_memories_agent_embedding ON agent_memories(agent_id) 
WHERE embedding IS NOT NULL;

-- Memory sharing table for multi-agent scenarios
CREATE TABLE IF NOT EXISTS agent_memory_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES agent_memories(id) ON DELETE CASCADE,
    shared_with_agent VARCHAR(255) NOT NULL,
    scope VARCHAR(20) NOT NULL DEFAULT 'shared',
    granted_by VARCHAR(255) NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT valid_scope CHECK (scope IN ('private', 'shared', 'public')),
    CONSTRAINT unique_memory_share UNIQUE(memory_id, shared_with_agent)
);

-- Indexes for memory sharing
CREATE INDEX IF NOT EXISTS idx_memory_shares_agent ON agent_memory_shares(shared_with_agent);
CREATE INDEX IF NOT EXISTS idx_memory_shares_memory ON agent_memory_shares(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_shares_scope ON agent_memory_shares(scope);

-- Memory summaries table for compression
CREATE TABLE IF NOT EXISTS agent_memory_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    original_memory_count INTEGER NOT NULL,
    compression_ratio REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summarized_period_start TIMESTAMPTZ NOT NULL,
    summarized_period_end TIMESTAMPTZ NOT NULL,
    
    -- Constraints
    CONSTRAINT unique_summary_period UNIQUE(agent_id, conversation_id, summarized_period_start, summarized_period_end)
);

-- Indexes for summaries
CREATE INDEX IF NOT EXISTS idx_summaries_agent_conversation ON agent_memory_summaries(agent_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_summaries_created ON agent_memory_summaries(created_at DESC);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update timestamps
CREATE TRIGGER update_agent_memories_updated_at 
    BEFORE UPDATE ON agent_memories 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically clean up expired memories
CREATE OR REPLACE FUNCTION cleanup_expired_memories()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM agent_memories 
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate memory statistics
CREATE OR REPLACE FUNCTION get_memory_stats(p_agent_id VARCHAR(255))
RETURNS TABLE(
    total_memories BIGINT,
    total_conversations BIGINT,
    avg_importance REAL,
    memory_size_mb REAL,
    oldest_memory TIMESTAMPTZ,
    newest_memory TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_memories,
        COUNT(DISTINCT conversation_id) as total_conversations,
        AVG(importance) as avg_importance,
        (pg_total_relation_size('agent_memories') / 1024.0 / 1024.0)::REAL as memory_size_mb,
        MIN(created_at) as oldest_memory,
        MAX(created_at) as newest_memory
    FROM agent_memories 
    WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;