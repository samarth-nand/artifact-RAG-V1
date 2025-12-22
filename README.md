# artifact-grader

A production-grade, AI-powered grading system for student artifacts (PM interview responses) using RAG (Retrieval Augmented Generation), pgvector semantic search, and LLM-based evaluation.

## Architecture

**Stack:**
- **Language:** TypeScript (Node.js 20)
- **Infra:** AWS Lambda + API Gateway + S3 (via SST v3)
- **Database:** Neon Postgres with pgvector extension
- **ORM:** Drizzle ORM (with full migrations support)
- **Vector Search:** pgvector (cosine similarity + MMR diversity)
- **LLM:** OpenAI (Whisper for transcription, text-embedding-3-small for embeddings, configurable chat model for grading)
- **PDF Ingestion:** Local CLI script with pdf-parse

## Features

✅ **Audio Upload & Transcription**
- Presigned S3 URLs for secure client-side uploads
- Whisper API transcription

✅ **RAG-Grounded Evaluation**
- Retrieve relevant book excerpts using semantic search
- Grade responses using only provided context
- Automatic citation generation with chunk IDs and page ranges

✅ **Structured Output**
- JSON-validated grading results
- Dimension-based scoring with evidence
- Missed concept identification
- Actionable feedback

✅ **PDF Knowledge Base**
- Idempotent ingestion with checksums
- Automatic text extraction + smart chunking (500–900 tokens)
- Overlap-based context preservation
- Section detection and metadata tracking

✅ **Developer Experience**
- Type-safe throughout (Zod schemas)
- Comprehensive error handling
- Structured logging with levels
- Local development with `sst dev`
- One-command deployment

## Quick Start

### Prerequisites

- Node.js 20+
- Neon Postgres instance (or any Postgres with pgvector)
- OpenAI API key
- AWS account (for SST deployment)

### 1. Clone & Install

```bash
cd artifact-grader
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
DATABASE_URL=postgresql://user:password@host/database
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIBE_MODEL=whisper-1
OPENAI_EMBED_MODEL=text-embedding-3-small
OPENAI_GRADE_MODEL=gpt-4o-mini
AUDIO_BUCKET_NAME=artifact-grader-audio-dev
AWS_REGION=us-east-1
LOG_LEVEL=info
```

### 3. Database Setup

Create pgvector extension in your Postgres database:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run migrations:
```bash
npm run db:push
```

### 4. Ingest Sample PDFs

```bash
# Single PDF
npm run ingest -- --file "/path/to/Cracking the PM Interview.pdf" --title "Cracking the PM Interview"

# Multiple PDFs
npm run ingest -- --file "/path/to/Decode and Conquer.pdf" --title "Decode and Conquer"
npm run ingest -- --file "/path/to/Secrets of the Product Manager Interview.pdf" --title "Secrets of the Product Manager Interview"
```

### 5. Run Locally

```bash
npm run dev
```

This starts the SST dev server. You'll see:
```
SST dev mode started.
→ API: https://...
```

### 6. Test Endpoints

#### Create an Attempt

```bash
curl -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "questionId": "pm_case_001"
  }'
```

Response:
```json
{
  "attemptId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://bucket.s3.amazonaws.com/...",
  "audioKey": "audio/550e8400-e29b-41d4-a716-446655440000.webm"
}
```

#### Upload Audio

Use the presigned URL to upload your audio file (WebM format):
```bash
curl -X PUT "<PRESIGNED_URL>" \
  --data-binary @audio.webm \
  -H "Content-Type: audio/webm"
```

#### Process Attempt

```bash
curl -X POST http://localhost:3000/attempts/550e8400-e29b-41d4-a716-446655440000/process
```

Response (includes transcript + grading result):
```json
{
  "status": "done",
  "transcript": "...",
  "result": {
    "overall_score": 82,
    "dimension_scores": {
      "Problem Understanding": {
        "score": 85,
        "out_of": 100,
        "rationale": "...",
        "evidence_from_transcript": ["..."],
        "citations": [
          {
            "chunk_id": "uuid",
            "title": "Cracking the PM Interview",
            "page_start": 15,
            "page_end": 20
          }
        ]
      }
    },
    "strengths": ["..."],
    "improvements": ["..."],
    "missed_concepts": ["..."],
    "rewrite_suggestion": "...",
    "next_drill": "...",
    "citations": [...]
  }
}
```

