# Documentation Index

Welcome to the artifact-grader repository! This guide will help you navigate the documentation.

## For First-Time Setup

1. **Start here:** [README.md](./README.md)
   - Project overview
   - Quick start guide (5 steps)
   - API endpoint documentation
   - Basic troubleshooting

2. **Then read:** [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
   - Command cheat sheet
   - API examples
   - Common queries
   - Troubleshooting matrix

## For Testing & Development

3. **Testing:** [TESTING.md](./TESTING.md)
   - Full integration test walkthrough
   - PDF ingestion examples
   - cURL command examples
   - Database inspection queries
   - Debugging tips
   - Load testing example
   - CI/CD workflow template

4. **Database:** [MIGRATIONS.md](./MIGRATIONS.md)
   - Migration process
   - Schema documentation
   - Migration commands

## For Understanding the System

5. **Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)
   - System overview diagram
   - Component architecture
   - Data flow diagrams
   - Scaling roadmap
   - Security considerations
   - Performance characteristics
   - Cost estimation

6. **Build Summary:** [BUILD_SUMMARY.md](./BUILD_SUMMARY.md)
   - What was built
   - Feature checklist
   - Technology stack
   - File structure
   - Documentation overview

## For Production Deployment

7. **Deployment:** [DEPLOYMENT.md](./DEPLOYMENT.md)
   - Pre-deployment checklist
   - Step-by-step deployment
   - Environment setup
   - Lambda configuration
   - Cost optimization
   - Monitoring & alerts
   - Rollback procedures
   - Production checklist

## Repository Structure

```
artifact-grader/
├── src/
│   ├── api/          # HTTP handlers (3 endpoints)
│   ├── db/           # Database & schema
│   ├── kb/           # Knowledge base & PDF ingestion
│   ├── llm/          # OpenAI integration
│   ├── shared/       # Validation, logging, types
│   └── util/         # S3, hashing, time utilities
├── scripts/
│   └── ingest.ts     # PDF ingestion CLI
├── sst.config.ts     # Infrastructure config
├── drizzle.config.ts # ORM config
├── package.json      # Dependencies
├── tsconfig.json     # TypeScript config
└── *.md              # Documentation (this directory)
```

## Documentation Map

| Document | Audience | Time | Purpose |
|----------|----------|------|---------|
| README.md | Developers | 15 min | Getting started |
| QUICK_REFERENCE.md | Developers | 5 min | Command cheat sheet |
| TESTING.md | QA / Developers | 30 min | Testing & examples |
| MIGRATIONS.md | DevOps / Developers | 10 min | Database setup |
| ARCHITECTURE.md | Architects / Senior Devs | 30 min | System design |
| DEPLOYMENT.md | DevOps / SRE | 45 min | Production deployment |
| BUILD_SUMMARY.md | Project Managers | 15 min | What was delivered |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your OpenAI API key and database URL

# 3. Initialize database
npm run db:push

# 4. Ingest a PDF
npm run ingest -- --file "./books/book.pdf" --title "Book Title"

# 5. Start development server
npm run dev

# 6. Test an API (in another terminal)
curl -X POST http://localhost:3000/attempts \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-1","questionId":"pm_case_001"}'
```

## Key Concepts

### The Three APIs

1. **POST /attempts** - Create a grading attempt
   - Returns presigned S3 URL for audio upload
   - Status tracking from creation
   
2. **POST /attempts/{id}/process** - Process audio
   - Transcribe with Whisper
   - Retrieve relevant KB chunks
   - Grade with LLM
   - Store results

3. **GET /attempts/{id}** - Poll for results
   - Returns status and results when ready

### The Processing Pipeline

```
Audio Upload
    ↓
Transcription (Whisper)
    ↓
Knowledge Base Retrieval (pgvector)
    ↓
LLM Grading (with RAG)
    ↓
Result Storage (JSONB)
    ↓
Citation Generation
```

### Key Technologies

- **Frontend**: Any client (web, mobile, CLI)
- **API Gateway**: AWS API Gateway (REST)
- **Compute**: AWS Lambda (Node.js 20, TypeScript)
- **Storage**: S3 (audio files)
- **Database**: Neon Postgres (pgvector for embeddings)
- **ORM**: Drizzle (type-safe)
- **LLM**: OpenAI (Whisper, embeddings, chat)
- **Infrastructure**: SST (serverless framework)

## Common Tasks

### Ingest a PDF
```bash
npm run ingest -- --file "./book.pdf" --title "Book Title"
```

### Check Database
```bash
psql $DATABASE_URL
SELECT * FROM kb_documents;
SELECT COUNT(*) FROM kb_chunks;
```

### Test an Endpoint
See TESTING.md for detailed examples

### Deploy to AWS
See DEPLOYMENT.md for step-by-step guide

### Debug Issues
See troubleshooting section in README.md

## Support

### Getting Help

1. **Local Development Issues**
   - Check TESTING.md for debugging tips
   - Enable debug logging: `LOG_LEVEL=debug npm run dev`

2. **Deployment Issues**
   - Check DEPLOYMENT.md troubleshooting
   - Check CloudWatch logs in AWS Console

3. **Architecture Questions**
   - Read ARCHITECTURE.md
   - Check inline code comments

4. **API Usage**
   - See README.md API section
   - See QUICK_REFERENCE.md examples
   - See TESTING.md for detailed curl examples

## File Navigation

### For Developers
- Start: README.md
- Reference: QUICK_REFERENCE.md
- Testing: TESTING.md
- Source: src/ directory

### For DevOps/SRE
- Setup: DEPLOYMENT.md
- Config: drizzle.config.ts, sst.config.ts
- Monitoring: DEPLOYMENT.md monitoring section

### For Architects
- Design: ARCHITECTURE.md
- Code: Read inline comments in src/

### For Project Managers
- Summary: BUILD_SUMMARY.md
- Features: README.md features section
- Timeline: See "Future Enhancements" in ARCHITECTURE.md

## Version Information

- Node.js: 20+
- TypeScript: 5.3+
- SST: 3.0+
- Postgres: 14+ (with pgvector)
- OpenAI API: Latest (gpt-5.2)

## Next Steps

1. **Setup** → Follow README.md
2. **Test** → Follow TESTING.md
3. **Deploy** → Follow DEPLOYMENT.md
4. **Monitor** → Setup CloudWatch alerts (DEPLOYMENT.md)
5. **Scale** → Refer to ARCHITECTURE.md scaling section

---

**Happy coding!** 🚀

For questions or issues, refer to the appropriate documentation above.
