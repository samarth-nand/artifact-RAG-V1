# Deployment Guide

This guide covers deploying artifact-grader to AWS.

## Prerequisites

- AWS account with appropriate permissions
- AWS CLI configured with credentials
- Node.js 20+
- Neon Postgres instance (or other managed Postgres)

## Pre-Deployment Checklist

- [ ] `.env` is configured with production credentials
- [ ] Database migrations have been run (`npm run db:push`)
- [ ] Knowledge base PDFs have been ingested
- [ ] API has been tested locally (`npm run dev`)
- [ ] No hardcoded secrets in code

## Step 1: Prepare AWS Credentials

Option A: Using AWS CLI
```bash
aws configure
```

Option B: Using environment variables
```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=us-east-1
```

## Step 2: Create Production Environment

```bash
# Create .env.production
cp .env.example .env.production
```

Update `.env.production` with:
```env
DATABASE_URL=postgresql://user:password@host/db
OPENAI_API_KEY=sk-...
OPENAI_TRANSCRIBE_MODEL=whisper-1
OPENAI_EMBED_MODEL=text-embedding-3-small
OPENAI_GRADE_MODEL=gpt-4o-mini
AUDIO_BUCKET_NAME=artifact-grader-audio-prod
AWS_REGION=us-east-1
LOG_LEVEL=info
NODE_ENV=production
```

## Step 3: Build & Deploy

### Option A: SST Deploy (Recommended)

```bash
# Deploy to AWS
npm run deploy

# You'll see:
# ✓ Created stack artifact-grader-dev
# ✓ API: https://abc123.execute-api.us-east-1.amazonaws.com
# ✓ AudioBucket: artifact-grader-audio-prod
```

### Option B: Manual CDK Deployment

```bash
# Compile TypeScript
npm run build

# Deploy using CDK
npx cdk deploy
```

## Step 4: Configure Lambda Environment Variables

The SST deployment passes some env vars automatically, but you'll need to set secrets:

```bash
# Using AWS CLI
aws lambda update-function-configuration \
  --function-name artifact-grader-dev-postAttempts \
  --environment Variables="{\
    DATABASE_URL=postgresql://...,\
    OPENAI_API_KEY=sk-...,\
    OPENAI_TRANSCRIBE_MODEL=whisper-1,\
    OPENAI_EMBED_MODEL=text-embedding-3-small,\
    OPENAI_GRADE_MODEL=gpt-4o-mini,\
    LOG_LEVEL=info\
  }"

# Repeat for other Lambda functions:
# - artifact-grader-dev-postProcessAttempt
# - artifact-grader-dev-getAttemptHandler
```

Or use AWS Systems Manager Parameter Store:
```bash
# Store secrets
aws ssm put-parameter \
  --name /artifact-grader/database-url \
  --value "postgresql://..." \
  --type SecureString

aws ssm put-parameter \
  --name /artifact-grader/openai-api-key \
  --value "sk-..." \
  --type SecureString
```

Then update Lambda functions to read from Parameter Store:
```typescript
// In handlers
const databaseUrl = await getParameter('/artifact-grader/database-url');
```

## Step 5: Verify Deployment

### Test API Endpoints

```bash
API_URL="https://abc123.execute-api.us-east-1.amazonaws.com"

# Create attempt
curl -X POST $API_URL/attempts \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","questionId":"pm_case_001"}' | jq .

# Get attempt
ATTEMPT_ID="..."
curl $API_URL/attempts/$ATTEMPT_ID | jq .
```

### Check CloudWatch Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/artifact-grader-dev-postAttempts --follow

# Or in AWS Console:
# CloudWatch → Logs → Log Groups → /aws/lambda/artifact-grader-dev-*
```

### Monitor S3 Bucket

```bash
# List uploaded audio files
aws s3 ls s3://artifact-grader-audio-prod/audio/
```

## Step 6: Database Maintenance

### Backup Postgres

```bash
# Neon: Use their backup UI or CLI
# Or take pg_dump:
pg_dump $DATABASE_URL > backup.sql

# Restore from backup:
psql $DATABASE_URL < backup.sql
```

### Monitor Knowledge Base

```bash
psql $DATABASE_URL << 'EOF'
SELECT 
  COUNT(*) as total_chunks,
  SUM(content_tokens) as total_tokens,
  MIN(created_at) as oldest_chunk,
  MAX(created_at) as newest_chunk
FROM kb_chunks;
EOF
```

## Step 7: Enable CloudFront (Optional CDN)

For geographically distributed uploads, add CloudFront in front of S3:

```bash
# In sst.config.ts, add:
const distribution = new cloudfront.Distribution(stack, "cdn", {
  defaultBehavior: {
    origin: new origins.S3Origin(audioBucket),
  },
});
```

## Step 8: Cost Optimization

### Lambda

- **Current:** Pay per invocation + compute time
- **Optimize:** 
  - Increase timeout if processing is hanging
  - Increase memory to speed up processing (faster CPU)
  - Consider Reserved Concurrency for predictable load

```bash
aws lambda put-function-concurrency \
  --function-name artifact-grader-dev-postProcessAttempt \
  --reserved-concurrent-executions 10
