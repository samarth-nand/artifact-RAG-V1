# Frontend: Extract & Decrypt Client Secret

## Quick Reference for Frontend Team

The backend returns an **encrypted** OpenAI Realtime API secret. You must decrypt it with your RSA private key before using it.

## Step 1: Get Your RSA Private Key

Ask your backend team for the RSA key pair. You need:
- **Public key** → stored on backend (`RSA_PUBLIC_KEY` env var)
- **Private key** → stored on your frontend `.env.local` (NEVER commit to git)

### Generate keys (if you need to create them):
```bash
node -e "const crypto = require('crypto'); const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048, publicKeyEncoding: {type: 'spki', format: 'pem'}, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}}); console.log('PUBLIC KEY:\n' + publicKey + '\nPRIVATE KEY:\n' + privateKey);"
```

Copy the **PUBLIC KEY** to backend team, keep **PRIVATE KEY** secret.

## Step 2: Store Private Key in Frontend

**.env.local** (Next.js):
```bash
RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
[paste your private key here]
-----END PRIVATE KEY-----"
```

Or in your `.vercel/env` / environment variables dashboard.

## Step 3: Decrypt the Secret

### Option A: Server-Side Decryption (Recommended - Next.js API Route)

**app/api/realtime/decrypt-secret/route.ts**:
```typescript
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { encryptedSecret } = await req.json();
  
  const privateKey = process.env.RSA_PRIVATE_KEY!;
  const buffer = Buffer.from(encryptedSecret, 'base64');
  
  try {
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    
    const clientSecret = decrypted.toString('utf8');
    return NextResponse.json({ clientSecret });
  } catch (error) {
    return NextResponse.json(
      { error: 'Decryption failed' },
      { status: 500 }
    );
  }
}
```

**In your component**:
```typescript
// 1. Get encrypted secret from backend
const connectRes = await fetch('/interview/sessions/sess_123/connect', {
  method: 'POST',
  headers: {
    'X-User-Id': userId,
    'Content-Type': 'application/json',
  },
});

const { encryptedSecret, realtimeSessionId } = await connectRes.json();

// 2. Decrypt via your API route
const decryptRes = await fetch('/api/realtime/decrypt-secret', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ encryptedSecret }),
});

const { clientSecret } = await decryptRes.json();

// 3. Use with OpenAI Realtime API
const rt = new RealtimeClient({
  apiKey: clientSecret,
  dangerouslyAllowAPIKeyInBrowser: true,
});
```

### Option B: Client-Side Decryption (Browser - Web Crypto API)

```typescript
async function decryptSecret(
  encryptedSecret: string,
  privateKeyPem: string
): Promise<string> {
  // Import private key
  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
  
  // Decrypt
  const encryptedBuffer = Uint8Array.from(
    atob(encryptedSecret),
    c => c.charCodeAt(0)
  );
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedBuffer
  );
  
  return new TextDecoder().decode(decryptedBuffer);
}

// Usage
const clientSecret = await decryptSecret(
  encryptedSecret,
  process.env.NEXT_PUBLIC_RSA_PRIVATE_KEY!
);
```

### Option C: Using jsencrypt Library (Simplest)

```bash
npm install jsencrypt
```

```typescript
import JSEncrypt from 'jsencrypt';

function decryptSecret(encryptedSecret: string, privateKey: string): string {
  const decrypt = new JSEncrypt();
  decrypt.setPrivateKey(privateKey);
  
  const clientSecret = decrypt.decrypt(encryptedSecret);
  
  if (!clientSecret) throw new Error('Decryption failed');
  return clientSecret;
}

// Usage
const clientSecret = decryptSecret(
  encryptedSecret,
  process.env.NEXT_PUBLIC_RSA_PRIVATE_KEY!
);
```

## Step 4: Use the Decrypted Secret with OpenAI Realtime API

```typescript
import RealtimeClient from '@openai/realtime-js-beta';

const clientSecret = await decryptSecret(encryptedSecret, privateKey);

const rt = new RealtimeClient({
  apiKey: clientSecret,
  dangerouslyAllowAPIKeyInBrowser: true,
});

await rt.connect();
```

## Response Format

The backend sends this:
```json
{
  "encryptedSecret": "base64EncodedEncryptedData...",
  "realtimeSessionId": "sess_abc123",
  "encryption": {
    "algorithm": "RSA-OAEP",
    "hash": "SHA-256",
    "encoding": "base64"
  }
}
```

- `encryptedSecret` → Decrypt with your private key
- `realtimeSessionId` → Use directly with OpenAI Realtime API (this is the `model` parameter)
- `encryption` → Metadata about encryption (for reference)

## Complete Example (React)

```typescript
'use client';

import { useState } from 'react';
import crypto from 'crypto';
import RealtimeClient from '@openai/realtime-js-beta';

export default function InterviewComponent() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [rt, setRt] = useState<RealtimeClient | null>(null);

  async function decryptSecret(encryptedSecret: string): Promise<string> {
    const res = await fetch('/api/realtime/decrypt-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedSecret }),
    });
    const { clientSecret } = await res.json();
    return clientSecret;
  }

  async function startInterview() {
    setIsConnecting(true);
    try {
      // 1. Create session
      const createRes = await fetch('/interview/sessions', {
        method: 'POST',
        headers: {
          'X-User-Id': 'user-123',
          'Content-Type': 'application/json',
        },
      });
      const { realtimeSessionId, sessionId } = await createRes.json();

      // 2. Connect and get encrypted secret
      const connectRes = await fetch(`/interview/sessions/${sessionId}/connect`, {
        method: 'POST',
        headers: {
          'X-User-Id': 'user-123',
          'Content-Type': 'application/json',
        },
      });
      const { encryptedSecret } = await connectRes.json();

      // 3. Decrypt
      const clientSecret = await decryptSecret(encryptedSecret);

      // 4. Connect to OpenAI Realtime
      const client = new RealtimeClient({
        apiKey: clientSecret,
        dangerouslyAllowAPIKeyInBrowser: true,
      });

      await client.connect();
      setRt(client);
      console.log('Connected!');
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <button onClick={startInterview} disabled={isConnecting}>
      {isConnecting ? 'Connecting...' : 'Start Interview'}
    </button>
  );
}
```

## Security Checklist

- ✅ Private key stored in `.env.local` (not committed to git)
- ✅ Private key only accessed on server (API route) or with `NEXT_PUBLIC_` prefix for browser
- ✅ Encrypted secret decrypted immediately before use
- ✅ Decrypted secret NOT stored in localStorage or cookies
- ✅ `.gitignore` includes `.env.local`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Decryption failed` | Check private key matches backend's public key |
| `Invalid key format` | Ensure PEM headers are included (`-----BEGIN PRIVATE KEY-----`) |
| `Module not found: crypto` | Use Node.js crypto (built-in) or Web Crypto API in browser |
| `TypeError: Cannot read property 'decrypt'` | Check jsencrypt import and key format |
| Secret doesn't work with OpenAI | Verify decrypted string starts with `ek_` (ephemeral token) |

## For More Details

See [FRONTEND_DECRYPTION.md](../FRONTEND_DECRYPTION.md) for:
- All decryption method implementations
- Environment variable setup
- Key generation and rotation
- Performance benchmarks
- Complete troubleshooting guide
