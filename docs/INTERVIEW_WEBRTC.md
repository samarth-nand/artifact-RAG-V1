# Interview WebRTC Handshake Implementation

## Overview

Implemented a secure backend-owned flow for OpenAI Realtime WebRTC voice interviews with durable one-time secret storage.

## New Endpoints

### 1. POST /interview/sessions

Creates a Realtime session and stores the ephemeral client secret securely.

**Authentication**: Required (`X-User-Id` header)

**Request**:
```json
{
  "mode": "pm_mock" | "technical" | "behavioral",  // default: pm_mock
  "voice": "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",  // optional
  "difficulty": "easy" | "medium" | "hard",  // optional
  "nonce": "string"  // optional
}
```

**Response** (200):
```json
{
  "sessionId": "uuid"
}
```

**Behavior**:
- Authenticates user via `X-User-Id` header
- Creates OpenAI Realtime session
- Stores `clientSecret` in Redis with TTL (default 90 seconds)
- Binds session to `userId`
- Returns **only** `sessionId` (secret never exposed)

---

### 2. POST /interview/sessions/:sessionId/connect

Consumes the one-time secret and returns it to authenticated client for WebRTC connection.

**Authentication**: Required (`X-User-Id` header, must match session owner)

**Request**:
```json
{}  // empty body
```

**Response** (200):
```json
{
  "encryptedSecret": "base64EncodedEncryptedData...",
  "realtimeSessionId": "uuid",
  "encryption": {
    "algorithm": "RSA-OAEP",
    "hash": "SHA-256",
    "encoding": "base64"
  }
}
```

**Security**: The `client_secret` is encrypted using RSA public key encryption before transmission. Frontend must decrypt using the corresponding private key. See [FRONTEND_DECRYPTION.md](./FRONTEND_DECRYPTION.md) for complete decryption guide.

**Behavior**:
- Authenticates user
- **Atomically** reads and deletes the stored secret (one-time use)
- Verifies requesting user matches session owner
- Returns ephemeral secret for client-side WebRTC connection

**Error Responses**:
- `401 UNAUTHORIZED`: Missing or invalid auth
- `403 FORBIDDEN`: User mismatch (not session owner)
- `404 NOT_FOUND`: Invalid sessionId
- `409 ALREADY_USED`: Secret already consumed (if tracked separately)
- `410 EXPIRED`: Secret expired or not found
- `429 RATE_LIMITED`: Too many requests (if rate limiting enabled)
- `500 OPENAI_ERROR`: OpenAI API error
- `500 INTERNAL_ERROR`: Server error

---

## Storage Implementation

### Redis Integration

**Required Environment Variables**:
```bash
REDIS_URL=redis://...  # Redis Cloud or Upstash URL
REALTIME_SECRET_TTL_SECONDS=90  # default 90 seconds
```

**Key Schema**:
```
rt:session:<sessionId> -> JSON {
  secret: "ek_...",
  userId: "string",
  expiresAt: timestamp,
  nonce: "string" (optional)
}
```

**Features**:
- TTL auto-expiration via Redis SETEX
- Atomic consume via Redis GETDEL (Redis 6.2+)
- Fallback to in-memory Map for dev (NOT production-safe)

**Module**: `src/realtime/secretStore.ts`
- `storeSecret(sessionId, secret, userId, ttlSeconds, nonce?)`: Store with TTL
- `consumeSecret(sessionId)`: Atomically read-and-delete
- `secretExists(sessionId)`: Check existence (debug only)
- `closeSecretStore()`: Cleanup on shutdown

---

## Security Features

✅ **RSA Encryption**: Secrets encrypted with RSA-OAEP before transmission  
✅ **One-time use**: Secrets consumed on first connect  
✅ **User binding**: Sessions tied to userId, enforced on connect  
✅ **Short TTL**: 60-90 second expiration  
✅ **Atomic operations**: GETDEL prevents race conditions  
✅ **No secret exposure**: Browser never sees secret until authorized connect  
✅ **User validation**: Header-based auth (replace with JWT/OAuth in production)  
✅ **Standardized errors**: Machine-readable error codes  
✅ **Defense-in-depth**: Encrypted even over HTTPS  

---

## Authentication

**Current Implementation** (Simple):
- Header: `X-User-Id: <userId>`
- Basic validation (length 3-100 chars)

**Production TODO**:
- Replace with JWT validation
- Add OAuth/OIDC integration
- Implement rate limiting per user
- Add session audit logging

**Module**: `src/shared/auth.ts`
- `authenticateUser(event)`: Extract and validate user
- `authorizeUser(authContext, resourceUserId)`: Check ownership
- `AuthenticationError`, `AuthorizationError`: Custom exceptions

---

## Error Handling

**Standardized Error Response**:
```json
{
  "error": {
    "code": "EXPIRED",
    "message": "Session has expired or was already used",
    "details": { ... }  // optional
  }
}
```

**Error Codes**:
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `ALREADY_USED` (409)
- `EXPIRED` (410)
- `RATE_LIMITED` (429)
- `OPENAI_ERROR` (500)
- `VALIDATION_ERROR` (400)
- `INTERNAL_ERROR` (500)

**Module**: `src/api/errorResponses.ts`

---

## Configuration

### Required Environment Variables

