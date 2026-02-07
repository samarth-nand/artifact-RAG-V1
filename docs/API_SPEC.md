# Artifact Grader API Specification

Base URL: `https://your-backend.onrender.com` (or wherever you deploy)

All endpoints return JSON. All POST/PUT requests should include `Content-Type: application/json`.

---

## Authentication

Currently no authentication is required. Consider adding API keys or JWT tokens before production.

---

## Endpoints

### Health Check

#### GET /healthz
Check if the API is running.

**Response**
```json
{
  "ok": true,
  "timestamp": "2026-01-17T12:00:00.000Z"
}
```

---

### Realtime Interview Flow

#### POST /sessions
Create a new interview session and get ephemeral OpenAI Realtime credentials.

**Request Body**
```json
{
  "user_id": "string",
  "question_id": "string", 
  "question_text": "string"
}
```

**Response** (200 OK)
```json
{
  "session_id": "uuid",
  "realtime_session_id": "string",
  "client_secret": "string",
  "model": "gpt-realtime-2025-08-28",
  "expires_at": "2026-01-17T13:00:00.000Z"
}
```

**Usage**
The frontend uses `client_secret` to establish a WebRTC connection directly to OpenAI Realtime API.

---

#### GET /sessions/:sessionId
Get the current state of an interview session.

**Response** (200 OK)
```json
{
  "id": "uuid",
  "user_id": "string",
  "question_id": "string",
  "question_text": "string",
  "state": "LIVE" | "GRADING" | "DONE" | "FAILED",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

---

#### POST /sessions/:sessionId/end
End an interview session and submit the transcript for grading.

**Request Body**
```json
{
  "transcript_turns": [
    {
      "role": "user" | "assistant",
      "type": "audio_transcript",
      "transcript": "string",
      "created_at": "timestamp"
    }
  ]
}
```

**Response** (200 OK)
```json
{
  "session_id": "uuid",
  "state": "GRADING"
}
```

---

#### GET /sessions/:sessionId/results
Get the grading results for a completed interview.

**Response** (200 OK)
```json
{
  "session_id": "uuid",
  "transcript": [
    {
      "role": "user" | "assistant",
      "content": "string",
      "timestamp": "string"
    }
  ],
  "overall_score": 85,
  "dimension_scores": [
    {
      "name": "Technical Accuracy",
      "score": 8,
      "rationale": "The candidate demonstrated...",
      "evidence_from_transcript": [
        "I would use a binary search tree because...",
        "The time complexity would be O(log n)..."
      ],
      "citations": [
        {
          "chunk_id": "uuid",
          "title": "Data Structures Guide",
          "page_start": 42,
          "content": "Binary search trees provide..."
        }
      ]
    }
  ],
  "feedback": {
    "strengths": ["Strong understanding of...", "Clear communication..."],
    "areas_for_improvement": ["Could improve on...", "Consider reviewing..."]
  }
}
```

**Response** (202 Accepted) - Still grading
```json
{
  "session_id": "uuid",
  "state": "GRADING",
  "message": "Grading in progress, please try again shortly"
}
```

---

### Legacy Upload Flow (Optional)

#### POST /attempts
Create a new grading attempt (legacy audio upload flow).

**Request Body**
```json
{
  "user_id": "string",
  "question_id": "string"
}
```

**Response** (200 OK)
```json
{
  "attempt_id": "uuid",
  "upload_url": "presigned_s3_url",
  "status": "created"
}
```

---

#### POST /attempts/:attemptId/process
Process an uploaded audio file (transcribe and grade).

**Request Body**
```json
{
  "audio_s3_key": "string"
}
```

**Response** (200 OK)
```json
{
  "attempt_id": "uuid",
  "status": "processing"
}
```

---

#### GET /attempts/:attemptId
Get the status and results of an attempt.

**Response** (200 OK)
```json
{
  "attempt_id": "uuid",
  "status": "done" | "processing" | "failed",
  "transcript": "string",
  "results": {
    "overall_score": 85,
    "dimension_scores": [...],
    "feedback": {...}
  }
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "statusCode": 400 | 404 | 500
}
```

### Common Status Codes
- `200 OK` - Request succeeded
- `202 Accepted` - Request accepted, processing async
- `400 Bad Request` - Invalid request body or parameters
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

---

## CORS Configuration

The API supports CORS for cross-origin requests. Allowed origins are configured via the `CORS_ORIGINS` environment variable.

**Allowed Methods**: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`  
**Allowed Headers**: `Content-Type`, `Authorization`  
**Credentials**: Supported

---

## Rate Limiting

Currently no rate limiting. Consider adding rate limiting middleware before production.

---

## Webhook Support (Future)

Consider adding webhook support for async notifications when grading completes:

```json
POST /sessions/:sessionId/webhook
{
  "url": "https://your-app.com/webhook",
  "events": ["grading.completed", "grading.failed"]
}
```

---

## Environment Variables Required

When deploying the backend, set these environment variables:

```bash
DATABASE_URL=postgresql://user:password@host:port/database
OPENAI_API_KEY=sk-...
OPENAI_GRADE_MODEL=gpt-5.2
OPENAI_EMBED_MODEL=text-embedding-3-large
CORS_ORIGINS=https://yourapp.vercel.app,http://localhost:3000
SERVE_FRONTEND=false  # Set to false for API-only mode
NODE_ENV=production
```

---

## Testing the API

### Using curl

```bash
# Health check
curl https://your-backend.onrender.com/healthz

# Create session
curl -X POST https://your-backend.onrender.com/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test-user",
    "question_id": "q1",
    "question_text": "Explain binary search"
  }'

# Get session status
curl https://your-backend.onrender.com/sessions/{session_id}

# End session and submit transcript
curl -X POST https://your-backend.onrender.com/sessions/{session_id}/end \
  -H "Content-Type: application/json" \
  -d '{
    "transcript_turns": [
      {
        "role": "user",
        "type": "audio_transcript",
        "transcript": "Binary search is an algorithm..."
      }
    ]
  }'

# Get results
curl https://your-backend.onrender.com/sessions/{session_id}/results
```

### Using JavaScript (Next.js)

```typescript
// In your Next.js app
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://your-backend.onrender.com';

async function createSession(userId: string, questionId: string, questionText: string) {
  const response = await fetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, question_id: questionId, question_text: questionText })
  });
  return response.json();
}

async function endSession(sessionId: string, transcriptTurns: any[]) {
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript_turns: transcriptTurns })
  });
  return response.json();
}

async function getResults(sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/results`);
  return response.json();
}
```

---

## Deployment Checklist

- [ ] Set all required environment variables
- [ ] Configure `CORS_ORIGINS` with your Next.js frontend URL
- [ ] Set `SERVE_FRONTEND=false` for API-only mode
- [ ] Run database migrations before first deploy
- [ ] Test all endpoints with curl or Postman
- [ ] Set up monitoring/logging (optional)
- [ ] Add authentication (recommended for production)
- [ ] Add rate limiting (recommended for production)
- [ ] Document any custom headers or authentication schemes

