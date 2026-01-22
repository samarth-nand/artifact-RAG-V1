# Backend API Setup Checklist

Use this checklist to prepare your backend to accept API requests from a Next.js frontend.

## ✅ Changes Already Made

- [x] Added CORS configuration with origin whitelist
- [x] Added environment variables for `CORS_ORIGINS` and `SERVE_FRONTEND`
- [x] Made static file serving optional (API-only mode)
- [x] Enhanced health check endpoint with timestamp
- [x] Updated Render deployment configuration
- [x] Created API specification document
- [x] Updated .env.example with new variables

## 📋 Deployment Steps

### 1. Update Environment Variables

**On Render (or your hosting platform):**

Go to your service dashboard and add/update these environment variables:

```bash
CORS_ORIGINS=https://your-nextjs-app.vercel.app,http://localhost:3000
SERVE_FRONTEND=false
```

**Important:** 
- Replace `https://your-nextjs-app.vercel.app` with your actual Next.js frontend URL
- Include `http://localhost:3000` for local development testing
- Set `SERVE_FRONTEND=false` to run in API-only mode

### 2. Deploy the Updated Backend

```bash
# Commit the changes
git add .
git commit -m "Configure backend for Next.js frontend API access"
git push origin main
```

Render will automatically redeploy (if `autoDeploy: true` is set).

### 3. Test the API

Once deployed, test that CORS is working:

```bash
# Test health check
curl https://your-backend.onrender.com/healthz

# Test from your Next.js frontend (in browser console)
fetch('https://your-backend.onrender.com/healthz')
  .then(r => r.json())
  .then(console.log)
```

If you see a CORS error, double-check your `CORS_ORIGINS` environment variable.

### 4. Update Your Next.js Frontend

In your Next.js app, set the API base URL:

**`.env.local` (for development):**
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

**Vercel environment variables (for production):**
```
NEXT_PUBLIC_API_BASE_URL=https://your-backend.onrender.com
```

**In your Next.js code:**
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

// Make API calls
const response = await fetch(`${API_BASE_URL}/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id, question_id, question_text })
});
```

## 🔧 Local Development Setup

To test locally before deploying:

1. **Update your local `.env` file:**
```bash
# .env
CORS_ORIGINS=http://localhost:3000,http://localhost:8080
SERVE_FRONTEND=false
```

2. **Start the backend:**
```bash
npm run db:migrate
npm start
```

The backend will run on `http://localhost:3000` in API-only mode.

3. **Start your Next.js app** (in a different terminal):
```bash
cd path/to/your-nextjs-app
npm run dev
```

Your Next.js app should be able to call the backend API.

## 🚀 Production Checklist

Before going live, make sure:

- [ ] `CORS_ORIGINS` is set to your production Next.js URL (not `*`)
- [ ] `SERVE_FRONTEND=false` in production (API-only mode)
- [ ] Health check endpoint returns 200 OK
- [ ] Test all API endpoints with curl or Postman
- [ ] Database migrations have been run
- [ ] OpenAI API key is set correctly
- [ ] Consider adding authentication/API keys (see recommendations below)
- [ ] Set up monitoring/logging (optional but recommended)

## 🔐 Security Recommendations

### 1. Add Authentication (Optional but Recommended)

Consider adding JWT tokens or API keys:

```typescript
// Middleware to check API key
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

Add to your environment variables:
```bash
API_KEY=your-secret-api-key-here
```

In your Next.js frontend:
```typescript
fetch(`${API_BASE_URL}/sessions`, {
  headers: { 
    'Content-Type': 'application/json',
    'X-API-Key': process.env.NEXT_PUBLIC_API_KEY // Store this in Vercel env vars
  }
})
```

### 2. Add Rate Limiting (Recommended for Production)

Install rate limiting middleware:
```bash
npm install express-rate-limit
```

Add to your server:
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api', limiter);
```

### 3. Restrict CORS in Production

Never use `CORS_ORIGINS=*` in production. Always specify exact domains:

```bash
# Production
CORS_ORIGINS=https://your-app.vercel.app

# Production + staging
CORS_ORIGINS=https://your-app.vercel.app,https://staging.your-app.vercel.app
```

## 📚 Documentation Reference

- **API Specification**: See [API_SPEC.md](./API_SPEC.md) for complete endpoint documentation
- **Migration Guide**: See [NEXTJS_MIGRATION_GUIDE.md](./NEXTJS_MIGRATION_GUIDE.md) for architecture overview
- **Environment Variables**: See [.env.example](./.env.example) for all available config options

## 🐛 Troubleshooting

### CORS Error: "No 'Access-Control-Allow-Origin' header"

**Problem**: Your Next.js frontend shows CORS errors in the browser console.

**Solution**: 
1. Check that `CORS_ORIGINS` includes your Next.js frontend URL
2. Verify the backend is actually using the updated code (check deployment logs)
3. Try with `CORS_ORIGINS=*` temporarily to confirm CORS is the issue

### Error: "Cannot find module"

**Problem**: Backend crashes on startup.

**Solution**: Run the build command and check for TypeScript errors:
```bash
npm run build
```

### Health Check Fails

**Problem**: `/healthz` returns 404 or 500.

**Solution**: Check that the backend is actually running and the PORT is correct:
```bash
curl http://localhost:3000/healthz
```

### Database Connection Fails

**Problem**: Backend crashes with "database connection failed".

**Solution**: Verify `DATABASE_URL` is set correctly and the database is accessible:
```bash
# On Render, check the environment variables dashboard
# For local, check your .env file
echo $DATABASE_URL
```

## 🎯 Next Steps

Once your backend is ready:

1. **Test all endpoints** using the examples in [API_SPEC.md](./API_SPEC.md)
2. **Integrate with Next.js** following [NEXTJS_MIGRATION_GUIDE.md](./NEXTJS_MIGRATION_GUIDE.md)
3. **Set up monitoring** (optional but recommended for production)
4. **Add authentication** if handling sensitive data
5. **Configure rate limiting** to prevent abuse

