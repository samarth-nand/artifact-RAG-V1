#!/usr/bin/env tsx
/**
 * Verify or list exemplar candidates.
 *
 * Usage:
 *   # List unverified exemplars (top 20 newest)
 *   npx tsx scripts/verify-exemplar.ts
 *
 *   # Verify a specific exemplar by id
 *   npx tsx scripts/verify-exemplar.ts <exemplar_id>
 */

import { sql } from "drizzle-orm";
import { initializeDb, getDb } from "../src/db/index.js";
import { logger } from "../src/shared/logger.js";

async function listUnverified(db: ReturnType<typeof getDb>) {
  const rows: any[] = await db.execute(sql`
    SELECT id, question_id, question_text, category, overall_score, created_at
    FROM exemplar_transcripts
    WHERE is_verified = false
    ORDER BY created_at DESC
    LIMIT 20
  `);

  if (!rows.length) {
    console.log("No unverified exemplars found.");
    return;
  }

  console.log("Unverified exemplars (latest 20):\n");
  rows.forEach((row) => {
    console.log(`- id: ${row.id}`);
    console.log(`  question: ${row.question_text || row.question_id}`);
    console.log(`  category: ${row.category} | score: ${row.overall_score}`);
    console.log(`  created_at: ${row.created_at}`);
    console.log("");
  });
}

async function verifyById(db: ReturnType<typeof getDb>, id: string) {
  const updated: any[] = await db.execute(sql`
    UPDATE exemplar_transcripts
    SET is_verified = true, source = COALESCE(source, 'auto_promoted')
    WHERE id = ${id}
    RETURNING id, question_id, category, overall_score
  `);

  if (!updated.length) {
    console.log(`No exemplar found with id ${id}`);
    return;
  }

  const row = updated[0];
  console.log("Verified exemplar:");
  console.log(`- id: ${row.id}`);
  console.log(`  question_id: ${row.question_id}`);
  console.log(`  category: ${row.category} | score: ${row.overall_score}`);
}

async function main() {
  await initializeDb();
  const db = getDb();
  const id = process.argv[2];

  if (!id) {
    await listUnverified(db);
    return;
  }

  await verifyById(db, id);
}

main().catch((err) => {
  logger.error("verify-exemplar failed", err);
  process.exit(1);
});
