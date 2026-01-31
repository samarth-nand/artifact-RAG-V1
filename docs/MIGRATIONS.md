-- This file documents the Drizzle migration process
-- Generated migrations will appear in src/db/migrations/

-- Initial Schema (created by Drizzle):

CREATE TABLE kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_uri TEXT,
  checksum TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  section TEXT,
  content TEXT NOT NULL,
  content_tokens INTEGER,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);

CREATE INDEX kb_chunks_embedding_idx ON kb_chunks USING ivfflat (embedding);
CREATE INDEX kb_chunks_document_id_idx ON kb_chunks(document_id);

CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  audio_s3_key TEXT,
  status TEXT NOT NULL,
  transcript TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX attempts_user_id_idx ON attempts(user_id);
CREATE INDEX attempts_status_idx ON attempts(status);

CREATE TABLE attempt_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID UNIQUE NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL,
  dimension_scores JSONB NOT NULL,
  feedback JSONB NOT NULL,
  citations JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- Migration Commands:

-- First time setup:
npm run db:push

-- After schema changes:
npm run db:generate    # Generate migration files
npm run db:migrate     # Apply pending migrations

-- Or to auto-push without generating files:
npm run db:push        # Introspect and push

-- To verify schema:
npx drizzle-kit studio

-- Notes:
-- - Migrations are generated in src/db/migrations/
-- - Each migration is SQL + metadata
-- - pgvector extension must exist before migrations
-- - IVFFlat index is used for embeddings (efficient similarity search)
-- - All timestamps default to now() in UTC
