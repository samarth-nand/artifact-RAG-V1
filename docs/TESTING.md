# Testing & Examples

This guide provides step-by-step instructions to test the artifact-grader system locally.

## Prerequisites

Before running any tests, ensure you've completed the Quick Start in README.md:
1. ✅ Installed dependencies (`npm install`)
2. ✅ Set up `.env` with valid credentials
3. ✅ Ran database migrations (`npm run db:push`)
4. ✅ Ingested at least one PDF (see examples below)

## Full Integration Test

### Step 1: Start Local Dev Server

```bash
npm run dev
```

You should see:
```
SST dev mode started.
→ API: http://localhost:3000
```

Leave this terminal running.

### Step 2: In another terminal, create an attempt

```bash
ATTEMPT_ID=$(curl -s -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "questionId": "pm_case_001"
  }' | jq -r '.attemptId')

echo "Attempt ID: $ATTEMPT_ID"
```

You should see an attempt ID printed.

### Step 3: Upload Sample Audio

Record a ~30 second audio response or use a sample file.

```bash
UPLOAD_URL=$(curl -s -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-002",
    "questionId": "pm_case_002"
  }' | jq -r '.uploadUrl')

# Upload audio to presigned URL
curl -X PUT "$UPLOAD_URL" \
  --data-binary @/path/to/your/audio.webm \
  -H "Content-Type: audio/webm"
```

**For testing without real audio:**

Create a dummy audio file:
```bash
# Generate 5 seconds of silence (48kHz WebM)
ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 5 -q:a 9 test-audio.webm
```

Then upload:
```bash
UPLOAD_URL=$(curl -s -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-003",
    "questionId": "pm_case_001"
  }' | jq -r '.uploadUrl')

ATTEMPT_ID=$(curl -s -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-003",
    "questionId": "pm_case_001"
  }' | jq -r '.attemptId')

curl -X PUT "$UPLOAD_URL" \
  --data-binary @test-audio.webm \
  -H "Content-Type: audio/webm"

echo "Uploaded audio for attempt: $ATTEMPT_ID"
```

### Step 4: Process the Attempt

```bash
curl -X POST http://localhost:3000/attempts/$ATTEMPT_ID/process
```

This will:
1. Transcribe audio
2. Retrieve KB chunks
3. Grade the response
4. Store results

**Expected output:**
```json
{
  "status": "done",
  "transcript": "...",
  "result": {
    "overall_score": 75,
    "dimension_scores": { ... },
    "strengths": [ ... ],
    "improvements": [ ... ],
    ...
  }
}
```

### Step 5: Poll for Status

```bash
curl http://localhost:3000/attempts/$ATTEMPT_ID
```

Response:
```json
{
  "attemptId": "550e8400-...",
  "status": "done",
  "transcript": "...",
  "result": { ... }
}
```

## PDF Ingestion Examples

### Example 1: Cracking the PM Interview

Download the PDF and ingest:
```bash
npm run ingest -- \
  --file "/path/to/Cracking the PM Interview.pdf" \
  --title "Cracking the PM Interview"
```

Check ingestion:
```bash
psql $DATABASE_URL -c "SELECT id, title, created_at FROM kb_documents LIMIT 5;"
psql $DATABASE_URL -c "SELECT COUNT(*) as chunk_count FROM kb_chunks;"
```

### Example 2: Multiple Books

```bash
npm run ingest -- \
  --file "./books/Cracking the PM Interview.pdf" \
  --title "Cracking the PM Interview"

npm run ingest -- \
  --file "./books/Decode and Conquer.pdf" \
  --title "Decode and Conquer"

npm run ingest -- \
  --file "./books/Secrets of the Product Manager Interview.pdf" \
  --title "Secrets of the Product Manager Interview"
```

### Example 3: Batch Ingestion with Mapping

Create `books-mapping.json`:
```json
{
  "cracking.pdf": "Cracking the PM Interview",
  "decode.pdf": "Decode and Conquer",
  "secrets.pdf": "Secrets of the PM Manager Interview"
}
```

Ingest:
```bash
npm run ingest -- --dir ./books --titleMap ./books-mapping.json
```

Check results:
```bash
psql $DATABASE_URL << 'EOF'
SELECT 
  kd.title,
  COUNT(kc.id) as chunk_count,
  kd.created_at
FROM kb_documents kd
LEFT JOIN kb_chunks kc ON kc.document_id = kd.id
GROUP BY kd.id, kd.title, kd.created_at
ORDER BY kd.created_at DESC;
EOF
```

## API Testing with cURL

### Test 1: Create Attempt (Happy Path)

```bash
curl -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-001",
    "questionId": "pm_case_001"
  }' | jq .
```

Expected `200` response.

### Test 2: Create Attempt (Invalid Question ID)

```bash
curl -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-001",
    "questionId": "invalid_question"
  }' | jq .
```

