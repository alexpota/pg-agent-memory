-- Enhanced Memory Compression Schema Migration
-- Updates agent_memory_summaries table to support comprehensive compression features

-- Drop existing agent_memory_summaries table constraints and recreate with enhanced schema
DROP TABLE IF EXISTS agent_memory_summaries CASCADE;

-- Create enhanced memory summaries table
CREATE TABLE agent_memory_summaries (
    id VARCHAR(30) PRIMARY KEY, -- ULID format: summary_01ARZ3NDEKTSV4RRFFQ69G5FAV
    agent_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(255) NOT NULL,
    
    -- Time window information
    time_window_start TIMESTAMPTZ NOT NULL,
    time_window_end TIMESTAMPTZ NOT NULL,
    time_window_label VARCHAR(100), -- e.g., "last_week", "january_2024"
    
    -- Original memory tracking
    original_memory_ids TEXT[] NOT NULL, -- Array of memory IDs that were compressed
    
    -- Summary content
    summary_content TEXT NOT NULL,
    key_topics TEXT[] DEFAULT '{}', -- Array of extracted key topics
    important_entities TEXT[] DEFAULT '{}', -- Array of important entities
    
    -- Compression metrics
    compression_ratio REAL NOT NULL CHECK (compression_ratio > 0),
    token_count INTEGER NOT NULL CHECK (token_count > 0),
    original_token_count INTEGER NOT NULL CHECK (original_token_count > 0),
    
    -- Optional embedding for semantic search of summaries
    embedding vector(384), -- Sentence Transformers MiniLM-L6-v2 dimensions
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata for compression details
    metadata JSONB DEFAULT '{}', -- Store compression strategy, processing time, etc.
    
    -- Constraints
    CONSTRAINT valid_compression_ratio CHECK (compression_ratio <= 1.0),
    CONSTRAINT valid_time_window CHECK (time_window_end >= time_window_start),
    CONSTRAINT valid_token_compression CHECK (token_count <= original_token_count)
);

-- Indexes for performance optimization
CREATE INDEX idx_summaries_agent_conversation ON agent_memory_summaries(agent_id, conversation_id);
CREATE INDEX idx_summaries_agent_timewindow ON agent_memory_summaries(agent_id, time_window_start, time_window_end);
CREATE INDEX idx_summaries_created ON agent_memory_summaries(created_at DESC);
CREATE INDEX idx_summaries_compression_ratio ON agent_memory_summaries(compression_ratio);
CREATE INDEX idx_summaries_token_count ON agent_memory_summaries(token_count DESC);

-- Vector similarity search index for summaries (if embedding is present)
CREATE INDEX idx_summaries_embedding_hnsw ON agent_memory_summaries 
USING hnsw (embedding vector_cosine_ops) 
WHERE embedding IS NOT NULL;

-- GIN index for array searches on topics and entities
CREATE INDEX idx_summaries_topics_gin ON agent_memory_summaries USING gin(key_topics);
CREATE INDEX idx_summaries_entities_gin ON agent_memory_summaries USING gin(important_entities);
CREATE INDEX idx_summaries_memory_ids_gin ON agent_memory_summaries USING gin(original_memory_ids);

-- JSONB index for metadata searches
CREATE INDEX idx_summaries_metadata_gin ON agent_memory_summaries USING gin(metadata);

-- Function to get compression statistics for an agent
CREATE OR REPLACE FUNCTION get_compression_stats(p_agent_id VARCHAR(255))
RETURNS TABLE(
    total_memories BIGINT,
    raw_memories BIGINT,
    compressed_memories BIGINT,
    summaries BIGINT,
    total_tokens BIGINT,
    raw_tokens BIGINT,
    compressed_tokens BIGINT,
    compression_ratio REAL,
    storage_efficiency REAL,
    last_compression_at TIMESTAMPTZ,
    next_compression_eligible TIMESTAMPTZ
) AS $$
DECLARE
    raw_memory_count BIGINT;
    summary_count BIGINT;
    raw_token_sum BIGINT;
    compressed_token_sum BIGINT;
    original_token_sum BIGINT;
    last_compression TIMESTAMPTZ;
BEGIN
    -- Count raw memories
    SELECT COUNT(*), COALESCE(SUM(LENGTH(content) / 4), 0) -- Rough token estimation
    INTO raw_memory_count, raw_token_sum
    FROM agent_memories 
    WHERE agent_id = p_agent_id;
    
    -- Count summaries and their tokens
    SELECT COUNT(*), COALESCE(SUM(token_count), 0), COALESCE(SUM(original_token_count), 0), MAX(created_at)
    INTO summary_count, compressed_token_sum, original_token_sum, last_compression
    FROM agent_memory_summaries 
    WHERE agent_id = p_agent_id;
    
    -- Calculate metrics
    RETURN QUERY
    SELECT 
        raw_memory_count + summary_count as total_memories,
        raw_memory_count as raw_memories,
        summary_count as compressed_memories,
        summary_count as summaries,
        raw_token_sum + compressed_token_sum as total_tokens,
        raw_token_sum as raw_tokens,
        compressed_token_sum as compressed_tokens,
        CASE 
            WHEN original_token_sum > 0 THEN (compressed_token_sum::REAL / original_token_sum::REAL)
            ELSE 0.0
        END as compression_ratio,
        CASE 
            WHEN original_token_sum > 0 THEN ((original_token_sum - compressed_token_sum)::REAL / original_token_sum::REAL) * 100
            ELSE 0.0
        END as storage_efficiency,
        last_compression as last_compression_at,
        COALESCE(last_compression + INTERVAL '7 days', NOW()) as next_compression_eligible;
END;
$$ LANGUAGE plpgsql;

-- Function to find related summaries based on content similarity
CREATE OR REPLACE FUNCTION find_related_summaries(
    p_agent_id VARCHAR(255),
    p_query_embedding vector(384),
    p_similarity_threshold REAL DEFAULT 0.7,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE(
    summary_id VARCHAR(30),
    conversation_id VARCHAR(255),
    similarity_score REAL,
    summary_content TEXT,
    key_topics TEXT[],
    time_window_start TIMESTAMPTZ,
    time_window_end TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.conversation_id,
        (s.embedding <=> p_query_embedding)::REAL as similarity_score,
        s.summary_content,
        s.key_topics,
        s.time_window_start,
        s.time_window_end
    FROM agent_memory_summaries s
    WHERE s.agent_id = p_agent_id
        AND s.embedding IS NOT NULL
        AND (s.embedding <=> p_query_embedding) < (1 - p_similarity_threshold)
    ORDER BY s.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;