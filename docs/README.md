# artifact-grader

A production-grade, AI-powered grading system for real-time speech-based PM interviews using OpenAI Realtime API, RAG (Retrieval Augmented Generation), pgvector semantic search, and LLM-based evaluation.

## Architecture Overview

**Stack:**
- **Language:** TypeScript (Node.js 20)
- **Infra:** AWS Lambda + API Gateway (via SST v3)
- **Database:** Neon Postgres with pgvector extension
- **ORM:** Drizzle ORM (with full migrations support)
- **Vector Search:** pgvector (cosine similarity + MMR diversity)
- **Realtime:** OpenAI Realtime API (speech-to-speech)
- **LLM:** OpenAI (text-embedding-3-large for embeddings, configurable chat model for grading)
- **PDF Ingestion:** Local CLI script with pdf-parse

## Architecture: Two Separate Flows

### 🎙️ Flow A: Realtime Interview (NEW)
The user has a **real-time spoken conversation** with the AI.

```
Client                          Backend                         OpenAI Realtime
  |                               |                                   |
  |--- POST /sessions ---------->|                                   |
  |                               |-- create ephemeral session ----->|
  |                               |<-- clientSecret, instructions ---|
  |<-- realtimeConfig ------------|                                   |
  |                                                                   |
  |--- WebRTC connect ------------------------------------------------>|
  |                               [Realtime conversation]             |
  |<-- Audio stream (live) --------|<-- Live assistant responses ---|
  |-- Mic audio (live) ----------->|-- User audio ----->|
  |                               |                                   |
  |--- POST /sessions/{id}/end --->| Store transcript turns          |
  |                               | Set state = GRADING             |
  |<-- OK -------------------------|                                   |
```

**Client responsibilities:**
- Establish WebRTC connection using clientSecret
- Stream user's microphone audio to the model
- Play model's audio responses in real-time
- Send transcript events back to backend when session ends

**Backend responsibilities:**
- Create ephemeral realtime session
- Store interview_session (with realtimeSessionId)
- Store transcript turns as they arrive
- Trigger grading when session ends

### 🏆 Flow B: Grading (UNCHANGED)
After the interview ends, we **assemble the transcript and grade it**.

```
Backend                    KB                          LLM
  |                        |                           |
  |--- Assemble transcript--|                          |
  |--- Retrieve chunks (RAG)-->| pgvector search       |
  |<-- Relevant chunks --------|                       |
  |--- Grade with citations -->|-- embeddings, chunks  |
  |<-- Grade Result + citations|<-- JSON output -------|
  |                        |                           |
  | Store results in DB
  | Return GradeResult
```

**This flow is identical to before**, except the input transcript now comes from realtime turns instead of audio upload → transcription.

## Key Changes from Previous Architecture

| Aspect | Before (TTS) | After (Realtime) |
|--------|--------------|------------------|
| **User speaks** | Records audio, uploads | Mic streams live to model |
| **Assistant responds** | Generates text → TTS → plays audio file | Model generates audio in real-time |
| **Latency** | 2–5 seconds per turn | < 500ms per turn |
| **Storage** | Raw audio files + transcripts | Only transcripts + metadata |
| **Interview flow** | Request/response (clarify → answer → followup) | Continuous conversation |
| **Session states** | CLARIFY → ANSWERING → FOLLOWUP → GRADING → DONE | LIVE → GRADING → DONE |

## Features

✅ **Real-Time Speech-to-Speech**
- OpenAI Realtime API for live conversation
- WebRTC connection between client and model
- Sub-500ms latency

✅ **Intelligent Interviewer**
- Asks follow-up questions (max 2)
- Answers clarification questions (without giving away answers)
- Never mentions grading or rubrics
- Natural, conversational tone

✅ **RAG-Grounded Evaluation (Unchanged)**
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
OPENAI_EMBED_MODEL=text-embedding-3-large
OPENAI_GRADE_MODEL=gpt-5.2
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

#### Create a Realtime Session

```bash
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "questionId": "pm_case_001"
  }'
```

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "realtimeSessionId": "sess_...",
  "clientSecret": {
    "value": "sk_live_...",
    "expires_at": "2025-01-04T12:34:56Z"
  },
  "instructions": "You are an interviewer...",
  "questionText": "Your question here?"
}
```

#### Connect to Realtime (Client-Side, Pseudo-Code)

```typescript
// Use the clientSecret to establish WebRTC connection
const pc = new RTCPeerConnection();
const audioElements = { local: ..., remote: ... };

