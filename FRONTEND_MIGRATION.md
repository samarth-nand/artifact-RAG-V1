# Frontend Migration Guide

## Current State

The backend has been refactored to support **real-time speech-to-speech interviews** using OpenAI Realtime API. However, **the frontend (`/public/index.html`) still implements the old TTS-based flow** and needs to be updated.

## What Changed on Backend

### Old Flow (TTS-based)
```
1. Upload audio → 
2. Transcribe (Whisper) → 
3. Wait for LLM response → 
4. Generate TTS audio → 
5. Play audio file → 
6. Repeat
```

### New Flow (Realtime speech-to-speech)
```
1. Create realtime session → Get clientSecret
2. Connect WebRTC to OpenAI Realtime
3. Stream mic audio in real-time
4. Receive audio responses in real-time
5. Store transcripts when done
6. Grade
```

## Frontend Requirements

The frontend must now:

### 1. Create a Realtime Session
```typescript
const response = await fetch('/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    questionId: 'pm_case_001'
  })
});

const { sessionId, realtimeSessionId, clientSecret } = await response.json();
```

### 2. Establish WebRTC Connection
Use the `clientSecret` to connect to OpenAI Realtime:
```typescript
// Pseudo-code - actual implementation depends on OpenAI SDK
const realtime = new RealtimeClient({
  apiKey: clientSecret.value,
  sessionId: realtimeSessionId
});

// Stream user's microphone
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
stream.getTracks().forEach(track => realtime.addTrack(track, stream));

// Play model's audio responses
realtime.ontrack = (event) => {
  audioElement.srcObject = event.streams[0];
};

// Collect transcripts
const transcripts = [];
realtime.on('transcript', (event) => {
  transcripts.push({
    type: event.role === 'user' ? 'user.transcript' : 'assistant.transcript',
    text: event.text,
    timestamp: Date.now()
  });
});
```

### 3. End Interview & Get Results
```typescript
// End the session
await fetch(`/sessions/${sessionId}/end`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    transcriptEvents: transcripts
  })
});

// Poll for grading results
let results = null;
while (!results) {
  const response = await fetch(`/sessions/${sessionId}/results`);
  const data = await response.json();
  if (data.state === 'DONE') {
    results = data.result;
    break;
  }
  await new Promise(r => setTimeout(r, 1000));
}
```

## Recommended Client Libraries

### OpenAI Realtime Client
The official OpenAI JavaScript SDK has realtime support (beta):
```bash
npm install openai
```

```typescript
import Realtime from 'openai/lib/resources/beta/realtime';

const realtime = new Realtime({
  apiKey: process.env.OPENAI_API_KEY,
  clientSecret: clientSecret.value
});
```

### WebRTC Libraries
- **OpenAI Realtime SDK** (recommended) - handles WebRTC + audio encoding
- **peerjs** - simplified WebRTC wrapper
- **simple-peer** - lightweight WebRTC
- **webrtc** - browser native API

## UI/UX Changes Needed

### Before (TTS Flow)
```
1. Record audio
2. Click "Upload"
3. Wait for transcription
4. See LLM response text
5. Hear TTS audio playback
```

### After (Realtime Flow)
```
1. Click "Start Interview"
2. Hear assistant ask question (live audio)
3. Speak your answer (live mic stream)
4. Hear follow-up questions (live audio)
5. See final grade when done
```

## Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| **Connection** | REST endpoints | WebRTC + REST |
| **Audio Flow** | Upload → Playback | Real-time stream |
| **Latency** | 3-5 seconds per turn | < 500ms |
| **Storage** | Raw audio files | Text transcripts only |
| **UI Pattern** | Form submission | Real-time conversation |
| **Accessibility** | Must be hearing-capable | Same (audio-based) |

## Implementation Checklist

- [ ] Choose realtime client library
- [ ] Implement WebRTC connection handler
- [ ] Add microphone stream capture
- [ ] Add audio playback for model responses
- [ ] Collect transcript events
- [ ] Implement session end workflow
- [ ] Add results polling
- [ ] Update UI for real-time conversation
- [ ] Add error handling for WebRTC
- [ ] Test with multiple users
- [ ] Add fallback for WebRTC failures
- [ ] Document for future maintainers

## Backend API Reference

### POST /sessions
Creates a new realtime interview session.

**Request:**
```json
{
  "userId": "string",
  "questionId": "string"
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "realtimeSessionId": "string",
  "clientSecret": {
    "value": "string",
    "expires_at": "ISO 8601"
  },
  "instructions": "string",
  "questionText": "string"
}
```

### POST /sessions/{sessionId}/end
End the interview and store transcripts.

**Request:**
```json
{
  "transcriptEvents": [
    {
      "type": "user.transcript" | "assistant.transcript",
      "text": "string",
      "timestamp": "number (ms)"
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

### GET /sessions/{sessionId}/results
Retrieve grading results.

**Response:**
```json
{
  "sessionId": "uuid",
  "state": "DONE" | "GRADING" | "FAILED",
  "finalTranscript": "string",
  "result": {
    "overall_score": 82,
    "dimension_scores": { ... },
    "strengths": [ ... ],
    "improvements": [ ... ],
    ...
  }
}
```

## Notes

- The old `public/index.html` should be **replaced entirely** - it's too different to refactor
- Consider using a modern frontend framework (React/Vue/Svelte) for WebRTC state management
- WebRTC requires HTTPS in production (localhost works for dev)
- Store session ID in localStorage for resume capability
- Add permission request for microphone access
- Test on mobile (iOS, Android) for audio permissions

---

**Status:** Backend ✅ | Frontend ❌ (Needs Implementation)
