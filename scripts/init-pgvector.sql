-- Initialize pgvector database for Agent Architect RAG
-- This script runs automatically when the container is first created

-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Document chunks and embeddings table
CREATE TABLE IF NOT EXISTS embeddings (
    id SERIAL PRIMARY KEY,
    bucket_id TEXT NOT NULL,           -- Context bucket ID (e.g., 'wharfside-docs')
    source_file TEXT NOT NULL,          -- Original file path or name
    page_number INTEGER,                -- Page number (for PDFs)
    chunk_index INTEGER NOT NULL,       -- Chunk position within the document
    chunk_text TEXT NOT NULL,           -- The actual text content
    embedding vector(1536),             -- OpenAI text-embedding-3-small dimension
    metadata JSONB DEFAULT '{}',        -- Additional metadata (title, doc type, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for similarity search (IVFFlat is good for most use cases)
-- Note: This index is created after data is loaded for better performance
-- For now, we'll use exact search which works fine for smaller datasets

-- Index on bucket_id for filtering
CREATE INDEX IF NOT EXISTS idx_embeddings_bucket ON embeddings(bucket_id);

-- Index on source_file for filtering
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_file);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_embeddings_bucket_source ON embeddings(bucket_id, source_file);

-- Document metadata table (tracks what's been indexed)
CREATE TABLE IF NOT EXISTS indexed_documents (
    id SERIAL PRIMARY KEY,
    bucket_id TEXT NOT NULL,
    source_file TEXT NOT NULL,
    file_checksum TEXT NOT NULL,        -- SHA256 of original file
    chunk_count INTEGER NOT NULL,
    total_tokens INTEGER,               -- Approximate token count
    indexed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(bucket_id, source_file)
);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS update_embeddings_updated_at ON embeddings;
CREATE TRIGGER update_embeddings_updated_at
    BEFORE UPDATE ON embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (useful if connecting with different users)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rag;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rag;

-- Add a comment explaining the schema
COMMENT ON TABLE embeddings IS 'Stores document chunks and their vector embeddings for semantic search';
COMMENT ON TABLE indexed_documents IS 'Tracks which documents have been indexed, with checksums for cache validation';
