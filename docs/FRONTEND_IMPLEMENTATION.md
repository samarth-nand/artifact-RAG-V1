# Frontend Implementation - Real-Time Speech Interview

## Overview

The frontend has been completely refactored to support the new **real-time speech-to-speech** interview model using OpenAI Realtime API. The interface now provides a modern, responsive web application for conducting PM interviews with live voice conversations.

## Key Features

### 1. **Setup Flow**
- User enters ID and selects a question
- Frontend calls `POST /sessions` to create a realtime session
- Backend returns ephemeral WebRTC credentials (clientSecret)

### 2. **Interview Interface**
- Real-time transcript display showing both user and interviewer speech
- Microphone status indicator with active pulse animation
- Session timer to track interview duration
- Demo mode instructions for testing (console commands)

### 3. **Demo Testing**
For development/testing without real WebRTC:
```javascript
// Add user response
addUserEntry("Your answer text here")

// Add interviewer follow-up
addAssistantEntry("Interviewer feedback here")
```

### 4. **Results Display**
- Overall score with visual progress circle
- Dimension-wise breakdown with score bars
- Strengths, improvements, and missed concepts
- Suggestions for improvement and next drill focus
- Full transcript of the interview

## Architecture

### File Structure
```
public/
├── index.html          (Refactored: Realtime speech interface)
└── (future: realtime.js for WebRTC client library)
```

### UI Components

#### Setup Card
- Email/ID input
- Question selector dropdown
- Start button with loading state

#### Interview Card
- Microphone status indicator
- Session timer (MM:SS format)
- Live transcript feed with speaker labels
- End Interview button
- Status messages (info/success/error)

#### Results Card
- Score circle (0-100)
- Dimension scores with rationale
- Feedback sections (strengths, improvements, concepts)
- Suggestion and drill guidance
- Full transcript

## API Integration

### Endpoint Calls

**1. Create Session**
```javascript
POST /sessions
{
  "userId": "test-user-001",
  "questionId": "pm_case_001"
}

Response:
{
  "sessionId": "uuid",
  "realtimeSessionId": "string",
  "clientSecret": { "value": "string", "expires_at": "ISO8601" },
  "instructions": "system prompt",
  "questionText": "Tell me about..."
}
```

**2. End Session**
```javascript
POST /sessions/{sessionId}/end
{
  "transcriptEvents": [
    { "type": "user.transcript", "text": "...", "timestamp": 1704... },
    { "type": "assistant.transcript", "text": "...", "timestamp": 1704... }
  ]
}
```

**3. Get Results**
```javascript
GET /sessions/{sessionId}/results

Response:
{
  "state": "DONE|GRADING|LIVE|FAILED",
  "result": {
    "overall_score": 85,
    "dimension_scores": {
      "Problem Understanding": { "score": 20, "out_of": 25, "rationale": "..." }
    },
    "strengths": ["Structured approach", "..."],
    "improvements": ["Could dive deeper", "..."],
    "missed_concepts": ["Growth metrics"],
    "rewrite_suggestion": "...",
    "next_drill": "..."
  },
  "finalTranscript": "You: ...\nInterviewer: ..."
}
```

## WebRTC Integration (Production)

To connect to OpenAI Realtime API, install the SDK:

```bash
npm install @openai/realtime-api-beta
```

### Real-time Flow (Pseudocode)

```javascript
import Realtime from '@openai/realtime-api-beta';

// 1. Get session credentials from backend
const session = await createSession();

// 2. Create WebRTC peer connection
const rtc = new Realtime({
  apiKey: session.apiKey,
  sessionToken: session.clientSecret.value,
  systemPrompt: session.instructions
});

// 3. Connect microphone stream
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
rtc.addTrack(stream.getAudioTracks()[0]);

// 4. Listen for assistant responses
rtc.on('transcript', (event) => {
  if (event.role === 'assistant') {
    addTranscriptEntry('Interviewer', event.text);
    playAudio(event.audio);
  }
});

// 5. Listen for user transcripts
rtc.on('user.transcript', (text) => {
  addTranscriptEntry('You', text);
});

// 6. End session
await rtc.close();
await endSession();
```

## Styling & UX