#### Get Attempt Status

```bash
curl http://localhost:3000/attempts/550e8400-e29b-41d4-a716-446655440000
```

## Folder Structure

```
artifact-grader/
├── src/
│   ├── shared/
│   │   ├── env.ts              # Environment validation (Zod)
│   │   ├── types.ts            # Question bank + shared types
│   │   ├── zod.ts              # API schemas
│   │   └── logger.ts           # Structured logging
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema (documents, chunks, attempts, results)
│   │   ├── index.ts            # Database initialization
│   │   └── migrations/         # Drizzle migrations (auto-generated)
│   ├── kb/
│   │   ├── embed.ts            # OpenAI embeddings + token counting
│   │   ├── chunking.ts         # Text chunking with overlap
│   │   ├── retrieve.ts         # pgvector semantic search + MMR
│   │   └── ingestPdf.ts        # PDF ingestion with checksums
│   ├── llm/
│   │   ├── openai.ts           # OpenAI client initialization
│   │   ├── transcribe.ts       # Whisper transcription
│   │   ├── grade.ts            # Grading logic with retry + JSON repair
│   │   └── prompts.ts          # System + user prompts
│   ├── api/
│   │   ├── attempts.create.ts  # POST /attempts
│   │   ├── attempts.process.ts # POST /attempts/:id/process
│   │   ├── attempts.get.ts     # GET /attempts/:id
│   │   └── index.ts            # Lambda handlers
│   └── util/
│       ├── s3.ts               # Presigned URLs + S3 operations
│       ├── hash.ts             # Checksum generation
│       └── time.ts             # Timestamp utilities
├── scripts/
│   └── ingest.ts               # PDF ingestion CLI
├── sst.config.ts               # SST infrastructure config
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Database Schema

### kb_documents
```sql
CREATE TABLE kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,  -- "pdf"
  source_uri TEXT,
  checksum TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
```

### kb_chunks
```sql
CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  section TEXT,
  content TEXT NOT NULL,
  content_tokens INTEGER,
  embedding vector(1536),  -- pgvector
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);
CREATE INDEX kb_chunks_embedding_idx ON kb_chunks USING ivfflat (embedding);
```

### attempts
```sql
CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  audio_s3_key TEXT,
  status TEXT NOT NULL,  -- "created" | "uploaded" | "transcribing" | "grading" | "done" | "failed"
  transcript TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX attempts_user_id_idx ON attempts(user_id);
CREATE INDEX attempts_status_idx ON attempts(status);
```

### attempt_results
```sql
CREATE TABLE attempt_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL,
  dimension_scores JSONB NOT NULL,
  feedback JSONB NOT NULL,
  citations JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
```

## API Endpoints

### POST /attempts
Create a new grading attempt and get a presigned S3 upload URL.

**Request:**
```json
{
  "userId": "string",
  "questionId": "string (from QUESTION_BANK)"
}
```

**Response:**
```json
{
  "attemptId": "uuid",
  "uploadUrl": "https://s3.../presigned-url",
  "audioKey": "string"
}
```

**Status Codes:** `200`, `400`

---

### POST /attempts/{attemptId}/process
Trigger transcription → KB retrieval → grading.

**Response:**
```json
{
  "status": "done" | "failed",
  "transcript": "string (optional)",
  "result": { GradeResult (optional) },
  "error": "string (optional)"
}
```

**Status Codes:** `200`, `500`

---

### GET /attempts/{attemptId}
Poll for attempt status and results.

**Response:**
```json
{
  "attemptId": "uuid",
  "status": "created" | "uploaded" | "transcribing" | "grading" | "done" | "failed",
  "transcript": "string (optional)",
  "result": { GradeResult (optional) },
  "error": "string (optional)"
}
```

**Status Codes:** `200`, `404`, `500`

## Grading Output Schema

```typescript
interface GradeResult {
  overall_score: number;              // 0-100
  dimension_scores: Record<string, {
    score: number;                    // 0-100
    out_of: number;                   // 0-100
    rationale: string;
    evidence_from_transcript: string[];
    citations: Citation[];            // chunk references
  }>;
  strengths: string[];
  improvements: string[];
  missed_concepts: string[];
  rewrite_suggestion: string;
  next_drill: string;
  citations: Citation[];              // deduplicated
}

