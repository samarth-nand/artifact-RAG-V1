# Next.js Migration Guide: Browser-Direct Realtime + Stateless Backend API

## Architecture Overview

```
┌─────────────────────┐
│   Next.js Frontend  │
│   (Vercel)          │
└──────┬──────────────┘
       │
       ├─ (1) REST calls for session setup, grading, results
       │       ↓
       │   Backend API (/api/sessions, /api/sessions/:id/results, etc.)
       │       ↓
       │   Postgres (session records, transcripts, grading results)
       │
       └─ (2) WebRTC + audio → direct to OpenAI Realtime
               (uses ephemeral token from backend)
               ↓
           OpenAI Realtime API
```

---

## Request Flows

### A. Session Initiation Flow

```
1. User clicks "Start Interview" on Next.js frontend
   ↓
2. Frontend → Backend: POST /api/sessions
   Body: { user_id, question_id, question_text }
   ↓
3. Backend:
   - Create "interview_session" record in DB (status: LIVE)
   - Call OpenAI API to create ephemeral realtime session
     (POST https://api.openai.com/v1/beta/realtime/sessions)
   - Receive: { id, client_secret, expires_at }
   ↓
4. Backend → Frontend: Return
   {
     session_id: "uuid",           // your internal session ID
     realtime_session_id: "string", // OpenAI session ID (stored in DB)
     client_secret: "string",       // ephemeral token
     model: "gpt-4o-realtime-preview"
   }
   ↓
5. Frontend:
   - Initializes WebRTC RTCPeerConnection
   - Sends SDP offer to OpenAI (directly, using client_secret)
   - Receives SDP answer from OpenAI
   - Starts capturing mic audio, sending it to OpenAI
   - Receives assistant audio from OpenAI, plays it
   - Subscribes to data channel events (transcripts)
```

### B. Realtime Events (Browser ↔ OpenAI, direct)

```
While the interview is live:

Browser ←→ OpenAI Realtime (WebRTC data channel)
  - Browser sends: audio input frames
  - Browser receives: 
    * Assistant audio frames
    * Transcript deltas (user speech)
    * Assistant transcript deltas
    * Function call events (if any)

Browser → Backend: (optional, but recommended) 
  - POST /api/sessions/:session_id/transcript-event
  - Body: { type, transcript, role }
  - (Backup in case WebRTC event is missed, or for logging)
```

### C. Session End & Grading Flow

```
1. User clicks "End Interview" on frontend
   ↓
2. Frontend:
   - Closes WebRTC connection to OpenAI
   - Collects all transcript events it captured
   ↓
3. Frontend → Backend: POST /api/sessions/:session_id/end
   Body: {
     transcript_turns: [
       { role: "user", type: "audio_transcript", content: "..." },
       { role: "assistant", type: "audio_transcript", content: "..." },
       ...
     ]
   }
   ↓
4. Backend:
   - Update session status: LIVE → GRADING
   - Store transcript_turns in DB
   - Retrieve KB chunks relevant to question
   - Call grader LLM:
     Input: question_text, user_transcript, KB chunks
     Output: { dimension_scores, evidence_from_transcript, citations, ... }
   - Store grading result in DB
   - Update session status: GRADING → DONE
   ↓
5. Frontend → Backend: GET /api/sessions/:session_id/results
   ↓
6. Backend → Frontend: Return
   {
     session_id,
     transcript: [ ... ],
     overall_score,
     dimension_scores: [
       { name: "...", score: 8, rationale: "...", evidence_from_transcript: [...] },
       ...
     ],
     feedback,
     citations
   }
   ↓
7. Frontend: Render results page with transcript + scores + evidence
```

---

## Backend API Endpoints (Stateless)

### POST /api/realtime/session
- **Purpose**: Issue ephemeral token for realtime
- **Input**: `{ user_id?, question_id?, question_text? }`
- **Output**: `{ session_id, realtime_session_id, client_secret, expires_at }`
- **Action**: Create DB row, call OpenAI, return credentials

