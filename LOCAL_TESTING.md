# Local Testing Guide

## Prerequisites ✅

Before starting local testing, ensure you have:

1. **Node.js 20+** - Check with `node --version`
2. **npm/pnpm** - Check with `npm --version`
3. **Postgres Database** - Local or cloud (Neon recommended)
4. **OpenAI API Key** - From openai.com
5. **AWS Credentials** (for S3 in dev mode) - Optional, SST will mock it locally

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

Expected output:
```
up to date, audited 398 packages
```

### 2. Create Environment File

```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:

```env
# Your Postgres/Neon connection string
DATABASE_URL=postgresql://user:password@host:5432/database

# Your OpenAI API key
OPENAI_API_KEY=sk-your-actual-key-here

# Leave these as defaults
OPENAI_TRANSCRIBE_MODEL=whisper-1
OPENAI_EMBED_MODEL=text-embedding-3-small
OPENAI_GRADE_MODEL=gpt-4o-mini
AUDIO_BUCKET_NAME=artifact-grader-audio-local
AWS_REGION=us-east-1
LOG_LEVEL=debug
```

### 3. Verify TypeScript

```bash
npm run typecheck
```

Expected: No errors

### 4. Build Project

```bash
npm run build
```

Expected: Build completes successfully

### 5. Setup Database

**5a. Create pgvector extension** (if using Postgres):

```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**5b. Push schema to database**:

```bash
npm run db:push
```

Expected output:
```
✅ Database schema created
```

Verify with:
```bash
psql $DATABASE_URL -c "
  SELECT table_name FROM information_schema.tables 
  WHERE table_schema='public';
"
```

You should see:
- `kb_documents`
- `kb_chunks`
- `attempts`
- `attempt_results`

## Testing the API

### Option A: Using SST Dev Server (Recommended)

This simulates AWS Lambda locally.

**Terminal 1 - Start dev server:**
```bash
npm run dev
```

Expected output:
```
SST dev mode started.
→ API: http://localhost:3000
→ Outputs:
  AudioBucket: artifact-grader-audio-dev
  ApiUrl: http://localhost:3000
```

**Terminal 2 - Run tests:**

#### Test 1: Create an Attempt

```bash
ATTEMPT_ID=$(curl -s -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-001",
    "questionId": "pm_case_001"
  }' | jq -r '.attemptId')

echo "Created attempt: $ATTEMPT_ID"
```

Expected response:
```json
{
  "attemptId": "550e8400-...",
  "uploadUrl": "https://...",
  "audioKey": "audio/550e8400-..."
}
```

#### Test 2: Get Attempt Status

```bash
curl http://localhost:3000/attempts/$ATTEMPT_ID | jq .
```

Expected status: `"created"`

#### Test 3: Check Available Questions

```bash
curl -s http://localhost:3000/attempts \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","questionId":"pm_case_002"}' | jq .
```

Questions available:
- `pm_case_001` - User retention question
- `pm_case_002` - Feature ownership question
- `pm_case_003` - Discovery feature question

#### Test 4: Create Audio File (for testing)

```bash
# Generate 5 seconds of silence
ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 5 -q:a 9 test-audio.webm

# Or use an existing audio file
# Just ensure it's in WebM or WAV format
```

#### Test 5: Upload Audio

```bash
# Get a fresh upload URL
RESPONSE=$(curl -s -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-002",
    "questionId": "pm_case_001"
  }')

ATTEMPT_ID=$(echo $RESPONSE | jq -r '.attemptId')
UPLOAD_URL=$(echo $RESPONSE | jq -r '.uploadUrl')

echo "Attempt ID: $ATTEMPT_ID"
echo "Upload URL: $UPLOAD_URL"

# Upload the audio
curl -X PUT "$UPLOAD_URL" \
  --data-binary @test-audio.webm \
  -H "Content-Type: audio/webm"

echo "Upload complete"
```

#### Test 6: Process Attempt (Trigger Grading)

```bash
curl -X POST http://localhost:3000/attempts/$ATTEMPT_ID/process | jq .
```