```

### S3

- **Current:** Pay per upload + storage
- **Optimize:**
  - Add Lifecycle Policy to delete old audio after 30 days
  - Use S3 Intelligent-Tiering for archival

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket artifact-grader-audio-prod \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "DeleteOldAudio",
      "Status": "Enabled",
      "Expiration": {"Days": 30},
      "Filter": {"Prefix": "audio/"}
    }]
  }'
```

### OpenAI

- **Current:** Pay per API call (transcription, embeddings, grading)
- **Optimize:**
  - Cache embeddings for repeated queries
  - Use cheaper models where possible (e.g., `gpt-3.5-turbo` instead of `gpt-4o-mini`)
  - Batch embedding requests

### Postgres

- **Current:** Neon pay-as-you-go
- **Optimize:**
  - Add indexes (already in schema)
  - Archive old attempts to cold storage
  - Use read replicas for analytics

## Step 9: Scaling Considerations

### For 10K+ daily attempts:

1. **Add SQS for async processing**
   - Move `processAttempt` to an SQS worker Lambda
   - Keep `createAttempt` synchronous
   - Update `getAttempt` to support polling

2. **Add Redis cache**
   - Cache KB chunk embeddings
   - Cache popular queries
   - Use ElastiCache for managed Redis

3. **Database optimization**
   - Use read replicas
   - Partition `kb_chunks` by `document_id`
   - Add materialized views for analytics

4. **Multi-region deployment**
   - Deploy to multiple AWS regions
   - Use Route53 for geo-routing
   - Replicate Postgres using Neon's multi-region support

## Step 10: Monitoring & Alerts

### CloudWatch Alarms

```bash
# Lambda error rate
aws cloudwatch put-metric-alarm \
  --alarm-name artifact-grader-errors \
  --alarm-description "Alert on Lambda errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:...

# S3 access errors
aws cloudwatch put-metric-alarm \
  --alarm-name artifact-grader-s3-errors \
  --alarm-description "S3 4xx errors" \
  --metric-name 4xxErrors \
  --namespace AWS/S3 \
  --statistic Sum \
  --period 300 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold
```

### Custom Metrics

Track in your code:
```typescript
import { cloudwatch } from '@aws-sdk/client-cloudwatch';

const cw = new cloudwatch.CloudWatchClient();

// Log custom metric
await cw.putMetricData({
  Namespace: 'ArtifactGrader',
  MetricData: [{
    MetricName: 'ProcessingTime',
    Value: processingTimeMs,
    Unit: 'Milliseconds',
  }],
});
```

## Step 11: CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  AWS_REGION: us-east-1

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - run: npm run typecheck

      - run: npm run build

      - uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions
          aws-region: ${{ env.AWS_REGION }}

      - run: npm run deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Rollback Procedure

If something goes wrong after deployment:

```bash
# List deployments
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Rollback to previous version
aws cloudformation cancel-update-stack --stack-name artifact-grader-dev

# Or manually redeploy from last commit
git checkout <last-known-good-commit>
npm run deploy
```

## Production Checklist

Before going live:

- [ ] Database is backed up daily
- [ ] CloudWatch alarms are configured
- [ ] DNS is pointing to API Gateway
- [ ] CORS is properly configured for your frontend
- [ ] Rate limiting is enabled (API Gateway)
- [ ] WAF is enabled for DDoS protection
- [ ] Secrets are in AWS Secrets Manager, not code
- [ ] Lambda functions have appropriate timeouts (default 60s, increase if needed)
- [ ] S3 bucket has versioning enabled
- [ ] Bucket is not publicly accessible
- [ ] Logging is enabled for all services
- [ ] API documentation is up to date
- [ ] Load testing has been performed
- [ ] Disaster recovery plan is in place

## Support & Troubleshooting

### Lambda timeout

If processing times out:
```bash
# Increase timeout to 5 minutes
aws lambda update-function-configuration \
  --function-name artifact-grader-dev-postProcessAttempt \
  --timeout 300
```

### Database connection pool exhausted

Increase RDS proxy connection pool:
```bash
aws rds-proxy modify-db-proxy-target-group \
  --proxy-name artifact-grader-proxy \
  --target-group-name default \
  --max-idle-connections-percent 50
```

### Out of memory

Increase Lambda memory:
```bash
aws lambda update-function-configuration \
  --function-name artifact-grader-dev-postProcessAttempt \
  --memory-size 3008  # Max is 10GB (10240 MB)
```

---

For more help, check AWS documentation or open an issue in the repository.