// Stream user's mic
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
stream.getTracks().forEach(track => pc.addTrack(track, stream));

// Handle incoming audio from model
pc.ontrack = (event) => {
  audioElements.remote.srcObject = event.streams[0];
};

// Establish connection (details depend on OpenAI Realtime API)
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
// Send to OpenAI via WebRTC...
```

#### End Interview & Get Results

```bash
curl -X POST http://localhost:3000/sessions/550e8400-e29b-41d4-a716-446655440000/end \
  -H "Content-Type: application/json" \
  -d '{
    "transcriptEvents": [
      {
        "type": "assistant.transcript",
        "text": "Tell me about your approach...",
        "timestamp": 1704282896000
      },
      {
        "type": "user.transcript",
        "text": "I would first understand the problem...",
        "timestamp": 1704282900000
      }
    ]
  }'
```

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "GRADING"
}
```

#### Poll for Session Status

```bash
curl http://localhost:3000/sessions/550e8400-e29b-41d4-a716-446655440000
```

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "GRADING",
  "questionText": "Tell me about your approach...",
  "createdAt": "2025-01-04T12:00:00Z",
  "updatedAt": "2025-01-04T12:05:00Z"
}
```

#### Get Grading Results

```bash
curl http://localhost:3000/sessions/550e8400-e29b-41d4-a716-446655440000/results
```

Response:
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "DONE",
  "finalTranscript": "Interviewer: Tell me about...\n\nCandidate: I would...",
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

## Folder Structure

```
artifact-grader/
├── src/
│   ├── api/
│   │   ├── sessions.ts         # POST /sessions, GET /sessions/{id}, etc.
│   │   ├── attempts.*.ts       # DEPRECATED (legacy endpoints)
│   │   ├── cors.ts
│   │   └── index.ts            # Lambda handlers
│   ├── realtime/               # NEW: Realtime interview flow
│   │   ├── session.ts          # Create ephemeral realtime sessions
│   │   ├── instructions.ts     # Build system prompt for interviewer
│   │   └── events.ts           # Process transcript events
│   ├── shared/
│   │   ├── env.ts              # Environment validation (Zod)
│   │   ├── types.ts            # Question bank + shared types
│   │   ├── zod.ts              # API schemas
│   │   └── logger.ts           # Structured logging
│   ├── db/
│   │   ├── schema.ts           # Drizzle schema (documents, chunks, sessions, turns)
│   │   ├── index.ts            # Database initialization
│   │   └── migrations/         # Drizzle migrations (auto-generated)
│   ├── kb/
│   │   ├── embed.ts            # OpenAI embeddings + token counting
│   │   ├── chunking.ts         # Text chunking with overlap
│   │   ├── retrieve.ts         # pgvector semantic search + MMR
│   │   └── ingestPdf.ts        # PDF ingestion with checksums
│   ├── interview/
│   │   ├── stateMachine.ts     # DEPRECATED (legacy state machine)
│   │   ├── assembleAnswer.ts   # Assemble final transcript
│   │   └── questionBank.ts     # Question definitions
│   ├── llm/
│   │   ├── openai.ts           # OpenAI client initialization
│   │   ├── transcribe.ts       # DEPRECATED (no longer used)
│   │   ├── grade.ts            # Grading logic with retry + JSON repair
│   │   └── prompts.ts          # Grading prompts
│   ├── tts/                    # DEPRECATED (kept for reference only)
│   │   ├── speak.ts
│   │   └── voices.ts
│   └── util/
│       ├── s3.ts               # S3 operations
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

### interview_sessions (UPDATED)
```sql
CREATE TABLE interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  state TEXT NOT NULL,              -- "LIVE" | "GRADING" | "DONE" | "FAILED"
  question_text TEXT NOT NULL,
  realtime_session_id TEXT,         -- OpenAI realtime session ID
  final_transcript TEXT,            -- Assembled transcript after interview
  error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX interview_sessions_user_idx ON interview_sessions(user_id);
CREATE INDEX interview_sessions_state_idx ON interview_sessions(state);
CREATE INDEX interview_sessions_created_idx ON interview_sessions(created_at);
```

### interview_turns (UPDATED)
```sql
CREATE TABLE interview_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                -- "user" | "assistant"
  type TEXT NOT NULL,                -- "question" | "clarify" | "answer" | "followup"
  transcript TEXT NOT NULL,          -- Always required (no audio blobs)
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX interview_turns_session_idx ON interview_turns(session_id, created_at);
```

