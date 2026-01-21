# 🚀 Local Testing Checklist

Complete these steps in order to test artifact-grader locally.

## Pre-Flight Checklist

- [ ] Node.js 20+ installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Postgres database available (local or Neon)
- [ ] OpenAI API key obtained
- [ ] AWS credentials set (optional, will use local mock)

## Setup (5 minutes)

- [ ] Dependencies installed: `npm install`
- [ ] `.env` file created: `cp .env.example .env`
- [ ] `.env` edited with real credentials
- [ ] TypeScript checks pass: `npm run typecheck`
- [ ] Project builds: `npm run build`

## Database Setup (5 minutes)

- [ ] Postgres running
- [ ] pgvector extension created: `psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"`
- [ ] Schema pushed: `npm run db:push`
- [ ] Tables verified: `psql $DATABASE_URL -c "\dt"`

## PDF Ingestion (5 minutes)

- [ ] At least one PDF ready (or create dummy for testing)
- [ ] Ingest PDF: `npm run ingest -- --file "./book.pdf" --title "Title"`
- [ ] Verify chunks exist: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM kb_chunks;"`

## API Testing (15 minutes)

### Terminal 1: Start Server
- [ ] Run: `npm run dev`
- [ ] Server ready at `http://localhost:3000`

### Terminal 2: Test Endpoints

**Test 1: Create Attempt**
```bash
ATTEMPT_ID=$(curl -s -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","questionId":"pm_case_001"}' | jq -r '.attemptId')
echo $ATTEMPT_ID
```
- [ ] Returns `attemptId`, `uploadUrl`, `audioKey`

**Test 2: Get Status**
```bash
curl http://localhost:3000/attempts/$ATTEMPT_ID | jq .
```
- [ ] Returns status: `"created"`

**Test 3: Process (with audio)**
```bash
curl -X POST http://localhost:3000/attempts/$ATTEMPT_ID/process
```
- [ ] Returns graded result (will fail if no KB or audio, which is OK for now)

## Expected Results

✅ **Success Indicators:**
- TypeScript builds without errors
- Database schema created
- API endpoints respond (200 status)
- Grading produces JSON output
- No fatal errors in logs

⚠️ **Expected Failures (Normal):**
- Grading fails if KB is empty (ingest PDFs first)
- Audio processing fails without audio file (mock with dummy file)
- S3 operations use local mock (correct behavior)

## Troubleshooting

If you hit issues, check these files in order:
1. **Setup issues** → [LOCAL_TESTING.md](LOCAL_TESTING.md)
2. **Build errors** → [README.md](README.md)
3. **Database issues** → [MIGRATIONS.md](MIGRATIONS.md)
4. **Architecture questions** → [ARCHITECTURE.md](ARCHITECTURE.md)

## Performance Notes

Expect these timings on first run:
- TypeScript compilation: ~5 seconds
- API startup: ~2 seconds
- First API call: ~1-2 seconds
- Transcription: ~10-15 seconds (if audio provided)
- Grading: ~20-30 seconds (OpenAI API latency)

## Commands Quick Reference

```bash
# Setup
npm install
npm run typecheck
npm run build

# Database
npm run db:push
npm run db:migrate

# Development
npm run dev

# Ingestion
npm run ingest -- --file "book.pdf" --title "Title"

# Testing
curl -X POST http://localhost:3000/attempts ...
```

## Next Steps After Testing

- [ ] All tests pass locally
- [ ] Database storage verified
- [ ] PDF ingestion working
- [ ] Ready for AWS deployment (see [DEPLOYMENT.md](DEPLOYMENT.md))
- [ ] Or: Ready for frontend integration

---

**Estimated Total Time: 30-45 minutes**

Questions? See [LOCAL_TESTING.md](LOCAL_TESTING.md) for detailed guide with examples.