### POST /api/sessions/:id/end
- **Purpose**: End interview, store transcript
- **Input**: `{ transcript_turns: [...] }`
- **Output**: `{ status: "GRADING" }`
- **Action**: Store turns in DB, trigger grading job

### GET /api/sessions/:id/results
- **Purpose**: Fetch grading results
- **Input**: none (just session ID from URL)
- **Output**: `{ transcript, overall_score, dimension_scores, feedback, citations }`
- **Action**: Read from DB (wait if still grading, or return if cached)

### GET /api/sessions/:id
- **Purpose**: Check session status (for polling)
- **Input**: none
- **Output**: `{ status: "LIVE" | "GRADING" | "DONE", ... }`
- **Action**: Read session record from DB

### POST /api/sessions/:id/transcript-event (optional, for logging)
- **Purpose**: Log transcript events from frontend
- **Input**: `{ type, role, content }`
- **Output**: `{ ok: true }`
- **Action**: Append to transcript log (or ignore if you trust client post-send)

---

## Database Schema (simplified)

```sql
-- Your existing interview_sessions table
CREATE TABLE interview_sessions (
  id UUID PRIMARY KEY,
  user_id TEXT,
  question_id TEXT,
  question_text TEXT,
  state TEXT,  -- LIVE | GRADING | DONE | FAILED
  realtime_session_id TEXT,  -- OpenAI session ID
  realtime_client_secret TEXT, -- ephemeral token (short-lived)
  realtime_expires_at TIMESTAMP,
  final_transcript TEXT,  -- aggregate of all transcript turns
  error TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Transcript turns (optional, but good for audit)
CREATE TABLE interview_turns (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES interview_sessions(id),
  role TEXT,  -- user | assistant
  type TEXT,  -- audio_transcript | audio | event_type
  transcript TEXT,
  created_at TIMESTAMP
);

-- Grading results
CREATE TABLE interview_results (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES interview_sessions(id) UNIQUE,
  overall_score INTEGER,
  dimension_scores JSONB,  -- [ { name, score, rationale, evidence_from_transcript, citations } ]
  feedback JSONB,
  created_at TIMESTAMP
);
```

---

## Frontend Responsibilities (Next.js)

### 1. Session Setup
- `POST /api/realtime/session` → get `client_secret`

### 2. WebRTC Connection (to OpenAI, not your backend)
- Create `RTCPeerConnection`, add mic track
- Send SDP offer to OpenAI's realtime endpoint with `client_secret`
- Receive SDP answer, complete ICE candidates
- Set up data channel listeners (transcript events)

### 3. Audio Handling
- Capture mic → send to OpenAI (via WebRTC)
- Receive remote audio from OpenAI → play via `<audio>` element
- Accumulate transcript events in memory

### 4. Session End
- Close WebRTC connection
- `POST /api/sessions/:id/end` with transcript
- Poll `GET /api/sessions/:id/results` (or subscribe to webhook if you add one)
- Render results

---

## Backend Responsibilities (Vercel + Node.js runtime)

### 1. Session Management
- Create/store session records
- Issue OpenAI ephemeral tokens (server-side API call with your permanent key)

### 2. Transcript & Results Storage
- Receive transcript turns from frontend
- Trigger async grading job
- Store grading results

### 3. Grading Logic
- Retrieve KB chunks (vector search)
- Call grader LLM with transcript + KB context
- Format and store results

### 4. API Only
- No realtime media relay
- No WebSocket proxying
- Stateless per-request handlers

---

## Deployment Checklist

