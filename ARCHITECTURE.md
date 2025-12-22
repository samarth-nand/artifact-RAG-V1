# Architecture & Design

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Application                       │
├─────────────────────────────────────────────────────────────┤
│  1. POST /attempts → Get upload URL + attempt ID            │
│  2. Upload audio to S3 (presigned)                          │
│  3. POST /attempts/{id}/process → Trigger grading          │
│  4. Poll GET /attempts/{id} → Retrieve results             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    AWS Infrastructure                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌─────────────┐     ┌──────────────┐ │
│  │ API Gateway  │──────│   Lambda    │────→│  S3 Bucket   │ │
│  │ (REST API)   │      │ (Handlers)  │     │ (Audio)      │ │
│  └──────────────┘      └─────────────┘     └──────────────┘ │
│                              ↓                                │
│                        ┌──────────────────────┐              │
│                        │  Processing Logic    │              │
│                        │  1. Transcribe       │              │
│                        │  2. Retrieve KB      │              │
│                        │  3. Grade with LLM   │              │
│                        │  4. Store Results    │              │
│                        └──────────────────────┘              │
│                              ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Neon Postgres (pgvector)                       │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ • kb_documents (titles, checksums)                    │ │
│  │ • kb_chunks (text, page ranges, embeddings)           │ │
│  │ • attempts (status, transcripts)                      │ │
│  │ • attempt_results (scores, feedback, citations)       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    External Services                          │
├──────────────────────────────────────────────────────────────┤
│  • OpenAI: Transcription, Embeddings, Grading               │
│  • Neon: Managed Postgres with pgvector                     │
└──────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. API Layer (`src/api/`)

**Handlers:**
- `postAttempts` - Create attempt + presigned URL
- `postProcessAttempt` - Trigger transcription → grading
- `getAttemptHandler` - Poll for results

**Responsibilities:**
- Validate inputs (Zod schemas)
- Manage HTTP responses
- Database transaction handling

### 2. Knowledge Base Layer (`src/kb/`)

**Modules:**

#### `embed.ts`
- OpenAI embedding API wrapper
- Token counting (js-tiktoken)
- Batch embedding support

#### `chunking.ts`
- Smart text chunking (500-900 tokens)
- Overlap handling (100 tokens)
- Token counting and cleanup
- Section detection (stub)

#### `retrieve.ts`
- pgvector semantic search (cosine similarity)
- MMR (Maximal Marginal Relevance) diversity filter
- Top-K selection algorithm
- Citation metadata preservation

#### `ingestPdf.ts`
- PDF text extraction (pdf-parse)
- Checksum-based deduplication
- Batch + single file ingestion
- Page boundary preservation

### 3. LLM Layer (`src/llm/`)

**Modules:**

#### `transcribe.ts`
- Whisper audio transcription
- Async streaming support
- Error handling + retry

#### `grade.ts`
- Main grading orchestration
- Retry logic with JSON repair
- Zod validation
- Error recovery

#### `prompts.ts`
- System prompt (enforcement of RAG constraints)
- User prompt (question + context assembly)
- Repair prompt (JSON fixing)

### 4. Database Layer (`src/db/`)

**Schema:**

```
kb_documents
├── id (UUID PK)
├── title (string)
├── source_type ("pdf")
├── source_uri (string)
├── checksum (string, UNIQUE)
└── created_at

kb_chunks
├── id (UUID PK)
├── document_id (FK)
├── chunk_index (int)
├── page_start/page_end (int)
├── section (string, nullable)
├── content (text)
├── content_tokens (int)
├── embedding (vector(1536))
└── indexes:
    ├── (document_id, chunk_index) UNIQUE
    └── embedding (IVFFlat for pgvector)

attempts
├── id (UUID PK)
├── user_id (string)
├── question_id (string)
├── audio_s3_key (string)
├── status ("created"|"uploaded"|"transcribing"|"grading"|"done"|"failed")
├── transcript (text, nullable)
├── error (text, nullable)
└── indexes:
    ├── user_id
    └── status

attempt_results
├── id (UUID PK)
├── attempt_id (FK, UNIQUE)
├── overall_score (int)
├── dimension_scores (JSONB)
├── feedback (JSONB)
├── citations (JSONB)
└── created_at
```