Expected `400` error (grading will still work; falls back to default rubric).

### Test 3: Get Attempt (Created)

```bash
ATTEMPT_ID=$(curl -s -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-001","questionId":"pm_case_001"}' | jq -r '.attemptId')

curl http://localhost:3000/attempts/$ATTEMPT_ID | jq .
```

Expected status: `"created"` (until audio uploaded + processed).

### Test 4: Get Non-existent Attempt

```bash
curl http://localhost:3000/attempts/00000000-0000-0000-0000-000000000000
```

Expected `404` response.

## Database Inspection

### Check Knowledge Base

```bash
# List documents
psql $DATABASE_URL << 'EOF'
SELECT id, title, source_type, checksum, created_at 
FROM kb_documents
ORDER BY created_at DESC;
EOF

# Check chunk count per document
psql $DATABASE_URL << 'EOF'
SELECT 
  kd.title,
  COUNT(kc.id) as chunks,
  MIN(kc.page_start) as first_page,
  MAX(kc.page_end) as last_page
FROM kb_documents kd
LEFT JOIN kb_chunks kc ON kc.document_id = kd.id
GROUP BY kd.id, kd.title
ORDER BY kd.created_at DESC;
EOF

# Inspect a chunk
psql $DATABASE_URL << 'EOF'
SELECT id, document_id, chunk_index, page_start, page_end, 
       LEFT(content, 200) as content_preview,
       content_tokens
FROM kb_chunks
LIMIT 3;
EOF
```

### Check Attempts

```bash
# Recent attempts
psql $DATABASE_URL << 'EOF'
SELECT id, user_id, question_id, status, created_at, updated_at
FROM attempts
ORDER BY created_at DESC
LIMIT 10;
EOF

# Attempt with result
psql $DATABASE_URL << 'EOF'
SELECT 
  a.id, a.user_id, a.status,
  ar.overall_score,
  jsonb_pretty(ar.dimension_scores) as scores
FROM attempts a
LEFT JOIN attempt_results ar ON ar.attempt_id = a.id
WHERE a.status = 'done'
ORDER BY a.created_at DESC
LIMIT 1;
EOF
```

### Test Vector Search

```bash
# Query a test embedding
psql $DATABASE_URL << 'EOF'
SELECT 
  id, document_id, chunk_index, page_start, page_end,
  1 - (embedding <=> '[...]'::vector) as similarity
FROM kb_chunks
WHERE embedding IS NOT NULL
ORDER BY embedding <=> '[...]'::vector
LIMIT 5;
EOF
```

(Replace `[...]` with actual embedding vector.)

## Debugging Tips

### Enable Debug Logging

```bash
LOG_LEVEL=debug npm run dev
```

This will print:
- Database queries
- API request/response bodies
- KB retrieval steps
- LLM prompts and responses

### Check Lambda Logs Locally

```bash
# In SST dev mode, check the terminal output
# All logs will appear there
```

### Simulate Failures

**Test transcription failure:**
- Upload an invalid audio file (e.g., text file as .webm)
- Process attempt
- Check status: should be `"failed"` with error message

**Test grading failure:**
- Remove all KB documents (delete via Postgres)
- Try to process an attempt
- Should still grade but with fewer citations

### Inspect Environment

```bash
# Verify .env is loaded
node -e "const env = require('./src/shared/env').getEnv(); console.log(env)"
```

## Load Testing (Advanced)

Create multiple attempts to stress-test:

```bash
#!/bin/bash
for i in {1..10}; do
  curl -s -X POST http://localhost:3000/attempts \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"stress-user-$i\",
      \"questionId\": \"pm_case_001\"
    }" | jq '.attemptId'
done
```

## Cleanup

### Clear Test Data

```bash
# Reset attempts table
psql $DATABASE_URL -c "DELETE FROM attempts;"

# Reset attempt_results table
psql $DATABASE_URL -c "DELETE FROM attempt_results;"

# Keep KB documents (to reuse them)
```

### Delete KB Documents

```bash
# Remove a specific document
psql $DATABASE_URL -c "DELETE FROM kb_documents WHERE title = 'Test Book';"

# Clear all KB
psql $DATABASE_URL -c "DELETE FROM kb_documents;"
```

## Continuous Integration Example

Example GitHub Actions workflow (`.github/workflows/test.yml`):

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg15
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_pass
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - run: npm install
      - run: npm run typecheck
      - run: npm run build

      - name: Setup Database
        env:
          DATABASE_URL: postgresql://test_user:test_pass@localhost:5432/test_db
        run: npm run db:push

      - name: Run Tests
        env:
          DATABASE_URL: postgresql://test_user:test_pass@localhost:5432/test_db
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: npm test
```

---

**Happy testing!** If you encounter issues, check the logs and refer to the main README for troubleshooting.