| Component | Where | How |
|-----------|-------|-----|
| Next.js frontend | Vercel | `next build && next start` (or `vercel deploy`) |
| Backend API | Vercel (Next.js route handlers) or separate Node host | `/app/api/**/*.ts` with `runtime = "nodejs"` |
| Postgres | Neon / Supabase / managed RDS | Hosted outside Vercel |
| Migrations | CI/CD (GitHub Actions) or manual release step | `npm run db:migrate` as a pre-deploy step |
| OpenAI API Key | Backend env only | `OPENAI_API_KEY` stored in Vercel env vars or `.env.local` |
| KB Ingestion | Separate job (not on Vercel) | Run locally or as a cron job on a Node host |

---

## Key Advantages of This Approach

✅ **Simple**: Backend is just REST, no media relay complexity  
✅ **Scalable**: Stateless API layers easily  
✅ **Fast**: Direct browser→OpenAI means low latency for realtime  
✅ **Secure**: Ephemeral tokens, permanent key never leaves server  
✅ **Cost-effective**: No media server infrastructure  
✅ **Standard**: Fits Next.js/Vercel patterns perfectly  

---

## Implementation Steps

### Step 1: Decide on Deployment Structure
- **Option A (Single Repo)**: Port your backend handlers into Next.js `/app/api/**/*.ts` routes
- **Option B (Separate)**: Keep Render backend, Next.js calls it via environment variable `API_BASE_URL`

### Step 2: Choose Postgres Host
Recommended for Vercel: **Neon** (good pooling, connection management)
- Alternative: Supabase, AWS RDS, managed Postgres

### Step 3: Plan Migration Strategy
- Decide: Run migrations on-demand via GitHub Actions, or as a release step
- **Do NOT** run migrations on every function invocation (Vercel limitation)

### Step 4: Port Realtime Client
- Move your browser WebRTC client logic into a Next.js component/hook
- Update imports to call `/api/...` (same-origin) instead of external backend

### Step 5: Port Backend Logic
- Extract business logic from your current handlers into importable modules
- Wrap them with Next.js route handlers (`app/api/**/route.ts`)
- Mark routes with `export const runtime = "nodejs"`

### Step 6: Test End-to-End
- Session creation → ephemeral token issuance
- WebRTC connection to OpenAI
- Transcript capture
- Session end → grading → results fetch

---

## Environment Variables

### Backend (.env / Vercel env vars)
```
OPENAI_API_KEY=sk-...
OPENAI_GRADE_MODEL=gpt-4o-mini
OPENAI_EMBED_MODEL=text-embedding-3-small
DATABASE_URL=postgresql://user:password@host:port/database
AUDIO_BUCKET_NAME=local-audio (or S3 bucket name)
NODE_ENV=production
```

### Frontend (.env.local / Vercel env vars)
```
NEXT_PUBLIC_API_BASE_URL=/api (for same-origin calls)
```

---

## Common Pitfalls & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Too many connections" to Postgres | Each serverless function opens a new connection | Use Neon pooled connection or serverless driver |
| Migration fails on deploy | Migrations ran during request (stateless functions) | Run migrations as CI step, before deployment |
| WebRTC connection fails | Browser can't reach OpenAI (firewall/network) | Ensure firewall allows outbound to `*.openai.com` |
| Ephemeral token expired | Client held connection too long (>1 hour) | Add token refresh logic, or session timeout |
| Audio latency high | Relay/proxy introducing delay | Ensure direct browser→OpenAI (no relay) |
| KB search fails on Vercel | Embedding/vector search library issues | Use serverless-safe driver, or pre-compute embeddings |

---

## Next Steps

1. **Clarify deployment**: Single Next.js repo or separate backend?
2. **Pick Postgres host**: Neon recommended
3. **Plan CI/CD**: When/how to run migrations
4. **Create API routes**: Start porting handlers to `/app/api/**/*.ts`
5. **Test realtime flow**: Session → token → WebRTC → grading
6. **Deploy**: Vercel for frontend, your backend host (if separate)

---

## Questions?

Refer back to this guide when implementing:
- Backend API endpoint mapping
- Database schema alignment
- Frontend WebRTC client implementation
- Deployment architecture

