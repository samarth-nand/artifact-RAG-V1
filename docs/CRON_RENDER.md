# Render Cron Setup (Learning System)

## Goal
Automate exemplar promotion and verification on Render.

## Tasks to Schedule
1) **Nightly auto-promotion** (promote strong recent grades):
   - Command: `PROMOTE_WINDOW_HOURS=72 PROMOTE_OVERALL_MIN=85 PROMOTE_DIMENSION_MIN=80 PROMOTE_PER_CATEGORY=5 npx tsx scripts/auto-promote-exemplars.ts`
   - Frequency: daily (e.g., 2:00 AM UTC)
2) **Optional: Daily unverified listing** (for alerts/logs):
   - Command: `npx tsx scripts/verify-exemplar.ts`
   - Frequency: daily (e.g., 2:10 AM UTC)

## Render Cron Job Setup
1. In Render dashboard: **Cron Jobs → New Cron Job**.
2. Set **Environment** to the same as your API service (so env vars match: `DATABASE_URL`, `OPENAI_API_KEY`, etc.).
3. Set **Command** to the desired task (see above).
4. Set **Schedule** using cron syntax (e.g., `0 2 * * *` for daily 02:00 UTC).
5. Save. Render will run the command in a fresh container with your repo at HEAD.

## Environment Variables Required
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_EMBED_MODEL` (defaults to `text-embedding-3-small`)
- Optional: tune promotion thresholds via env vars shown above.

## Safety Tips
- Start with stricter thresholds (e.g., overall ≥90) to avoid noisy exemplars.
- Keep per-category cap (`PROMOTE_PER_CATEGORY`) low (e.g., 3–5) at first.
- Review via `npx tsx scripts/verify-exemplar.ts` and verify IDs you trust.
- Only verified exemplars are used in grading.

## Verification Loop (Manual or Another Cron)
- List unverified: `npx tsx scripts/verify-exemplar.ts`
- Verify one: `npx tsx scripts/verify-exemplar.ts <exemplar_id>`
- You can cron the listing and send output to logs/alerts for review.

## Rollback
If a promotion run added bad exemplars:
- Remove by ID: `DELETE FROM exemplar_transcripts WHERE id = '<id>';`
- Or clear recent auto-promoted rows: `DELETE FROM exemplar_transcripts WHERE source = 'auto_promoted' AND created_at > now() - interval '1 day';`
