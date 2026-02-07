# Quick Reference

## Commands

```bash
# Setup
npm install
cp .env.example .env
npm run db:push

# Ingest PDFs
npm run ingest -- --file "/path/to/book.pdf" --title "Book Title"
npm run ingest -- --dir "./books" --titleMap "./titles.json"

# Development
npm run dev              # Start local server
npm run build            # Build TypeScript
npm run typecheck        # Type check only
npm run db:migrate       # Run migrations
npm run db:push          # Sync schema to DB

# Production
npm run deploy           # Deploy to AWS
```

## API Examples

### Create Attempt
```bash
curl -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","questionId":"pm_case_001"}'
```

### Upload Audio
```bash
curl -X PUT "<PRESIGNED_URL>" \
  --data-binary @audio.webm \
  -H "Content-Type: audio/webm"
```

### Process Attempt
```bash
curl -X POST http://localhost:3000/attempts/{attemptId}/process
```

### Get Attempt Status
```bash
curl http://localhost:3000/attempts/{attemptId}
```

## Environment Variables

```env
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_EMBED_MODEL=text-embedding-3-large
OPENAI_GRADE_MODEL=gpt-5.2
AUDIO_BUCKET_NAME=artifact-grader-audio
AWS_REGION=us-east-1
LOG_LEVEL=info
```

## Database Queries

### KB Documents
```sql
SELECT title, COUNT(kc.id) as chunks 
FROM kb_documents kd
LEFT JOIN kb_chunks kc ON kd.id = kc.document_id
GROUP BY kd.id;
```

### Recent Attempts
```sql
SELECT id, user_id, status, created_at 
FROM attempts 
ORDER BY created_at DESC LIMIT 10;
```

### Chunk Preview
```sql
SELECT id, LEFT(content, 200), page_start, page_end 
FROM kb_chunks LIMIT 5;
```

## Status Workflow

```
created → uploaded → transcribing → grading → done ✓
                                            ↓
                                          failed ✗
```

## Project Structure

```
artifact-grader/
├── src/api/            # HTTP handlers
├── src/db/             # Database + schema
├── src/kb/             # Knowledge base + ingestion
├── src/llm/            # OpenAI integration
├── src/shared/         # Validation + types + logging
├── src/util/           # S3, hashing, time
├── scripts/            # CLI tools
├── sst.config.ts       # Infrastructure
└── *.md                # Documentation
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| DB connection error | Check DATABASE_URL, create pgvector extension |
| S3 upload fails | Verify bucket name, Lambda IAM permissions |
| Transcription fails | Check audio format (WebM/WAV), OPENAI_API_KEY |
| Grading returns error | Enable debug logging: `LOG_LEVEL=debug npm run dev` |
| JSON parse error | Check LLM response format, increase model temperature |
| Timeout | Increase Lambda timeout in sst.config.ts |

## Documentation Files

- **README.md** - Setup, API, configuration
- **TESTING.md** - Testing guide with examples
- **DEPLOYMENT.md** - AWS deployment steps
- **ARCHITECTURE.md** - System design
- **BUILD_SUMMARY.md** - What was built

## Key Classes/Functions

### API
- `createAttempt()` - Create attempt + presigned URL
- `processAttempt()` - Orchestrate grading
- `getAttempt()` - Fetch attempt with results

### KB
- `ingestPdf()` - Single PDF ingestion
- `retrieveChunks()` - pgvector search
- `chunkText()` - Smart text splitting
- `computeEmbedding()` - OpenAI embeddings

### LLM
- `transcribeAudio()` - Whisper API
- `gradeAttempt()` - LLM grading with retry
- `buildSystemPrompt()` - RAG constraints

### Shared
- `getEnv()` - Environment validation
- `logger` - Structured logging
- `GradeResultSchema` - Output validation

## Schemas (Zod)

- `CreateAttemptRequestSchema`
- `CreateAttemptResponseSchema`
- `ProcessAttemptResponseSchema`
- `GetAttemptResponseSchema`
- `GradeResultSchema`
- `DimensionScoreSchema`
- `CitationSchema`

## Important Notes

1. **Secrets**: Never commit `.env` to git
2. **Idempotency**: PDF re-ingestion is safe (uses checksums)
3. **Scaling**: Code structured for SQS workers (future)
4. **Errors**: Detailed logging at DEBUG level
5. **Costs**: Monitor OpenAI API usage monthly

---

**Need help?** Check the relevant .md file in the root directory.
