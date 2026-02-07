# Docker Quickstart (artifact-grader)

This document is the fastest way to build and run **artifact-grader** on any computer with Docker installed.

## What you get

- One container for the app (**Node.js API + static frontend**) on port **3000**
- One container for Postgres (**pgvector-enabled**) on port **5432**
- Automatic DB migrations on app startup

Once running, open:
- UI: `http://localhost:3000`
- Health check: `http://localhost:3000/healthz`

---

## Prerequisites

- Docker Desktop (Mac/Windows) or Docker Engine (Linux)
- `git`
- An OpenAI API key (required for realtime interview + grading)

---

## 1) Get the code

```bash
git clone <REPO_URL>
cd artifact-grader
```

---

## 2) Set required environment variables

You must provide `OPENAI_API_KEY`.

### Option A (recommended): export in your shell

```bash
export OPENAI_API_KEY="sk-..."
# Optional: grading model (defaults to gpt-5.2)
export OPENAI_GRADE_MODEL="gpt-5.2"
```

### Option B: .env file (Compose will read it)

Create a file named `.env` in the repo root:

```env
OPENAI_API_KEY=sk-...
OPENAI_GRADE_MODEL=gpt-5.2
```

---

## 3) Run with Docker Compose (recommended)

This starts Postgres + the app.

```bash
docker compose up --build
```

Then open:

- `http://localhost:3000`

To stop:

```bash
Ctrl+C
```

To stop and remove containers:

```bash
docker compose down
```

---

## 4) Run the image without Compose (advanced)

If you already have a Postgres instance and only want the app container:

```bash
docker run --rm -p 3000:3000 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  -e OPENAI_GRADE_MODEL="${OPENAI_GRADE_MODEL:-gpt-5.2}" \
  -e DATABASE_URL="postgres://postgres:postgres@<host>:5432/artifact_grader" \
  artifact-grader:local
```

Notes:
- The container runs `npm run db:migrate` on startup, so `DATABASE_URL` must be reachable.

---

## Easiest "one link" option (no Docker for the tester): Render

If the goal is **send one URL** to a non-technical tester, the simplest path is to deploy the full stack (app + Postgres) on Render.

This repo includes a Render Blueprint file: `render.yaml` (it tells Render how to build + start the app and provision Postgres).

Steps:
1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, select your repo.
3. Set the `OPENAI_API_KEY` secret when prompted.
4. Deploy.

After deploy finishes, Render will give you a single HTTPS URL like:
`https://artifact-grader.onrender.com`

That’s the only link you need to send.

Notes:
- The service runs migrations automatically on startup.
- If you change schema/migrations, just push to `main` and Render will redeploy.

## Common issues / fixes

### Docker says it cannot connect to the daemon

- Make sure Docker Desktop is running.

### Build fails with credential helper error (`docker-credential-desktop`)

Some setups have a broken Docker credential helper configuration.
Workaround (build using a temporary Docker config):

```bash
tmpcfg="$(mktemp -d)"
DOCKER_CONFIG="$tmpcfg" docker build -t artifact-grader:local .
```

### App starts but you get OpenAI errors

- Confirm `OPENAI_API_KEY` is set (either in your shell or `.env`).
- The app needs outbound internet access.

### Database/migrations issues

The app runs migrations automatically on startup.
If you want a clean slate:

```bash
docker compose down -v
docker compose up --build
```

(`-v` deletes the Postgres volume, wiping all DB data.)

### Ports already in use

- UI/API uses `3000`.
- Postgres uses `5432`.

If you already have something on 3000, change the host port in `docker-compose.yml`:

```yaml
ports:
  - "3001:3000"
```

Then open `http://localhost:3001`.

---

## What to send back when reporting a bug

Ask the tester to include:

1. Output of:
   - `docker compose ps`
   - `docker compose logs --no-color --tail=200 app`
2. Browser console errors (if realtime audio/transcript isn’t working)
3. Their OS + browser version

---

## Security note

- Do **not** commit `.env` files containing secrets.
- Anyone running this needs their own `OPENAI_API_KEY`.