```bash
# Existing
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...

# New for WebRTC
REDIS_URL=redis://default:password@host:port  # Required for production
REALTIME_SECRET_TTL_SECONDS=90  # Optional, defaults to 90

# RSA Encryption (Optional - generates ephemeral keys if not set)
RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----"
```

**Key Generation**: See [FRONTEND_DECRYPTION.md](./FRONTEND_DECRYPTION.md) for complete key generation and usage instructions.

### Redis Setup

**Upstash** (Recommended):
1. Create account at https://upstash.com
2. Create Redis database
3. Copy connection URL
4. Set `REDIS_URL` env var

**Redis Cloud**:
1. Create account at https://redis.com/cloud
2. Create free database
3. Copy connection string
4. Set `REDIS_URL` env var

---

## Lifecycle Events (Logged)

| Event | Log Message | Fields |
|-------|-------------|--------|
| Session created | `"Interview session created"` | sessionId, userId, mode, realtimeSessionId, ttl |
| Secret stored | `"Stored realtime secret in Redis"` | sessionId, userId, ttlSeconds |
| Secret consumed | `"Secret consumed from Redis"` | sessionId, userId |
| Secret not found | `"Secret not found or already consumed"` | sessionId, userId |
| User mismatch | `"User mismatch on session connect"` | sessionId, requestingUser, sessionOwner |
| Expired | `"Secret expired"` | sessionId, expiresAt |

---

## Client Integration Example

```typescript
// 1. Create session
const createRes = await fetch('/interview/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Id': 'user123'
  },
  body: JSON.stringify({
    mode: 'pm_mock',
    voice: 'alloy'
  })
});
const { sessionId } = await createRes.json();

// 2. Connect and get secret
const connectRes = await fetch(`/interview/sessions/${sessionId}/connect`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Id': 'user123'
  },
  body: '{}'
});
const { clientSecret, realtimeSessionId } = await connectRes.json();

// 3. Use secret to establish WebRTC connection with OpenAI
const pc = new RTCPeerConnection();
// ... use clientSecret for OpenAI Realtime API connection
```

---

## Files Modified/Created

### New Files
- `src/realtime/secretStore.ts` - Redis client + atomic operations
- `src/shared/auth.ts` - Authentication middleware
- `src/api/interview.sessions.create.ts` - POST /interview/sessions
- `src/api/interview.sessions.connect.ts` - POST /interview/sessions/:id/connect
- `src/api/errorResponses.ts` - Standardized error responses
- `INTERVIEW_WEBRTC.md` - This documentation

### Modified Files
- `src/shared/env.ts` - Added REDIS_URL, REALTIME_SECRET_TTL_SECONDS
- `src/shared/zod.ts` - Added request/response schemas, error schemas
- `src/api/index.ts` - Exported new handlers
- `src/server.ts` - Wired new routes, added X-User-Id CORS header
- `package.json` - Added ioredis dependency

---

## Testing Checklist

### Local Development (No Redis)
- [ ] `npm run build` succeeds
- [ ] Server starts without REDIS_URL (uses in-memory fallback)
- [ ] POST /interview/sessions returns sessionId
- [ ] POST /interview/sessions/:id/connect returns clientSecret
- [ ] Second connect attempt returns 410 EXPIRED
- [ ] Wrong userId returns 403 FORBIDDEN
- [ ] Invalid sessionId returns 410 EXPIRED

### Production (With Redis)
- [ ] REDIS_URL configured in Render env vars
- [ ] Secrets stored with TTL in Redis
- [ ] Secrets auto-expire after 90 seconds
- [ ] GETDEL atomic operation works
- [ ] Multiple instances share secret state
- [ ] Server restart doesn't lose active secrets

### Security
- [ ] clientSecret never returned from POST /interview/sessions
- [ ] Secret only returned after user authentication
- [ ] User binding enforced (403 on mismatch)
- [ ] One-time use enforced (410 on replay)
- [ ] TTL enforced (410 after expiration)
- [ ] Error messages don't leak secret existence

### Edge Cases
- [ ] Missing X-User-Id header returns 401
- [ ] Malformed request body returns 400 VALIDATION_ERROR
- [ ] OpenAI API failure returns 500 OPENAI_ERROR
- [ ] Redis connection failure falls back gracefully (dev only)
- [ ] Concurrent connect attempts handled correctly

---

## Production Deployment Notes

1. **Set REDIS_URL**: Required for production; Upstash free tier is sufficient
2. **Enable rate limiting**: Add per-user rate limits (TODO)
3. **Replace auth**: Swap X-User-Id for JWT validation
4. **Monitor logs**: Track session lifecycle events
5. **Alert on errors**: Watch for OPENAI_ERROR, INTERNAL_ERROR
6. **TTL tuning**: Adjust REALTIME_SECRET_TTL_SECONDS if needed (60-120s recommended)

---

## Known Limitations

- **No rate limiting**: Implement per-user quotas in production
- **Simple auth**: Replace header-based auth with JWT
- **No audit trail**: Add session event logging to database
- **No cleanup**: Expired sessions not removed from logs (Redis auto-expires)
- **Dev fallback**: In-memory store NOT safe for multi-instance deployments

---

## Next Steps

1. Implement rate limiting (e.g., 10 sessions/minute per user)
2. Add JWT authentication
3. Store session metadata in database for audit
4. Add session lifecycle webhooks
5. Implement graceful secret rotation
6. Add monitoring/alerting for secret expiration rates