**Connections:**
- Connection pooling (10 max connections)
- Idle timeout: 20s
- Connection timeout: 10s
- Automatic reconnect

### 5. Shared Layer (`src/shared/`)

**Modules:**

#### `env.ts`
- Environment validation (Zod)
- Centralized config
- Type safety

#### `types.ts`
- Question bank (in-memory)
- Rubric dimensions
- Branded UUIDs

#### `zod.ts`
- API request/response schemas
- Grade result schema
- Type inference

#### `logger.ts`
- Structured logging
- Log level filtering
- Timestamp tagging

### 6. Utility Layer (`src/util/`)

- `s3.ts` - Presigned URLs, S3 downloads
- `hash.ts` - SHA256 checksums
- `time.ts` - Timestamp utilities

## Data Flow

### Upload & Grading Flow

```
1. Client: POST /attempts
   ↓
   Handler creates attempt (status="created")
   ↓
   Return { attemptId, uploadUrl, audioKey }

2. Client: PUT presigned_url (binary audio)
   ↓
   S3 stores audio file

3. Client: POST /attempts/{id}/process
   ↓
   Update status → "transcribing"
   ↓
   Download audio from S3
   ↓
   Call OpenAI Whisper API
   ↓
   Store transcript in DB
   ↓
   Update status → "grading"
   ↓
   Embed transcript + retrieve KB chunks (pgvector)
   ↓
   Call OpenAI chat API with:
      - System prompt (RAG constraints)
      - User prompt (question + transcript + chunks)
   ↓
   Parse + validate JSON result (Zod)
   ↓
   Store results in DB
   ↓
   Update status → "done"
   ↓
   Return { status, transcript, result }

4. Client: GET /attempts/{id}
   ↓
   Return attempt with all stored data
   ↓
   If status == "done", include full grading result
```

### Knowledge Base Ingestion

```
1. CLI: npm run ingest -- --file book.pdf --title "Title"
   ↓
   Read PDF file
   ↓
   Extract text (preserving page numbers)
   ↓
   Compute SHA256 checksum
   ↓
   Check if document exists (deduplication)
   ↓
   Create document record
   ↓
   Split text into chunks (500-900 tokens)
   ↓
   Batch embed chunks using OpenAI
   ↓
   Insert chunks into KB with embeddings
   ↓
   Log: "Ingested N chunks"
```

### Retrieval & Grading Logic

```
1. Input: Transcript text
   ↓
   Embed using OpenAI (same model as KB)
   ↓
   Query pgvector: SELECT * ORDER BY embedding <=> query
   ↓
   Get top 30 raw chunks
   ↓
   Apply MMR filter:
      - Greedily select chunks
      - Avoid page range overlap > 80%
      - Target 12 final chunks
   ↓
   Return [chunk_id, title, page_start/end, content, ...]

2. Build grading context:
   - Question text (from QUESTION_BANK)
   - Transcript
   - Retrieved chunks (formatted with citations)
   - Rubric dimensions
   ↓
   Call LLM:
      POST /v1/chat/completions
      system: RAG enforcement prompt
      user: assembled context
   ↓
   Parse response as JSON
   ↓
   Validate against GradeResultSchema
   ↓
   If invalid, retry with repair prompt
   ↓
   Extract citations and store
```

## Error Handling Strategy

### Transient Errors (Retry)

- OpenAI API rate limits (backoff)
- Network timeouts (exponential backoff)
- Temporary DB connection loss (reconnect)

### Permanent Errors (Fail Fast)

