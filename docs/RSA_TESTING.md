# RSA Encryption Testing Guide

This guide covers testing the RSA encryption layer for OpenAI Realtime WebRTC client secret exchange.

## Quick Test (Development)

### 1. Generate Test Key Pair

```bash
node -e "const crypto = require('crypto'); const {publicKey, privateKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048, publicKeyEncoding: {type: 'spki', format: 'pem'}, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}}); console.log('PUBLIC KEY:\n' + publicKey + '\nPRIVATE KEY:\n' + privateKey);"
```

Output:
```
PUBLIC KEY:
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----

PRIVATE KEY:
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----
```

### 2. Set Environment Variables

**.env**:
```bash
RSA_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----"
```

### 3. Create Interview Session

```bash
curl -X POST http://localhost:3000/interview/sessions \
  -H "X-User-Id: test-user-123" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response**:
```json
{
  "realtimeSessionId": "sess_abc123...",
  "sessionId": "sess_abc123..."
}
```

### 4. Connect and Get Encrypted Secret

```bash
curl -X POST http://localhost:3000/interview/sessions/sess_abc123/connect \
  -H "X-User-Id: test-user-123" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response** (with encrypted secret):
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

### 5. Decrypt the Secret (Node.js)

```typescript
import crypto from 'crypto';

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
...your private key...
-----END PRIVATE KEY-----`;

const encryptedSecret = "base64EncodedEncryptedData..."; // from response above

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

const clientSecret = decryptSecret(encryptedSecret);
console.log("Decrypted secret:", clientSecret);
// Output: ek_live_123...
```

## Automated Test Script

Create **test-rsa-encryption.js**:

```javascript
const crypto = require('crypto');
const https = require('https');

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
...paste your private key here...
-----END PRIVATE KEY-----`;

const USER_ID = 'test-user-' + Math.random().toString(36).substr(2, 9);
const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers: {
        'X-User-Id': USER_ID,
        'Content-Type': 'application/json',
      },
    };

    const protocol = url.protocol === 'https:' ? https : require('http');
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function decryptSecret(encrypted) {
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

async function test() {
  console.log('=== RSA Encryption Test ===\n');
  console.log('User ID:', USER_ID);

  try {
    // Step 1: Create session
    console.log('\n[1/3] Creating interview session...');
    const createRes = await makeRequest('POST', '/interview/sessions', {});
    console.log('Status:', createRes.status);
    console.log('SessionId:', createRes.body.realtimeSessionId);

    if (createRes.status !== 200) {
      console.error('Failed to create session:', createRes.body);
      return;
    }

    const sessionId = createRes.body.realtimeSessionId;

    // Step 2: Connect and get encrypted secret
    console.log('\n[2/3] Connecting and retrieving encrypted secret...');
    const connectRes = await makeRequest('POST', `/interview/sessions/${sessionId}/connect`, {});
    console.log('Status:', connectRes.status);
    console.log('Encryption:', connectRes.body.encryption);

    if (connectRes.status !== 200) {
      console.error('Failed to connect:', connectRes.body);
      return;
    }

    const encryptedSecret = connectRes.body.encryptedSecret;
    console.log('Encrypted secret (first 50 chars):', encryptedSecret.substring(0, 50) + '...');

    // Step 3: Decrypt the secret
    console.log('\n[3/3] Decrypting secret with private key...');
    const decrypted = decryptSecret(encryptedSecret);
    console.log('✅ Decryption successful!');
    console.log('Decrypted secret (first 20 chars):', decrypted.substring(0, 20) + '...');
    console.log('Secret starts with "ek_":', decrypted.startsWith('ek_'));

    console.log('\n=== Test Passed ✅ ===');
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    process.exit(1);
  }
}

test();
```

**Run the test**:
```bash
node test-rsa-encryption.js
```