### Color Scheme
- Primary: `#667eea` (Purple-blue)
- Secondary: `#764ba2` (Purple)
- Success: `#e8f5e9` (Light green)
- Error: `#ffebee` (Light red)
- Warning: `#fff3e0` (Light orange)

### Responsive Design
- Mobile-first approach
- Single column on small screens
- Optimized card layout for all devices

### Animations
- Pulse animation for active microphone
- Smooth button transitions
- Loading spinner for async operations

## State Management

### Session State
```javascript
currentSession = {
  sessionId: "uuid",
  realtimeSessionId: "string",
  questionText: "...",
  userId: "test-user-001",
  questionId: "pm_case_001"
}

transcriptEvents = [
  { type: "user.transcript"|"assistant.transcript", text: "...", timestamp }
]
```

### UI States
- **Setup**: Initial form input
- **Interview**: Active conversation with timer
- **Grading**: Loading results (max 30 second poll)
- **Results**: Display final score and feedback

## Testing Checklist

### Local Development
- [ ] Run `npm run dev` - Dev server starts on http://localhost:3000
- [ ] Open http://localhost:3000 in browser
- [ ] Form validation works (email + question required)
- [ ] Session creation succeeds (check browser console)
- [ ] Demo transcript commands work via console
- [ ] End interview triggers polling
- [ ] Results display correctly with all sections
- [ ] Responsive design looks good on mobile

### Production WebRTC
- [ ] OpenAI API key configured in backend
- [ ] WebRTC connection established (check network tab)
- [ ] Microphone permissions requested and granted
- [ ] Audio streaming works both directions
- [ ] Transcript events captured correctly
- [ ] Session expires after interview ends
- [ ] Grading pipeline runs post-interview

## Browser Support

### Tested
- Chrome 90+
- Safari 15+
- Edge 90+

### Required APIs
- Fetch API
- Web Audio API (for real WebRTC)
- Geolocation (for future features)

## Future Enhancements

1. **Audio Visualization**
   - Waveform display during recording
   - Real-time frequency spectrum

2. **Advanced Features**
   - Save interview drafts
   - Retake interview
   - Compare results across attempts
   - Export transcript as PDF

3. **Accessibility**
   - Screen reader support (ARIA labels)
   - Keyboard navigation
   - High contrast mode

4. **Performance**
   - Service worker for offline support
   - Audio codec optimization
   - Network status indicator

## Troubleshooting

### Session Creation Fails
- Check backend is running (`npm run dev`)
- Verify API base URL is correct
- Check browser console for error details

### Results Not Loading
- Ensure backend grading completed (check logs)
- Try polling manually: `fetch('/sessions/{id}/results')`
- Clear browser cache and retry

### Audio Issues (WebRTC)
- Check microphone permissions in browser settings
- Verify OpenAI API key is valid
- Check network latency to OpenAI endpoint

## File Summary

**index.html** (960 lines)
- Complete HTML/CSS/JS single-page application
- Responsive card-based layout
- Real-time transcript UI
- Results visualization
- Demo testing helpers

**Development Status**
- ✅ Setup flow
- ✅ Interview UI
- ✅ Session management
- ✅ Results display
- ✅ Demo testing mode
- ⏳ WebRTC integration (awaiting SDK)
- ⏳ Audio playback (backend TTS compatibility)

## Next Steps

1. **Backend Validation**: Test all 4 new endpoints manually
   ```bash
   # Create session
   curl -X POST http://localhost:3000/sessions \
     -H "Content-Type: application/json" \
     -d '{"userId":"test","questionId":"pm_case_001"}'

   # End session
   curl -X POST http://localhost:3000/sessions/{sessionId}/end \
     -H "Content-Type: application/json" \
     -d '{"transcriptEvents":[]}'

   # Get results
   curl http://localhost:3000/sessions/{sessionId}/results
   ```

2. **WebRTC Integration**: Install OpenAI SDK and wire up real audio streaming

3. **Mobile Testing**: Verify microphone access and responsive layout work on mobile devices

4. **Performance**: Monitor transcript polling, grading latency, and network usage

## References

- [OpenAI Realtime API Beta](https://platform.openai.com/docs/guides/realtime)
- [WebRTC Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