- Invalid audio format → Status: "failed"
- No KB documents available → Grade with empty context, mark as "done"
- Invalid JSON from LLM → Retry once, then fail
- Database schema mismatch → Crash (needs migration)

### Graceful Degradation

- No KB chunks found → Grade based on transcript alone
- Embedding API down → Continue with keyword search (stub)
- Missing question → Use default rubric dimensions

## Scaling Architecture

### Current (MVP)

```
Single Lambda ← Synchronous processing
  ↓
Postgres connection pool (10)
  ↓
S3 bucket (single region)
```

### Phase 2: Async Processing

```
Lambda (Fast)
  ↓ (SQS message)
Lambda Worker Pool (Slow)
  ├─ Transcription
  ├─ KB Retrieval
  └─ Grading
  ↓
Postgres (with read replicas)
```

### Phase 3: Global Scale

```
API Gateway (Multi-region)
  ├─ us-east-1 Lambda
  ├─ eu-west-1 Lambda
  └─ ap-southeast-1 Lambda
      ↓
Postgres (Neon multi-region)
S3 (CloudFront CDN)
ElastiCache (Redis)
```

## Security Considerations

1. **Secrets Management**
   - Store in AWS Secrets Manager
   - Never commit `.env` to git
   - Rotate OpenAI keys regularly

2. **Database Security**
   - Connections encrypted (SSL/TLS)
   - IP whitelisting (Neon firewall)
   - Connection pooling to limit footprint

3. **S3 Security**
   - Block public access
   - Presigned URLs (time-limited)
   - Server-side encryption
   - Bucket versioning

4. **API Security**
   - CORS restricted to frontend domain
   - Rate limiting (API Gateway)
   - Input validation (Zod)
   - No secrets in logs

5. **LLM Prompt Injection**
   - System prompt enforces constraints
   - User input is quoted/sanitized
   - Output is JSON-validated
   - Citations must reference actual chunks

## Performance Characteristics

### Latency

| Operation | Time | Bottleneck |
|-----------|------|-----------|
| Create attempt | ~200ms | S3 presigned URL generation |
| Transcribe (30s audio) | ~5-10s | OpenAI API |
| Retrieve KB | ~500ms | pgvector search + MMR |
| Grade (LLM call) | ~10-15s | OpenAI API latency |
| Total process | ~20-30s | LLM calls |

### Throughput

- Single Lambda: ~10 concurrent grading operations
- With Lambda auto-scaling: 100+ concurrent
- Postgres: ~1000 QPS with pooling

### Storage

- ~1MB per KB chunk (with embedding)
- ~1MB per attempt result (JSON)
- 1000 chunks = ~1GB storage

## Cost Estimation

### Monthly (10K attempts)

- **OpenAI API**: ~$150
  - Transcription: 10K × ~$0.008 = $80
  - Embeddings: 10K × 12 chunks × $0.00004 = $5
  - Grading: 10K × ~$0.006 = $60

- **AWS Lambda**: ~$20
  - 30K function invocations × $0.0000002 = ~$6
  - Compute: 10K × 25s @ 1GB = ~$14

- **S3**: ~$5
  - 10K audio files @ 1MB = 10GB storage = $0.23
  - Uploads/downloads = ~$2

- **Postgres (Neon)**: ~$50
  - 5M rows (chunks + results)
  - ~10GB storage
  - Always-on compute

- **Total**: ~$225/month

## Future Enhancements

### Short Term (1-2 months)

- [ ] Question management UI (CRUD)
- [ ] Custom rubric templates
- [ ] Batch attempt processing
- [ ] Email notifications

### Medium Term (3-6 months)

- [ ] Multi-language support
- [ ] Video + audio support
- [ ] Real-time feedback (streaming)
- [ ] Advanced analytics dashboard

### Long Term (6-12 months)

- [ ] Custom LLM fine-tuning
- [ ] A/B testing framework
- [ ] Federated learning for private data
- [ ] Offline processing (edge Lambda)

---

For implementation details, refer to the inline code comments in each module.