This will:
1. Download audio from S3
2. Transcribe with Whisper
3. Retrieve KB chunks
4. Grade with LLM
5. Store results

**Note**: First run may take 30-45 seconds due to OpenAI API latency.

Expected response:
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

### Option B: Direct Node Testing

If SST doesn't work, test the modules directly:

```bash
# Test database connection
node -e "
import('./dist/db/index.js').then(async (db) => {
  await db.initializeDb();
  console.log('✅ DB connected');
  process.exit(0);
});
"
```

## Ingesting PDFs (Knowledge Base)

Before grading, ingest some PDFs into the knowledge base:

```bash
# Single file
npm run ingest -- --file "./books/Cracking the PM Interview.pdf" --title "Cracking the PM Interview"

# Multiple files
npm run ingest -- --file "./books/Decode and Conquer.pdf" --title "Decode and Conquer"
npm run ingest -- --file "./books/Secrets of the Product Manager Interview.pdf" --title "Secrets"

# Batch with mapping
npm run ingest -- --dir "./books" --titleMap "./titles.json"
```

Verify ingestion:
```bash
psql $DATABASE_URL -c "
  SELECT title, COUNT(*) as chunks 
  FROM kb_documents kd 
  LEFT JOIN kb_chunks kc ON kd.id = kc.document_id 
  GROUP BY kd.id;
"
```

## Database Inspection

### View Documents

```bash
psql $DATABASE_URL << 'EOF'
SELECT id, title, source_type, created_at 
FROM kb_documents 
ORDER BY created_at DESC;
EOF
```

### View Chunks

```bash
psql $DATABASE_URL << 'EOF'
SELECT id, LEFT(content, 100), page_start, page_end 
FROM kb_chunks 
LIMIT 10;
EOF
```

### View Attempts

```bash
psql $DATABASE_URL << 'EOF'
SELECT id, user_id, status, created_at 
FROM attempts 
ORDER BY created_at DESC 
LIMIT 10;
EOF
```

### View Grading Results

```bash
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

## Debugging

### Enable Debug Logging

```bash
LOG_LEVEL=debug npm run dev
```

This will show:
- Database queries
- API request/response bodies
- KB retrieval steps
- LLM prompts and responses

### Check Build Output

```bash
npm run build && ls -lah dist/
```

### Test Type Safety

```bash
npm run typecheck
```

## Common Issues

### Issue: Database Connection Error

```
Error: connect ECONNREFUSED
```

**Solution:**
- Verify DATABASE_URL is correct
- Ensure Postgres is running
- Check firewall/network access

### Issue: pgvector Extension Not Found

```
ERROR: type vector does not exist
```

**Solution:**
```bash
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Issue: OpenAI API Error

```
Error: Invalid API key
```

**Solution:**
- Check your OPENAI_API_KEY in .env
- Ensure key has sufficient quota
- Try a fresh key from openai.com

### Issue: S3 Upload Fails

```
Error: Bucket does not exist
```

**Solution:**
- This is expected in local dev
- SST mocks S3 automatically in dev mode
- Check CloudWatch logs if using real AWS

### Issue: JSON Parse Error from LLM

```
Error: JSON parse failed
```

**Solution:**
- Increase LOG_LEVEL to debug
- Check the LLM response in logs
- Ensure PDF KB has content

## Performance Notes

- **First transcription**: ~10-15 seconds (Whisper API)
- **KB retrieval**: ~500ms (pgvector search)
- **LLM grading**: ~20-30 seconds (OpenAI API)
- **Total**: ~30-45 seconds per attempt

This is normal for MVP. Optimize later with:
- Caching
- Async processing (SQS)
- Model selection

## Next Steps

After successful local testing:

1. ✅ Verify all endpoints work
2. ✅ Check database storage
3. ✅ Test PDF ingestion
4. ✅ Verify grading output
5. → Ready for AWS deployment (see DEPLOYMENT.md)

---

**Having issues?** Check:
- [README.md](README.md) - Project overview
- [DEPLOYMENT.md](DEPLOYMENT.md) - AWS setup
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
