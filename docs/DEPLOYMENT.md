# Artifact Grader - Deployment & Integration Guide

## Table of Contents
1. [Backend Deployment](#backend-deployment)
2. [Frontend Integration](#frontend-integration)
3. [Environment Configuration](#environment-configuration)
4. [API Endpoints Reference](#api-endpoints-reference)

---

## Backend Deployment

### Option 1: Local Development

**Prerequisites:**
- Node.js 20+
- PostgreSQL 15+
- OpenAI API key

**Steps:**

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Set up database
npm run db:push

# 4. Start dev server
npm run dev
# Server runs on http://localhost:3000
```

---

## Frontend Integration (Next.js)

### 1. Install Dependencies

```bash
npm install axios zod
```

### 2. Create API Client (lib/api-client.ts)

```typescript
import axios from 'axios';
import { z } from 'zod';

const CreateAttemptResponseSchema = z.object({
  attemptId: z.string(),
  uploadUrl: z.string(),
  audioKey: z.string(),
});

const AttemptResultSchema = z.object({
  status: z.enum(['created', 'transcribing', 'grading', 'completed', 'failed']),
  transcript: z.string().nullable(),
  overallScore: z.number().nullable(),
  dimensionScores: z.record(z.number()).nullable(),
  strengths: z.string().array().nullable(),
  areasForImprovement: z.string().array().nullable(),
  citations: z.string().array().nullable(),
  detailedFeedback: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

type CreateAttemptResponse = z.infer<typeof CreateAttemptResponseSchema>;
type AttemptResult = z.infer<typeof AttemptResultSchema>;

class ArtifactGraderAPI {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async createAttempt(userId: string, questionId: string): Promise<CreateAttemptResponse> {
    const response = await axios.post(`${this.baseUrl}/attempts`, {
      userId,
      questionId,
    });
    return CreateAttemptResponseSchema.parse(response.data);
  }

  async uploadAudio(uploadUrl: string, audioBuffer: Blob | File): Promise<void> {
    const response = await axios.put(uploadUrl, audioBuffer, {
      headers: { 'Content-Type': 'audio/webm' },
    });
    if (response.status !== 200) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  }

  async processAttempt(attemptId: string, transcript: string): Promise<void> {
    const response = await axios.post(`${this.baseUrl}/attempts/${attemptId}/process`, {
      transcript,
    });
    if (response.status !== 200) {
      throw new Error('Processing failed');
    }
  }

  async getAttemptStatus(attemptId: string): Promise<AttemptResult> {
    const response = await axios.get(`${this.baseUrl}/attempts/${attemptId}`);
    return AttemptResultSchema.parse(response.data);
  }

  async pollAttemptStatus(
    attemptId: string,
    maxWaitTime: number = 300000,
    pollInterval: number = 2000
  ): Promise<AttemptResult> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const result = await this.getAttemptStatus(attemptId);
      
      if (result.status === 'completed' || result.status === 'failed') {
        return result;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Attempt processing timeout');
  }
}

export const apiClient = new ArtifactGraderAPI();
export type { CreateAttemptResponse, AttemptResult };
```

### 3. Audio Recording Hook (hooks/useAudioRecording.ts)

```typescript
import { useState, useRef } from 'react';

export function useAudioRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access denied:', error);
      throw error;
    }
  };

  const stopRecording = (): Promise<Blob> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) {
        throw new Error('Recording not started');
      }

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        resolve(blob);
      };

      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    });
  };

  return { isRecording, startRecording, stopRecording };
}
```

### 4. Example Usage Component

```typescript
'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAudioRecording } from '@/hooks/useAudioRecording';

