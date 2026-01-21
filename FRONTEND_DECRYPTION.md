# Frontend RSA Decryption Guide

The backend encrypts the OpenAI Realtime API `client_secret` using RSA public key encryption before sending it to the frontend. This adds defense-in-depth security, ensuring that even if HTTPS is compromised, the secret remains encrypted.

## Overview

**Encryption Flow:**
1. Backend encrypts `client_secret` with RSA public key (2048-bit RSA-OAEP with SHA-256)
2. Frontend receives base64-encoded encrypted secret
3. Frontend decrypts with RSA private key
4. Frontend uses decrypted secret to connect to OpenAI Realtime API

## Response Format

```typescript
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

## Decryption Methods

### Method 1: Node.js / React Native (using crypto module)

```typescript
import crypto from 'crypto';

const PRIVATE_KEY = process.env.RSA_PRIVATE_KEY!;

function decryptClientSecret(encryptedSecret: string): string {
  const buffer = Buffer.from(encryptedSecret, 'base64');
  
  const decrypted = crypto.privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    buffer
  );
  
  return decrypted.toString('utf8');
}

// Usage
const response = await fetch('/interview/sessions/sess_123/connect', {
  method: 'POST',
  headers: {
    'X-User-Id': userId,
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
const clientSecret = decryptClientSecret(data.encryptedSecret);

// Use clientSecret with OpenAI Realtime API
```

### Method 2: Browser (using Web Crypto API)

```typescript
// First, convert your PEM private key to CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Remove PEM header/footer and newlines
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');
  
  // Base64 decode
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['decrypt']
  );
}

async function decryptClientSecret(
  encryptedSecret: string,
  privateKey: CryptoKey
): Promise<string> {
  // Decode base64
  const encryptedBuffer = Uint8Array.from(
    atob(encryptedSecret),
    c => c.charCodeAt(0)
  );
  
  // Decrypt
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedBuffer
  );
  
  // Convert to string
  return new TextDecoder().decode(decryptedBuffer);
}

// Usage
const PRIVATE_KEY_PEM = process.env.NEXT_PUBLIC_RSA_PRIVATE_KEY!;
const privateKey = await importPrivateKey(PRIVATE_KEY_PEM);

const response = await fetch('/interview/sessions/sess_123/connect', {
  method: 'POST',
  headers: {
    'X-User-Id': userId,
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
const clientSecret = await decryptClientSecret(data.encryptedSecret, privateKey);
```

### Method 3: Using jsencrypt Library (Simpler for Browsers)

```bash
npm install jsencrypt
```

```typescript
import JSEncrypt from 'jsencrypt';

const PRIVATE_KEY = process.env.NEXT_PUBLIC_RSA_PRIVATE_KEY!;

function decryptClientSecret(encryptedSecret: string): string {
  const decrypt = new JSEncrypt();
  decrypt.setPrivateKey(PRIVATE_KEY);
  
  const decrypted = decrypt.decrypt(encryptedSecret);
  
  if (!decrypted) {
    throw new Error('Failed to decrypt client secret');
  }
  
  return decrypted;
}
```

## Generating Key Pair

### For Development

Run this command to generate a key pair:

```bash
node -e "const crypto = require('crypto'); const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048, publicKeyEncoding: {type: 'spki', format: 'pem'}, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}}); console.log('PUBLIC KEY:\n' + publicKey + '\nPRIVATE KEY:\n' + privateKey);"
```

### For Production

Use OpenSSL for production key generation:

```bash
# Generate private key
openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:2048

# Extract public key
openssl rsa -pubout -in private_key.pem -out public_key.pem

# View keys
cat public_key.pem
cat private_key.pem
```

## Environment Variables

### Backend (.env)

```bash
# Paste the entire public key (including headers)
RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----"
```

### Frontend (.env.local for Next.js)

```bash
# Paste the entire private key (including headers)
# Note: Use NEXT_PUBLIC_ prefix if needed in browser, or regular env var if server-side only
RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----"
```

## Security Best Practices

1. **Never commit private keys to git** - Add `.env.local` to `.gitignore`
2. **Use environment variables** - Store keys in Vercel env vars or similar
3. **Rotate keys periodically** - Generate new key pairs every 90 days
4. **Separate dev/prod keys** - Use different key pairs for different environments
5. **Key size** - Use at least 2048-bit RSA (backend generates 2048-bit)
6. **Server-side decryption** - If possible, decrypt on your Next.js API routes (not in browser)

## TypeScript Types

```typescript
interface ConnectResponse {
  encryptedSecret: string;
  realtimeSessionId: string;
  encryption: {
    algorithm: 'RSA-OAEP';
    hash: 'SHA-256';
    encoding: 'base64';
  };
}

interface EncryptionConfig {
  publicKey: string;  // Backend
  privateKey: string; // Frontend
}
```

## Troubleshooting

### "Failed to decrypt" Error

- Verify the private key matches the public key used by backend
- Check that the base64 encoding is correct
- Ensure you're using the same algorithm (RSA-OAEP with SHA-256)
- Verify the key format (PKCS#8 for private, SPKI for public)

### "Invalid key format" Error

- Make sure to include PEM headers (`-----BEGIN PRIVATE KEY-----`)
- Check for extra whitespace or newlines
- Verify the key is PKCS#8 format (not PKCS#1)

### Performance Concerns

RSA decryption is CPU-intensive but acceptable for this use case:
- Decryption happens once per session (not per message)
- 2048-bit RSA decrypts in ~5-10ms on modern devices
- Secret is small (~50 bytes), so no chunking needed

## Complete Example (Next.js API Route)

```typescript
// app/api/realtime/connect/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PRIVATE_KEY = process.env.RSA_PRIVATE_KEY!;

function decryptSecret(encrypted: string): string {
  const buffer = Buffer.from(encrypted, 'base64');
  return crypto.privateDecrypt(
    {
      key: PRIVATE_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    buffer
  ).toString('utf8');
}

export async function POST(req: NextRequest) {
  const { sessionId } = await req.json();
  const userId = req.headers.get('x-user-id')!;
  
  // Get encrypted secret from backend
  const response = await fetch(
    `${process.env.BACKEND_URL}/interview/sessions/${sessionId}/connect`,
    {
      method: 'POST',
      headers: {
        'X-User-Id': userId,
        'Content-Type': 'application/json',
      },
    }
  );
  
  const data = await response.json();
  
  // Decrypt server-side (more secure than client-side)
  const clientSecret = decryptSecret(data.encryptedSecret);
  
  // Return decrypted secret to frontend
  return NextResponse.json({
    clientSecret,
    realtimeSessionId: data.realtimeSessionId,
  });
}
```

## Why RSA Encryption?

Even though the connection uses HTTPS, RSA encryption provides defense-in-depth:

1. **TLS termination**: If your reverse proxy terminates TLS, the secret is still encrypted
2. **Logging/monitoring**: Prevents accidental logging of plaintext secrets
3. **Man-in-the-middle**: Extra protection against certificate attacks
4. **Compliance**: Some security policies require encrypted secrets even over TLS
5. **Zero-trust**: Secrets are encrypted end-to-end, not just in transit

The OpenAI `client_secret` is highly sensitive - it allows direct browser connections to their Realtime API. RSA ensures only your authenticated frontend can decrypt and use it.
