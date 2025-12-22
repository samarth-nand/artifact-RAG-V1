import { logger } from "../shared/logger";

const tokenizer = require("js-tiktoken");

const enc = tokenizer.encoding_for_model("gpt-4o");

// Target chunk size in tokens
const TARGET_CHUNK_TOKENS = 700;
const MIN_CHUNK_TOKENS = 500;
const MAX_CHUNK_TOKENS = 900;
const OVERLAP_TOKENS = 100;

export interface ChunkMetadata {
  pageStart: number;
  pageEnd: number;
  section?: string;
}

export interface ChunkedText {
  content: string;
  tokens: number;
  metadata: ChunkMetadata;
  chunkIndex: number;
}

export function countTokens(text: string): number {
  try {
    const tokens = enc.encode(text);
    return tokens.length;
  } catch (error) {
    logger.warn("Token counting failed, estimating", error);
    // Rough estimate: ~1 token per 4 characters
    return Math.ceil(text.length / 4);
  }
}

export function chunkText(
  text: string,
  pageStart: number,
  pageEnd: number,
  section?: string
): ChunkedText[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);

  const chunks: ChunkedText[] = [];
  let currentChunk = "";
  let currentTokens = 0;
  let chunkIndex = 0;
  let overlapBuffer = "";
  let overlapTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence);

    // Add overlap from previous chunk if available
    if (overlapBuffer && currentChunk === "") {
      currentChunk = overlapBuffer;
      currentTokens = overlapTokens;
    }

    if (currentTokens + sentenceTokens > MAX_CHUNK_TOKENS) {
      // Finalize current chunk if it meets minimum
      if (currentTokens >= MIN_CHUNK_TOKENS) {
        chunks.push({
          content: currentChunk.trim(),
          tokens: currentTokens,
          metadata: { pageStart, pageEnd, section },
          chunkIndex,
        });
        chunkIndex++;

        // Start next chunk with overlap
        const overlapChars = Math.ceil(
          (currentChunk.length * OVERLAP_TOKENS) / currentTokens
        );
        overlapBuffer = currentChunk.slice(-overlapChars);
        overlapTokens = countTokens(overlapBuffer);
        currentChunk = "";
        currentTokens = 0;
      }
    }

    currentChunk += (currentChunk ? " " : "") + sentence;
    currentTokens += sentenceTokens;
  }

  // Add final chunk
  if (currentChunk.trim() && currentTokens >= MIN_CHUNK_TOKENS) {
    chunks.push({
      content: currentChunk.trim(),
      tokens: currentTokens,
      metadata: { pageStart, pageEnd, section },
      chunkIndex,
    });
  }

  logger.debug(`Chunked text into ${chunks.length} chunks`, {
    pageStart,
    pageEnd,
  });
  return chunks;
}

export function cleanText(text: string): string {
  // Remove extra whitespace
  text = text.replace(/\s+/g, " ");
  // Remove common header/footer patterns
  text = text.replace(/^(Page \d+|Chapter \d+).*?(?=\n|$)/gim, "");
  return text.trim();
}