interface Citation {
  chunk_id: string;                   // UUID of KB chunk
  title: string;                      // Book title
  page_start: number;
  page_end: number;
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Postgres connection string (required) |
| `OPENAI_API_KEY` | — | OpenAI API key (required) |
| `OPENAI_TRANSCRIBE_MODEL` | `whisper-1` | Whisper model for audio |
| `OPENAI_EMBED_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_GRADE_MODEL` | `gpt-4o-mini` | LLM for grading |
| `AUDIO_BUCKET_NAME` | — | S3 bucket for audio uploads |
| `AWS_REGION` | `us-east-1` | AWS region |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | `development` | Node environment |

### Questions & Rubric

Edit `src/shared/types.ts` to add/modify questions:

```typescript
export const QUESTION_BANK: Record<string, Question> = {
  pm_case_001: {
    questionId: "pm_case_001",
    questionText: "Your question here?",
    rubricDimensions: ["Dimension 1", "Dimension 2", ...],
  },
  // Add more questions
};
```

## Development

### TypeScript Compilation

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

### Local Development

```bash
npm run dev
```

Runs SST in dev mode, hot-reloading Lambda functions.

### Database Management

```bash
# Push schema changes to DB (auto-generate migrations)
npm run db:push

# Generate migrations manually
npm run db:generate

# Run migrations
npm run db:migrate
```

## Deployment

### 1. Set AWS Credentials

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
```

### 2. Update Environment

Set production environment variables in `.env.production` (or AWS Secrets Manager).

### 3. Deploy

```bash
npm run deploy
```

SST will:
- Package the Lambda functions
- Create/update S3 bucket
- Deploy API Gateway routes
- Output the API URL

### 4. Post-Deployment

Set environment variables in Lambda:
```bash
sst secrets set DATABASE_URL postgresql://...
sst secrets set OPENAI_API_KEY sk-...
```

Or update via AWS Lambda console.

## Knowledge Base Ingestion Examples

### Single PDF

```bash
npm run ingest -- \
  --file "~/Documents/Cracking the PM Interview.pdf" \
  --title "Cracking the PM Interview"
```

### Multiple PDFs

```bash
npm run ingest -- --file "./books/Cracking the PM Interview.pdf" --title "Cracking the PM Interview"
npm run ingest -- --file "./books/Decode and Conquer.pdf" --title "Decode and Conquer"
npm run ingest -- --file "./books/Secrets of the Product Manager Interview.pdf" --title "Secrets of the Product Manager Interview"
```

### Batch Ingestion with Mapping

Create `book_titles.json`:
```json
{
  "cracking.pdf": "Cracking the PM Interview",
  "decode.pdf": "Decode and Conquer",
  "secrets.pdf": "Secrets of the Product Manager Interview"
}
```

Then:
```bash
npm run ingest -- --dir ./books --titleMap ./book_titles.json
```

## Troubleshooting

### Database Connection Error

- Ensure `DATABASE_URL` is correct
- Verify pgvector extension: `CREATE EXTENSION vector;`
- Check firewall/network access

### Transcription Fails

- Verify audio format (WebM or WAV supported)
- Check `OPENAI_API_KEY`
- Check OpenAI quota/rate limits

### Grading Returns Invalid JSON

- Check LLM logs: `LOG_LEVEL=debug npm run dev`
- The system retries once with a JSON repair prompt
- If still failing, check `OPENAI_GRADE_MODEL` availability

### PDF Ingestion Duplicates

- Checksums are computed from raw text
- Re-running the same PDF will skip (idempotent)
- To force re-ingestion, delete the document row in Postgres

### S3 Upload Fails

- Verify bucket exists and Lambda has IAM permissions
- Check presigned URL expiration
- Ensure `AUDIO_BUCKET_NAME` is correct

## Future Enhancements

- [ ] SQS-based async processing (move `processAttempt` to worker)
- [ ] Redis caching for embeddings
- [ ] Multi-modal grading (video + audio)
- [ ] Custom rubric templates
- [ ] Feedback analytics dashboard
- [ ] A/B testing of grading prompts
- [ ] Support for multiple LLM providers (Anthropic, local models)

## Contributing

1. Create a feature branch
2. Make changes and ensure `npm run typecheck` passes
3. Test locally with `npm run dev`
4. Submit a pull request

## License

MIT

---

**Questions?** Check the inline comments in the code or open an issue.
