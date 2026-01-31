#!/usr/bin/env tsx
/**
 * Auto-promote high-quality graded answers into exemplar_transcripts.
 * Criteria (defaults):
 * - graded in the last 72h
 * - overall_score >= 85
 * - all dimension scores >= 80 (numeric)
 * - max 5 promotions per category per run
 *
 * Usage:
 *   PROMOTE_WINDOW_HOURS=72 PROMOTE_OVERALL_MIN=85 PROMOTE_DIMENSION_MIN=80 PROMOTE_PER_CATEGORY=5 npx tsx scripts/auto-promote-exemplars.ts
 */

import { sql } from "drizzle-orm";
import { initializeDb, getDb } from "../src/db/index.js";
import { logger } from "../src/shared/logger.js";
import { computeEmbedding } from "../src/kb/embed.js";
import { randomUUID } from "crypto";

const WINDOW_HOURS = Number(process.env.PROMOTE_WINDOW_HOURS || 72);
const OVERALL_MIN = Number(process.env.PROMOTE_OVERALL_MIN || 85);
const DIMENSION_MIN = Number(process.env.PROMOTE_DIMENSION_MIN || 80);
const PER_CATEGORY_LIMIT = Number(process.env.PROMOTE_PER_CATEGORY || 5);

interface CandidateRow {
  id: string;
  session_id: string | null;
  question_id: string;
  transcript: string;
  overall_score: number;
  dimension_scores: any;
  feedback: any;
  question_text?: string | null;
  graded_at: string;
}

function detectCategory(questionText: string | undefined | null, questionId: string): string {
  const text = (questionText || questionId || "").toLowerCase();
  if (text.includes("design") || text.includes("feature")) return "product_design";
  if (text.includes("estimate") || text.includes("how many") || text.includes("metric")) return "metrics";
  if (text.includes("tell me about") || text.includes("time you") || text.includes("disagree") || text.includes("fail")) return "behavioral";
  return "strategy";
}

function dimensionsPass(dim: any): boolean {
  try {
    const obj = typeof dim === "string" ? JSON.parse(dim) : dim;
    if (!obj || typeof obj !== "object") return false;
    return Object.values(obj).every((v: any) => {
      if (typeof v === "number") return v >= DIMENSION_MIN;
      if (v && typeof v === "object" && typeof v.score === "number") return v.score >= DIMENSION_MIN;
      return false;
    });
  } catch {
    return false;
  }
}

function parseFeedback(feedback: any): { strengths: string[]; improvements: string[] } {
  try {
    const data = typeof feedback === "string" ? JSON.parse(feedback) : feedback;
    return {
      strengths: Array.isArray(data?.strengths) ? data.strengths : [],
      improvements: Array.isArray(data?.improvements) ? data.improvements : [],
    };
  } catch {
    return { strengths: [], improvements: [] };
  }
}

async function alreadyExists(db: ReturnType<typeof getDb>, transcript: string): Promise<boolean> {
  const rows: any[] = await db.execute(
    sql`SELECT id FROM exemplar_transcripts WHERE transcript = ${transcript} LIMIT 1`
  );
  return rows.length > 0;
}

async function main() {
  await initializeDb();
  const db = getDb();

  logger.info("Auto-promote: scanning grading_history", {
    windowHours: WINDOW_HOURS,
    overallMin: OVERALL_MIN,
    dimensionMin: DIMENSION_MIN,
    perCategory: PER_CATEGORY_LIMIT,
  });

  const rows: CandidateRow[] = await db.execute(
    sql`SELECT gh.*, s.question_text
        FROM grading_history gh
        LEFT JOIN interview_sessions s ON s.id = gh.session_id
        WHERE gh.graded_at > NOW() - (${WINDOW_HOURS} || ' hours')::INTERVAL
          AND gh.overall_score >= ${OVERALL_MIN}
        ORDER BY gh.overall_score DESC
        LIMIT 200`
  );

  const promotedByCategory: Record<string, number> = {};
  let promoted = 0;

  for (const row of rows) {
    const category = detectCategory(row.question_text, row.question_id);
    const currentCount = promotedByCategory[category] || 0;
    if (currentCount >= PER_CATEGORY_LIMIT) continue;
    if (!dimensionsPass(row.dimension_scores)) continue;
    if (!row.transcript || row.transcript.trim().length < 50) continue; // skip trivial answers

    const exists = await alreadyExists(db, row.transcript);
    if (exists) continue;

    const feedback = parseFeedback(row.feedback);
    const questionText = row.question_text || row.question_id;

    let transcriptEmbedding: number[] | null = null;
    try {
      transcriptEmbedding = await computeEmbedding(row.transcript);
    } catch (error) {
      logger.warn("Embedding failed; inserting without embedding", { error });
    }

    await db.execute(sql`
      INSERT INTO exemplar_transcripts 
      (id, question_id, question_text, category, transcript, overall_score, dimension_scores, key_strengths, key_improvements, feedback, source, is_verified, transcript_embedding)
      VALUES (
        ${randomUUID()},
        ${row.question_id},
        ${questionText},
        ${category},
        ${row.transcript},
        ${row.overall_score},
        ${JSON.stringify(row.dimension_scores)},
        ${JSON.stringify(feedback.strengths)},
        ${JSON.stringify(feedback.improvements)},
        ${JSON.stringify(row.feedback)},
        'auto_promoted',
        false,
        ${transcriptEmbedding ? JSON.stringify(transcriptEmbedding) : null}
      )
    `);

    promotedByCategory[category] = currentCount + 1;
    promoted += 1;
    logger.info("Promoted exemplar", { category, questionId: row.question_id, score: row.overall_score });
  }

  logger.info("Auto-promote completed", { promoted, promotedByCategory });
}

main().catch((err) => {
  logger.error("Auto-promote failed", err);
  process.exit(1);
});
