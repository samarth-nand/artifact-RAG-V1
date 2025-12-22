import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";

const openai = require("openai");

export async function computeEmbedding(text: string): Promise<number[]> {
  try {
    const env = getEnv();
    const client = new openai.OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    const response = await client.embeddings.create({
      input: text,
      model: env.OPENAI_EMBED_MODEL,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error("No embedding returned from OpenAI");
    }

    return response.data[0].embedding;
  } catch (error) {
    logger.error("Failed to compute embedding", error);
    throw error;
  }
}

export async function computeEmbeddings(
  texts: string[]
): Promise<number[][]> {
  try {
    const env = getEnv();
    const client = new openai.OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    const response = await client.embeddings.create({
      input: texts,
      model: env.OPENAI_EMBED_MODEL,
    });

    if (!response.data || response.data.length === 0) {
      throw new Error("No embeddings returned from OpenAI");
    }

    // Sort by index to maintain order
    const sorted = response.data.sort((a: { index: number; }, b: { index: number; }) => a.index - b.index);
    return sorted.map((item: { embedding: any; }) => item.embedding);
  } catch (error) {
    logger.error("Failed to compute embeddings", error);
    throw error;
  }
}