export function GraderForm() {
  const [userId, setUserId] = useState('');
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { startRecording, stopRecording } = useAudioRecording();

  const handleCreateAttempt = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.createAttempt(userId, 'pm_retention');
      setAttemptId(response.attemptId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create attempt');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordAndProcess = async () => {
    if (!attemptId) return;
    try {
      setLoading(true);
      // Record audio
      await startRecording();
      // User records... then stop
      const audioBlob = await stopRecording();

      // Upload to backend
      const uploadUrl = `${process.env.NEXT_PUBLIC_API_URL}/audio/audio/${attemptId}.webm`;
      await apiClient.uploadAudio(uploadUrl, audioBlob);

      // Process
      await apiClient.processAttempt(attemptId, 'transcript here');

      // Poll for results
      const finalResult = await apiClient.pollAttemptStatus(attemptId);
      setResult(finalResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md">
      <h1 className="text-2xl font-bold mb-4">Artifact Grader</h1>

      {!attemptId ? (
        <>
          <input
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full border p-2 mb-4"
          />
          <button
            onClick={handleCreateAttempt}
            disabled={loading || !userId}
            className="w-full bg-blue-500 text-white p-2 rounded"
          >
            Create Attempt
          </button>
        </>
      ) : (
        <>
          <button
            onClick={handleRecordAndProcess}
            disabled={loading}
            className="w-full bg-green-500 text-white p-2 rounded"
          >
            Record & Process
          </button>
        </>
      )}

      {error && <div className="text-red-500 mt-4">{error}</div>}
      {result && (
        <div className="mt-4 p-4 bg-gray-100">
          <p>Score: {result.overallScore}%</p>
        </div>
      )}
    </div>
  );
}
```

### 5. Environment Setup

Create `.env.local`:

```bash
# Local Development
NEXT_PUBLIC_API_URL=http://localhost:3000

# Production
# NEXT_PUBLIC_API_URL=https://your-backend-domain.com
```

---

## API Endpoints Reference

### POST /attempts
Create a new grading attempt.

```json
Request:
{
  "userId": "user-123",
  "questionId": "pm_retention"
}

Response:
{
  "attemptId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "http://localhost:3000/audio/audio/550e8400-e29b-41d4-a716-446655440000.webm",
  "audioKey": "audio/550e8400-e29b-41d4-a716-446655440000.webm"
}
```

### PUT {uploadUrl}
Upload audio file.

```
Content-Type: audio/webm
[binary audio data]

Response: { "success": true }
```

### POST /attempts/{attemptId}/process
Trigger grading pipeline.

```json
Request:
{
  "transcript": "I would focus on..."
}

Response: { "status": "processing" }
```

### GET /attempts/{attemptId}
Get attempt status and results.

```json
Response:
{
  "status": "completed",
  "transcript": "I would focus on...",
  "overallScore": 78,
  "dimensionScores": {
    "problemSolving": 85,
    "communication": 72,
    "leadership": 78
  },
  "strengths": ["Clear thinking", "Structured approach"],
  "areasForImprovement": ["Add metrics", "More specifics"],
  "citations": ["Page 42: Best practices..."],
  "detailedFeedback": "Strong response..."
}
```

---

## Environment Variables

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/artifact_grader

# OpenAI
OPENAI_API_KEY=sk-your-key-here
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe
OPENAI_EMBED_MODEL=text-embedding-3-large
OPENAI_GRADE_MODEL=gpt-5.2

# AWS (production only)
AWS_REGION=us-east-1
AUDIO_BUCKET_NAME=artifact-grader-audio-bucket

# Logging
LOG_LEVEL=info
```

### Frontend (.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Troubleshooting

**Backend won't start:**
```bash
psql $DATABASE_URL -c "SELECT 1;"
npm run build
npm run dev
```

**Frontend can't reach API:**
```bash
curl http://localhost:3000/attempts
# Verify NEXT_PUBLIC_API_URL in .env.local
```

**Audio upload fails:**
```bash
mkdir -p uploads/audio
npm run dev
```

---

## Deployment

### Railway/Render (Recommended for MVP)

1. Push code to GitHub
2. Connect repo to Railway/Render
3. Add environment variables (DATABASE_URL, OPENAI_API_KEY)
4. Auto-deploys on git push

### AWS Lambda + RDS

1. Create RDS Postgres instance
2. Create S3 bucket for audio storage
3. Deploy with `sst deploy --stage prod`

---

**Backend:** http://localhost:3000
**Frontend:** Your Next.js app connected via NEXT_PUBLIC_API_URL
