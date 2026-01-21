import { getDb } from "../db";
import { kbChunks, kbDocuments } from "../db/schema";
import { sql, eq } from "drizzle-orm";
import { logger } from "../shared/logger";
import { computeEmbedding } from "./embed";

export interface RetrievedChunk {
  id: string;
  content: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  chunkIndex: number;
  section?: string | null;
  distance: number;
}

const TOP_K = 30;
const FINAL_COUNT = 12;
const MAX_CANDIDATES = 2000;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.NEGATIVE_INFINITY;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!Number.isFinite(denom) || denom === 0) return Number.NEGATIVE_INFINITY;
  return dot / denom;
}

function coerceEmbedding(value: unknown): number[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const arr = value.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    return arr.length > 0 ? arr : null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const arr = parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v));
        return arr.length > 0 ? arr : null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Simple MMR-like diversity filter using overlap.
 * Greedily selects chunks that are not too similar in page range.
 */
function diversifyChunks(
  chunks: Array<{ id: string; distance: number; pageStart: number; pageEnd: number }>,
  targetCount: number
): string[] {
  const selected: string[] = [];
  const usedPageRanges: Array<{ start: number; end: number }> = [];

  for (const chunk of chunks) {
    if (selected.length >= targetCount) break;

    // Check if this chunk's page range overlaps too much with selected ones
    const overlapsExcessively = usedPageRanges.some((range) => {
      const overlapStart = Math.max(chunk.pageStart, range.start);
      const overlapEnd = Math.min(chunk.pageEnd, range.end);
      const overlapPages = Math.max(0, overlapEnd - overlapStart + 1);
      const chunkPages = chunk.pageEnd - chunk.pageStart + 1;
      return overlapPages / chunkPages > 0.8; // More than 80% overlap is excessive
    });

    if (!overlapsExcessively) {
      selected.push(chunk.id);
      usedPageRanges.push({
        start: chunk.pageStart,
        end: chunk.pageEnd,
      });
    }
  }

  return selected;
}

export async function retrieveChunks(
  query: string,
  limit: number = FINAL_COUNT
): Promise<RetrievedChunk[]> {
  try {
    const db = getDb();
    const queryEmbedding = await computeEmbedding(query);

    // Local mode: embedding is stored as JSON in a text column (no pgvector).
    // Fetch a reasonable candidate set and compute cosine similarity in JS.
    const candidates: any[] = await db.execute(
      sql`
        SELECT 
          kc.id,
          kc.content,
          kc.page_start,
          kc.page_end,
          kc.chunk_index,
          kc.section,
          kc.embedding,
          kd.title
        FROM kb_chunks kc
        JOIN kb_documents kd ON kc.document_id = kd.id
        WHERE kc.embedding IS NOT NULL
        LIMIT ${MAX_CANDIDATES}
      `
    );

    const scored = candidates
      .map((c) => {
        const emb = coerceEmbedding(c.embedding);
        if (!emb) return null;
        return {
          ...c,
          distance: cosineSimilarity(queryEmbedding, emb),
        };
      })
      .filter((c): c is any => c !== null && Number.isFinite(c.distance))
      .sort((a, b) => b.distance - a.distance)
      .slice(0, TOP_K);

    let results: any[] = scored;

    // Fallback: if embeddings aren't available/parsable yet, do a simple keyword search.
    if (results.length === 0) {
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^a-z0-9]/g, ""))
        .filter((w) => w.length >= 4)
        .slice(0, 6);

      const likeClauses = keywords.map((k) => sql`kc.content ILIKE ${"%" + k + "%"}`);
      const whereSql = likeClauses.length
        ? sql.join(likeClauses, sql` OR `)
        : sql`TRUE`;

      results = await db.execute(
        sql`
          SELECT 
            kc.id,
            kc.content,
            kc.page_start,
            kc.page_end,
            kc.chunk_index,
            kc.section,
            kd.title,
            0 as distance
          FROM kb_chunks kc
          JOIN kb_documents kd ON kc.document_id = kd.id
          WHERE ${whereSql}
          LIMIT ${TOP_K}
        `
      );
    }

    logger.debug(`Retrieved ${results.length} raw chunks from KB`);

    // Apply diversity filter
    const selectedIds = diversifyChunks(
      results.map((r) => ({
        id: r.id,
        distance: r.distance,
        pageStart: r.page_start,
        pageEnd: r.page_end,
      })),
      limit
    );

    logger.debug(`Selected ${selectedIds.length} diverse chunks after MMR`);

    // Build final result maintaining order by distance
    const finalResults: RetrievedChunk[] = selectedIds
      .map((id) =>
        results.find(
          (r) => r.id === id
        )
      )
      .filter((r): r is typeof results[0] => r !== undefined)
      .map((r) => ({
        id: r.id,
        content: r.content,
        title: r.title,
        pageStart: r.page_start,
        pageEnd: r.page_end,
        chunkIndex: r.chunk_index,
        section: r.section,
        distance: r.distance,
      }));

    return finalResults;
  } catch (error) {
    logger.error("Failed to retrieve chunks", error);
    throw error;
  }
}

export async function getChunkById(chunkId: string) {
  try {
    const db = getDb();
    const result = await db
      .select()
      .from(kbChunks)
      .where(eq(kbChunks.id, chunkId as any))
      .innerJoin(
        kbDocuments,
        eq(kbChunks.documentId, kbDocuments.id)
      )
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const { kb_chunks: chunk, kb_documents: doc } = result[0];
    return {
      id: chunk.id,
      content: chunk.content,
      title: doc.title,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      chunkIndex: chunk.chunkIndex,
      section: chunk.section,
    };
  } catch (error) {
    logger.error("Failed to get chunk by ID", error);
    throw error;
  }
}
