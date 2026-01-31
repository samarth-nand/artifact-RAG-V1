# Architecture & Design (Realtime)

## System Overview

```
┌────────────────────────────────────────────────────┐
│              Browser / Mobile Client               │
├────────────────────────────────────────────────────┤
│  POST /sessions → Get realtime config              │
│  WebRTC ↔ OpenAI Realtime (speech-to-speech)      │
│  POST /sessions/{id}/end → End interview           │
│  GET /sessions/{id}/results → Fetch grade          │
└────────────────────────────────────────────────────┘
              ↓              ↓              ↓
       ┌──────────────────────────────────────┐
       │     AWS Lambda + API Gateway         │
       ├──────────────────────────────────────┤
       │  • Session management                │
       │  • Realtime config creation          │
       │  • Transcript storage                │
       │  • Grading orchestration             │
       └──────────────────────────────────────┘
              ↓              ↓              ↓
     ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
     │    Neon     │  │   OpenAI     │  │   OpenAI     │
     │  Postgres   │  │  Realtime    │  │   LLM        │
     │ (pgvector)  │  │  (speech)    │  │  (grading)   │
     └─────────────┘  └──────────────┘  └──────────────┘
```

## Two Separate Flows

### Flow A: Real-Time Interview

```
Timeline: ~3–5 minutes

Client                     Lambda                  OpenAI Realtime
  │                           │                           │
  ├─ POST /sessions ────────→ │                           │
  │                           │                           │
  │  Create Session           │                           │
  │                           ├─ Create Ephemeral ───────→
  │                           │ Realtime Session          │
  │                           │                           │
  │  Return clientSecret ←────├───────────────────────────┤
  │  + instructions           │                           │
  │                           │                           │
  ├─ WebRTC Offer ───────────────────────────────────────→
  │  (from SDP)               │                           │
  │                           │ (Realtime handles SDP)   │
  │←─ WebRTC Answer ──────────────────────────────────────┤
  │                           │                           │
  │★★★ REAL-TIME CONVERSATION (WebRTC) ★★★              │
  │                           │                           │
  │ Mic stream ────────────────────────────────────────→ │
  │  (user audio)             │                           │
  │                           │ Transcribe               │
  │                           │ Generate response        │
  │←────── Audio stream (assistant response) ────────────┤
  │  (live, realtime)         │                           │
  │                           │                           │
  │ [Multiple turns...]       │                           │
  │                           │                           │
  ├─ Transcript events ──────→ │                           │
  │  (when session ends)      │ Store turns in DB        │
  │                           │ Set state = GRADING      │
  │  POST /sessions/{id}/end  │                           │
  │                           │                           │
  │←─ OK (state=GRADING) ─────┤                           │
  │                           │                           │
```

**Key Points:**
- WebRTC connection is between browser and OpenAI (not Lambda)
- Lambda only creates the session and stores transcripts
- Realtime API handles transcription in real-time
- Assistant speaks natively (no TTS synthesis)
- Latency < 500ms typically

### Flow B: Grading (Post-Interview)

```
Timeline: ~5–10 seconds after interview ends

Lambda                     KB / LLM
  │                          │
  ├─ Assemble transcript ────→│
  │  (from stored turns)      │
  │                           │
  ├─ Retrieve relevant chunks │
  │  (pgvector RAG)          │←─ Top-K chunks
  │  embedding-based         │
  │                           │
  ├─ Call grading LLM ───────→│
  │  + constraints            │
  │  + KB chunks              │
  │  + rubric                 │
  │                           │
  │←─ GradeResult (JSON) ─────┤
  │  • scores                 │
  │  • evidence               │
  │  • citations              │
  │  • feedback               │
  │                           │
  ├─ Store result in DB      │
  │ Update state = DONE      │
  │                           │
```

## Data Model

### interview_sessions

```sql
CREATE TABLE interview_sessions (
  id UUID PRIMARY KEY,
  user_id TEXT,
  question_id TEXT,
  state TEXT,                  -- LIVE | GRADING | DONE | FAILED
  question_text TEXT,
  realtime_session_id TEXT,    -- OpenAI Realtime session ID
  final_transcript TEXT,       -- Assembled transcript
  error TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**State Transitions:**
```
  LIVE  →  GRADING  →  DONE
       →  FAILED
