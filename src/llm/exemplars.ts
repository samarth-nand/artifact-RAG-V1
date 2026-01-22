import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";
import { logger } from "../shared/logger.js";
import { computeEmbedding } from "../kb/embed.js";

export interface ExemplarGrade {
  questionId: string;
  questionText: string;
  category: string;
  transcript: string;
  overallScore: number;
  dimensionScores: Record<string, number>;
  keyStrengths: string[];
  keyImprovements: string[];
}

/**
 * Retrieve relevant high-scoring exemplars for a given question
 * Uses category matching + score filtering
 */
export async function getRelevantExemplars(
  questionId: string,
  category: string,
  limit: number = 2,
  transcriptForSimilarity?: string
): Promise<ExemplarGrade[]> {
  try {
    const db = getDb();

    // Get a candidate pool (score-ordered); we'll re-rank by similarity if available
    const exemplarRows: any[] = await db.execute(
      sql`SELECT 
        question_id, 
        question_text, 
        category, 
        transcript, 
        overall_score, 
        dimension_scores,
        key_strengths,
        key_improvements,
        transcript_embedding
      FROM exemplar_transcripts 
      WHERE category = ${category}
        AND is_verified = true 
        AND overall_score >= 80
      ORDER BY overall_score DESC
      LIMIT 20`
    );

    let queryEmbedding: number[] | null = null;
    if (transcriptForSimilarity && transcriptForSimilarity.trim().length > 0) {
      try {
        queryEmbedding = await computeEmbedding(transcriptForSimilarity);
      } catch (embedErr) {
        logger.warn("Failed to compute query embedding; falling back to score-only", embedErr);
      }
    }

    const parsed = (exemplarRows || []).map((row: any) => {
      const embedding = parseEmbedding(row.transcript_embedding);
      return {
        questionId: row.question_id,
        questionText: row.question_text,
        category: row.category,
        transcript: row.transcript,
        overallScore: row.overall_score,
        dimensionScores: typeof row.dimension_scores === "string" 
          ? JSON.parse(row.dimension_scores)
          : row.dimension_scores,
        keyStrengths: typeof row.key_strengths === "string"
          ? JSON.parse(row.key_strengths)
          : row.key_strengths || [],
        keyImprovements: typeof row.key_improvements === "string"
          ? JSON.parse(row.key_improvements)
          : row.key_improvements || [],
        embedding,
      };
    });

    // If we have embeddings, re-rank by similarity + score; otherwise keep score order
    const ranked = queryEmbedding
      ? parsed
          .map((ex) => ({
            ...ex,
            similarity: ex.embedding ? cosineSimilarity(queryEmbedding!, ex.embedding) : 0,
          }))
          .sort((a, b) => {
            // Weighted: 70% similarity, 30% normalized score
            const aScore = 0.7 * a.similarity + 0.3 * (a.overallScore / 100);
            const bScore = 0.7 * b.similarity + 0.3 * (b.overallScore / 100);
            return bScore - aScore;
          })
      : parsed;

    return ranked.slice(0, limit).map((item: any) => {
      const { embedding: _e, similarity: _s, ...rest } = item;
      return rest;
    });
  } catch (error) {
    logger.warn("Failed to retrieve exemplars", error);
    return [];
  }
}

function parseEmbedding(value: unknown): number[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as number[]) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Format exemplars into a prompt section
 */
export function formatExemplarsForPrompt(exemplars: ExemplarGrade[]): string {
  if (exemplars.length === 0) {
    return "";
  }

  let section = "\n\nHIGH-SCORING EXEMPLAR ANSWERS:\nLearn from these verified high-scoring responses:\n\n";

  exemplars.forEach((exemplar, index) => {
    section += `EXEMPLAR ${index + 1} (Score: ${exemplar.overallScore}/100):
Question: ${exemplar.questionText}

Answer:
${exemplar.transcript}

Why this scored well:
Strengths:
${exemplar.keyStrengths.map(s => `- ${s}`).join('\n')}

Dimension Scores:
${Object.entries(exemplar.dimensionScores)
  .map(([dim, score]) => `- ${dim}: ${score}/100`)
  .join('\n')}

---\n\n`;
  });

  return section;
}

/**
 * Log grading result to history for calibration
 */
export async function recordGradingHistory(
  sessionId: string | null,
  questionId: string,
  transcript: string,
  overallScore: number,
  dimensionScores: any,
  feedback: any
) {
  try {
    const db = getDb();
    const { randomUUID } = await import("crypto");

    // Extract numeric scores only
    const numericScores: Record<string, number> = {};
    if (typeof dimensionScores === "object" && dimensionScores !== null) {
      for (const [key, value] of Object.entries(dimensionScores)) {
        if (typeof value === "number") {
          numericScores[key] = value;
        } else if (typeof value === "object" && value !== null && "score" in value) {
          numericScores[key] = (value as any).score;
        }
      }
    }

    await db.execute(
      sql`INSERT INTO grading_history 
      (id, session_id, question_id, transcript, overall_score, dimension_scores, feedback, graded_at)
      VALUES (${randomUUID()}, ${sessionId}, ${questionId}, ${transcript}, ${overallScore}, ${JSON.stringify(numericScores)}, ${JSON.stringify(feedback)}, NOW())`
    );

    logger.debug("Recorded grading history", { sessionId, questionId, overallScore });
  } catch (error) {
    logger.warn("Failed to record grading history", error);
    // Don't fail the whole grading process for this
  }
}

/**
 * Get grading statistics for calibration
 */
export async function getGradingStats(
  questionId: string,
  windowDays: number = 7
): Promise<{
  averageScore: number;
  scoreDistribution: Record<string, number>;
  sampleSize: number;
}> {
  try {
    const db = getDb();

    const stats: any[] = await db.execute(
      sql`SELECT 
        overall_score,
        COUNT(*) as count
      FROM grading_history 
      WHERE question_id = ${questionId}
        AND graded_at > NOW() - INTERVAL '${windowDays} days'
      GROUP BY overall_score
      ORDER BY overall_score`
    );

    const totalCount = stats.reduce((sum: number, row: any) => sum + row.count, 0);
    
    if (totalCount === 0) {
      return {
        averageScore: 0,
        scoreDistribution: {},
        sampleSize: 0,
      };
    }

    const averageScore = 
      stats.reduce((sum: number, row: any) => sum + row.overall_score * row.count, 0) / totalCount;

    const distribution: Record<string, number> = {};
    stats.forEach((row: any) => {
      distribution[row.overall_score] = row.count;
    });

    return {
      averageScore,
      scoreDistribution: distribution,
      sampleSize: totalCount,
    };
  } catch (error) {
    logger.warn("Failed to get grading stats", error);
    return {
      averageScore: 0,
      scoreDistribution: {},
      sampleSize: 0,
    };
  }
}
