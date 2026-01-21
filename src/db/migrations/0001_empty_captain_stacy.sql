-- Render (and many managed Postgres providers) do not include pgvector by default.
-- This app stores embeddings as JSON in a TEXT column and computes similarity in JS.

-- Needed for gen_random_uuid() defaults used across tables
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "kb_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"source_uri" text,
	"checksum" text NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "kb_documents_checksum_unique" ON "kb_documents" ("checksum");

CREATE TABLE IF NOT EXISTS "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"document_id" uuid NOT NULL REFERENCES "kb_documents" ("id") ON DELETE CASCADE,
	"chunk_index" integer NOT NULL,
	"page_start" integer NOT NULL,
	"page_end" integer NOT NULL,
	"section" text,
	"content" text NOT NULL,
	"content_tokens" integer,
	"embedding" text NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "kb_chunks_document_chunk_idx" ON "kb_chunks" ("document_id", "chunk_index");
CREATE INDEX IF NOT EXISTS "kb_chunks_document_id_idx" ON "kb_chunks" ("document_id");

-- Attempts
CREATE TABLE IF NOT EXISTS "attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"audio_s3_key" text,
	"status" text NOT NULL,
	"transcript" text,
	"error" text,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "attempts_user_id_idx" ON "attempts" ("user_id");
CREATE INDEX IF NOT EXISTS "attempts_status_idx" ON "attempts" ("status");

CREATE TABLE IF NOT EXISTS "attempt_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"attempt_id" uuid NOT NULL REFERENCES "attempts" ("id") ON DELETE CASCADE,
	"overall_score" integer NOT NULL,
	"dimension_scores" jsonb NOT NULL,
	"feedback" jsonb NOT NULL,
	"citations" jsonb NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "attempt_results_attempt_id_unique" ON "attempt_results" ("attempt_id");

-- If an older environment created kb_chunks.embedding as a pgvector column,
-- normalize it to text so retrieval logic works consistently.
ALTER TABLE IF EXISTS "kb_chunks" ALTER COLUMN "embedding" SET DATA TYPE text;