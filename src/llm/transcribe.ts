import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import OpenAI from "openai";

export async function transcribeAudio(
  audioBuffer: Buffer
): Promise<string> {
  try {
    const env = getEnv();
    const client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    // Create a file-like object for the OpenAI API
    const audioBlob = new Blob([audioBuffer], { type: "audio/webm" });
    const file = new File([audioBlob], "audio.webm", {
      type: "audio/webm",
    });

    const response = await client.audio.transcriptions.create({
      file,
      model: env.OPENAI_TRANSCRIBE_MODEL,
      language: "en",
    });

    if (!response.text) {
      throw new Error("No transcription returned");
    }

    logger.info("Audio transcribed successfully");
    return response.text;
  } catch (error) {
    logger.error("Failed to transcribe audio", error);
    throw error;
  }
}
