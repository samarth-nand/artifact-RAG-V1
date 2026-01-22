# Frontend Testing Guide

## Quick Start

The artifact-grader now includes a web frontend for testing the API with audio uploads and real-time result viewing.

### 1. Start the Dev Environment

**Option A: Run API + Frontend together (Recommended)**

```bash
npm run dev:full
```

This starts:
- API on `http://localhost:3000`
- Frontend on `http://localhost:8080`

**Option B: Run API only**

```bash
npm run dev
```

Then open `public/index.html` in your browser:
```bash
open http://localhost:3000
# OR
open public/index.html
```

### 2. Set Up Your Database & Environment

Before testing, ensure you have:

1. **`.env` file configured:**
   ```bash
   cp .env.example .env
   # Edit with your actual DATABASE_URL and OPENAI_API_KEY
   ```

2. **Database ready:**
   ```bash
   npm run db:push
   ```

3. **Optional: Ingest sample PDFs**
   ```bash
   mkdir -p books
   # Copy your PDF books to ./books directory
   
   npm run ingest -- --auto --verbose
   # OR
   npm run setup-ingest  # Interactive setup
   ```

## Using the Frontend

### Creating an Attempt

1. **Enter User ID** - Any identifier (e.g., "test-user-001")
2. **Select Question** - Choose from 3 sample PM interview questions:
   - User Retention
   - Feature Ownership
   - Discovery Feature
3. **Click "Create Attempt"** - Gets an attemptId and upload URL

### Recording or Uploading Audio

#### Option A: Record from Microphone
- Click **"Start Recording"**
- Answer the question naturally (aim for 2-3 minutes)
- Click **"Stop Recording"**
- Click **"Upload & Process"**

#### Option B: Upload Existing File
- Click **"Upload Audio File"** and select an MP3, WAV, or WebM file
- Click **"Upload & Process"**

**Note:** First processing takes 30-45 seconds due to OpenAI API latency.

### Viewing Results

Once processing completes, you'll see:

- **Overall Score** - Percentage score (0-100)
- **Dimension Scores** - Breakdown of interview competencies:
  - Problem Solving
  - Communication
  - Leadership
  - Strategic Thinking
  - Product Intuition
- **Strengths** - What the candidate did well
- **Areas for Improvement** - Specific feedback
- **Citations** - Direct quotes from knowledge base
- **Detailed Feedback** - Full grading commentary

### Checking Status Later

To check results for an existing attempt:

1. **Paste Attempt ID** in "Check Status & Results" section
2. **Click "Check Status"**
3. View current grading results

## Troubleshooting

### Issue: "Disconnected - Start dev server"

**Solution:**
```bash
# Make sure API is running
npm run dev
# Wait for "SST dev mode started" message
# Then refresh the frontend
```

### Issue: Microphone access denied

**Solution:**
- Check browser permissions for microphone access
- Try Firefox or Chrome (best support)
- Use file upload instead of recording

### Issue: Upload succeeds but grading doesn't complete

**Solution:**
- Check that `OPENAI_API_KEY` is valid in `.env`
- Review API logs: `LOG_LEVEL=debug npm run dev`
- Ensure database has PDF content for RAG grounding

### Issue: "Attempt not found" when checking status

**Solution:**
- Copy the Attempt ID immediately after creation
- Verify using psql: `SELECT id FROM attempts LIMIT 1;`
- Make sure database is connected

### Issue: Grading results show "no citations"

**Solution:**
- Ingest some PDF books first: `npm run ingest -- --auto --verbose`
- Check: `SELECT COUNT(*) FROM kb_chunks;`
- Minimum recommended: 100+ chunks

## Performance Notes

- **Recording + Processing**: 3 min audio + 45 sec processing = ~4 minutes total
- **Multiple Attempts**: Can run in parallel, each takes ~45 seconds
- **Database Queries**: pgvector search typically <500ms

## API Endpoints (for reference)

The frontend automatically calls these:

```
POST /attempts
  Body: { userId, questionId }
  Returns: { attemptId, uploadUrl, audioKey }

PUT <uploadUrl>
  Upload audio file (signed S3 URL)

POST /attempts/{id}/process
  Triggers grading pipeline

GET /attempts/{id}
  Returns: { status, transcript, result }
```

## Sample Test Flow

1. Start: `npm run dev:full`
2. Open: http://localhost:8080
3. Enter: `test-user-123`
4. Select: `pm_case_001`
5. Click: "Create Attempt"
6. Record: 2-3 minute response (or upload audio)
7. Click: "Upload & Process"
8. Wait: ~45 seconds for grading
9. View: Complete results with scores and feedback

## Next Steps

- Try different questions and observe how grading varies
- Upload different audio samples (good vs poor answers)
- Check database directly to see stored results
- Review knowledge base quality with: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM kb_chunks;"`

---

**Need help?** Check the [LOCAL_TESTING.md](LOCAL_TESTING.md) guide for more detailed API testing.
