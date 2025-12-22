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

    // Query using pgvector similarity (cosine distance)
    const results: any[] = await db.execute(
      sql`
        SELECT 
          kc.id,
          kc.content,
          kc.page_start,
          kc.page_end,
          kc.chunk_index,
          kc.section,
          kd.title,
          1 - (kc.embedding <=> ${sql.raw(`'[${queryEmbedding.join(",")}]'::vector`)}) as distance
        FROM kb_chunks kc
        JOIN kb_documents kd ON kc.document_id = kd.id
        ORDER BY kc.embedding <=> ${sql.raw(`'[${queryEmbedding.join(",")}]'::vector`)}
        LIMIT ${TOP_K}
      `
    );

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