```

- **LIVE:** Realtime conversation ongoing
- **GRADING:** Interview ended, grading in progress
- **DONE:** Grading complete, results ready
- **FAILED:** Error during interview or grading

### interview_turns

```sql
CREATE TABLE interview_turns (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES interview_sessions,
  role TEXT,                   -- user | assistant
  type TEXT,                   -- question | clarify | answer | followup
  transcript TEXT,             -- ALWAYS TEXT (no audio blobs)
  created_at TIMESTAMP
);
```

**No Audio Storage:**
- OpenAI Realtime API generates audio on-the-fly
- We don't store raw WebM or audio files
- Only transcribed text is persisted

## Module Organization

### `/src/realtime/`

**session.ts**
- `createRealtimeSession(instructions)` → Creates ephemeral realtime session with OpenAI
- Returns clientSecret + sessionId for WebRTC connection

**instructions.ts**
- `buildRealtimeInstructions(questionId)` → Generates system prompt for the interviewer
- Ensures assistant acts as interviewer, not coaches
- Includes safety guidelines

**events.ts**
- `processRealtimeTranscripts(payload)` → Stores transcript events to DB
- `getSessionTranscripts(sessionId)` → Retrieves turns for grading
- `assembleFinalTranscript(transcripts)` → Formats for grading

### `/src/api/`

**sessions.ts**
- `createSession()` → POST /sessions
  1. Create interview_session row
  2. Call createRealtimeSession
  3. Return clientSecret to client
- `getSession()` → GET /sessions/{id}
- `endSession()` → POST /sessions/{id}/end
  1. Store transcript events
  2. Set state = GRADING
  3. (Backend will trigger grading separately or via webhook)
- `getSessionResults()` → GET /sessions/{id}/results
  1. Retrieve final_transcript
  2. Call gradeAttempt
  3. Return GradeResult + citations

### `/src/kb/` & `/src/llm/` (UNCHANGED)

- **retrieve.ts** → pgvector RAG (same as before)
- **grade.ts** → LLM grading with JSON validation
- **prompts.ts** → Grading system + user prompts (unchanged)

### `/src/interview/`

**stateMachine.ts** (DEPRECATED)
- Old flow used explicit state transitions
- New flow uses simple LIVE → GRADING → DONE
- Kept for reference only

**assembleAnswer.ts** (UPDATED)
- Used by grading flow to build final transcript from turns

**questionBank.ts**
- Question definitions + rubrics (unchanged)

### `/src/tts/` (DEPRECATED)

- Kept for reference, not used
- No TTS generation needed
- OpenAI Realtime handles audio synthesis

## Key Design Decisions

### 1. No Audio Storage
- **Before:** Stored raw WebM files in S3
- **After:** Only store text transcripts
- **Benefit:** 90% storage reduction, simpler compliance

### 2. Realtime API Handles Transcription
- **Before:** Client → Audio upload → Lambda → Whisper API → Transcript
- **After:** Client → WebRTC → OpenAI → Realtime transcription
- **Benefit:** < 500ms latency, natural conversation flow

### 3. Ephemeral Sessions
- OpenAI Realtime sessions auto-expire
- No persistent session state at OpenAI
- Lambda stores interview_session + turns for grading

### 4. Synchronous Grading (Post-Interview)
- Interview ends → Store transcripts → Trigger grading
- Grading is synchronous (5-10 seconds)
- Can later be made async if needed

### 5. RAG Grading Unchanged
- Transcript assembly → KB retrieval → LLM grading
- Same prompts, same output schema
- Identical validation + citation generation

## Error Handling

### Interview Errors (LIVE State)
- WebRTC connection drops → Client reconnects
- Realtime session expires → Create new one
- Network error → Client retries

### Grading Errors (GRADING State)
- KB retrieval fails → Return error, set state = FAILED
- LLM grading fails → Retry once with JSON repair, then FAILED
- Data insertion fails → FAILED

### Database Errors
- Connection lost → Lambda retries
- Constraint violation → FAILED

## Scalability Considerations

### Horizontal Scaling
- Stateless Lambda functions (scale automatically)
- Postgres managed by Neon (auto-scaling read replicas available)
- OpenAI Realtime API (request-level rate limits, not session limits)

### Bottlenecks
- Postgres concurrent writes (interview_turns)
  - Solution: Batch inserts, or async writes to SQS
- OpenAI API rate limits
  - Solution: Token bucket rate limiting, queuing
- Vector search latency
  - Solution: Cache embeddings, pre-compute for common questions

### Cost Optimization
- No S3 storage for audio (major cost reduction)
- Realtime API cheaper per session than Whisper + TTS
- pgvector queries on indexed vectors (fast)

## Security Considerations

### Realtime Session Security
- Ephemeral client secrets expire automatically
- No long-lived credentials stored client-side
- Lambda validates session ownership (user_id check)

### Data Privacy
- No audio blobs stored
- Only transcripts (text) stored
- GDPR: Easier to delete a user's data (just delete interview_session)

### Prompt Injection
- System prompt is fixed (assistant acts as interviewer)
- User voice cannot inject prompts (audio stream, not text)
- Grading prompts include safety guidelines

## Monitoring & Observability

### Key Metrics
1. **Session Creation Success Rate**
   - Lambda invocations → Realtime session creates
2. **Interview Duration**
   - session.createdAt → session.updatedAt
3. **Grading Latency**
   - state = GRADING → state = DONE
4. **Error Rate by Stage**
   - KB retrieval fails
   - LLM grading fails
   - State transition errors

### Logging
- All Lambda handlers log structured JSON
- LOG_LEVEL controls verbosity
- OpenAI API calls logged (timing, tokens, costs)

### CloudWatch Dashboards
- Session state distribution
- Interview duration histogram
- Grading score distribution
- Error rate trends

## Future Enhancements

### 1. Async Grading
- Use SQS to queue grading jobs
- Webhook callback when done
- Support 100+ concurrent interviews

### 2. Interview Recording
- Store WebRTC stream to S3 (video + audio)
- Client initiates recording, backend manages
- Compliance: explicit user consent

### 3. Live Coaching Hints
- During interview: Lambda emits hints to client
- E.g., "Candidate is missing X concept"
- Requires server-sent events or WebSocket

### 4. Custom Voices
- Support multiple voice options for assistant
- Store user preference in session
- Cost: higher OpenAI Realtime bill

### 5. Multi-Language Support
- Realtime API supports many languages
- Grading LLM can work in any language
- Translation layer for KB chunks

### 6. A/B Testing
- Run same interview with different system prompts
- Measure score distribution, interview duration
- Optimize interviewer behavior

---

**Last Updated:** January 2025
**Version:** 2.0 (Realtime)