### kb_documents & kb_chunks (UNCHANGED)
See previous README for full schema. These are used identically in the grading flow.

### attempts & attempt_results (DEPRECATED)
Kept in database for backwards compatibility but no longer actively used.

## API Endpoints

### Realtime Interview Endpoints

#### POST /sessions
Create a new realtime interview session.

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
  "sessionId": "uuid",
  "realtimeSessionId": "string",
  "clientSecret": {
    "value": "string",
    "expires_at": "ISO 8601 timestamp"
  },
  "instructions": "string (system prompt)",
  "questionText": "string"
}
```

**Status Codes:** `200`, `400`

---

#### GET /sessions/{sessionId}
Get the current state of a session.

**Response:**
```json
{
  "sessionId": "uuid",
  "state": "LIVE" | "GRADING" | "DONE" | "FAILED",
  "questionText": "string",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

**Status Codes:** `200`, `404`, `500`

---

#### POST /sessions/{sessionId}/end
End the realtime session and trigger grading.

**Request:**
```json
{
  "transcriptEvents": [
    {
      "type": "user.transcript" | "assistant.transcript",
      "text": "string",
      "timestamp": "number (milliseconds since epoch)"
    }
  ]
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "state": "GRADING"
}
```

**Status Codes:** `200`, `500`

---

#### GET /sessions/{sessionId}/results
Get grading results (available after state = "DONE").

**Response:**
```json
{
  "sessionId": "uuid",
  "state": "DONE" | "GRADING" | "FAILED",
  "finalTranscript": "string",
  "result": { GradeResult } (optional)
}
```

**Status Codes:** `200`, `404`, `500`

### Legacy Endpoints (Deprecated)

The following endpoints are **deprecated** but kept for backwards compatibility:
- `POST /attempts`
- `POST /attempts/{attemptId}/process`
- `GET /attempts/{attemptId}`

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
| `OPENAI_EMBED_MODEL` | `text-embedding-3-large` | Embedding model |
| `OPENAI_GRADE_MODEL` | `gpt-5.2` | LLM for grading |
| `AWS_REGION` | `us-east-1` | AWS region |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | `development` | Node environment |

**Removed from previous version:**
- `OPENAI_TRANSCRIBE_MODEL` (no longer needed; realtime handles transcription)
- `OPENAI_TTS_MODEL` (no longer needed; realtime generates audio)
- `AUDIO_BUCKET_NAME` (only used by deprecated attempts flow)

### Questions & Rubric

Edit `src/interview/questionBank.ts` to add/modify questions:

```typescript
export function getQuestion(questionId: string): Question {
  const questions: Record<string, Question> = {
    pm_case_001: {
      questionId: "pm_case_001",
      questionText: "Tell me about a time you...",
      rubricDimensions: [
        { name: "Problem Understanding", out_of: 25, description: "..." },
        { name: "Analytical Approach", out_of: 25, description: "..." },
        // ...
      ],
    },
    // Add more questions
  };
  return questions[questionId];
}
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

## Troubleshooting

### Database Connection Error

- Ensure `DATABASE_URL` is correct
- Verify pgvector extension: `CREATE EXTENSION vector;`
- Check firewall/network access

### Realtime Session Creation Fails

- Verify `OPENAI_API_KEY` is valid
- Check OpenAI quota/rate limits
- Ensure model `gpt-realtime-2025-08-28` is available

### Grading Returns Invalid JSON

- Check LLM logs: `LOG_LEVEL=debug npm run dev`
- The system retries once with a JSON repair prompt
- If still failing, check `OPENAI_GRADE_MODEL` availability

### PDF Ingestion Duplicates

- Checksums are computed from raw text
- Re-running the same PDF will skip (idempotent)
- To force re-ingestion, delete the document row in Postgres

## Future Enhancements

- [ ] Support for multiple languages
- [ ] Custom avatar/voice for assistant
- [ ] Session recording + playback
- [ ] Real-time coaching hints for interviewer
- [ ] A/B testing of interview questions
- [ ] Analytics dashboard for interview performance
- [ ] Export interview transcript to PDF

## Contributing

1. Create a feature branch
2. Make changes and ensure `npm run typecheck` passes
3. Test locally with `npm run dev`
4. Submit a pull request

## License

MIT

---

**Questions?** Check the inline comments in the code or open an issue.