**Expected output**:
```
=== RSA Encryption Test ===

User ID: test-user-abc123

[1/3] Creating interview session...
Status: 200
SessionId: sess_xyz789...

[2/3] Connecting and retrieving encrypted secret...
Status: 200
Encryption: { algorithm: 'RSA-OAEP', hash: 'SHA-256', encoding: 'base64' }
Encrypted secret (first 50 chars): h3q7K8lP2mN9vB5xZ1wQ4rT6yU8iO0aS3dF6gH9jK0l...

[3/3] Decrypting secret with private key...
✅ Decryption successful!
Decrypted secret (first 20 chars): ek_live_6hR8q3vM2k...
Secret starts with "ek_": true

=== Test Passed ✅ ===
```

## Browser Testing (Next.js)

Create **pages/api/test-decrypt.ts**:

```typescript
import crypto from 'crypto';
import { NextApiRequest, NextApiResponse } from 'next';

const PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { encryptedSecret } = req.body;

  if (!encryptedSecret) {
    return res.status(400).json({ error: 'Missing encryptedSecret' });
  }

  if (!PRIVATE_KEY) {
    return res.status(500).json({ error: 'RSA_PRIVATE_KEY not configured' });
  }

  try {
    const buffer = Buffer.from(encryptedSecret, 'base64');
    const decrypted = crypto.privateDecrypt(
      {
        key: PRIVATE_KEY,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );

    const clientSecret = decrypted.toString('utf8');
    
    return res.status(200).json({
      success: true,
      clientSecret,
      preview: clientSecret.substring(0, 20) + '...',
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Decryption failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

Then in your frontend component:

```typescript
async function testDecryption(encryptedSecret: string) {
  const response = await fetch('/api/test-decrypt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptedSecret }),
  });

  const data = await response.json();
  
  if (data.success) {
    console.log('✅ Decryption successful!');
    console.log('Client secret:', data.clientSecret);
  } else {
    console.error('❌ Decryption failed:', data.error);
  }
}
```

## Troubleshooting

### "Decryption failed" Error

**Cause**: Private key doesn't match the public key used by backend

**Solution**:
1. Verify you're using the same key pair (public on backend, private on frontend)
2. Check that keys are not corrupted or have extra whitespace
3. Ensure both use PEM format with headers

### "Invalid key format" Error

**Cause**: Key is not in PKCS#8 format or missing PEM headers

**Solution**:
```bash
# Convert PKCS#1 private key to PKCS#8
openssl pkcs8 -topk8 -inform PEM -outform PEM -in private_key_pkcs1.pem -out private_key_pkcs8.pem -nocrypt
```

### "Module not found: crypto" Error

**Solution**: Use Node.js crypto module (built-in, no installation needed)

For browser environment, use Web Crypto API or jsencrypt library:
```bash
npm install jsencrypt
```

## Performance Notes

- **Encryption**: ~1-2ms (backend, happens once per session)
- **Decryption**: ~5-10ms (frontend, happens once per session)
- **Key generation**: ~100-200ms (only needed for development)
- **Key size**: 2048-bit RSA (industry standard)

These timings are acceptable since encryption/decryption happens once per interview session, not per message.

## Security Checklist

- ✅ Private key stored only in frontend `.env` or environment variables
- ✅ Public key stored on backend `.env`
- ✅ Keys are 2048-bit RSA minimum
- ✅ Algorithm is RSA-OAEP with SHA-256
- ✅ Secrets are base64 encoded after encryption
- ✅ Different key pair for dev/production
- ✅ Keys rotated every 90 days
- ✅ Private key never committed to version control
- ✅ Decryption happens server-side when possible (Next.js API routes)

## Next Steps

1. **Generate production keys**: Use OpenSSL, store securely
2. **Deploy to production**: Set RSA_PUBLIC_KEY in backend env vars
3. **Frontend integration**: Implement decryption as shown in [FRONTEND_DECRYPTION.md](./FRONTEND_DECRYPTION.md)
4. **Monitor logs**: Check server logs for "TEMPORARY PRIVATE KEY" warnings (should not appear in production)
