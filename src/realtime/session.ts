import OpenAI from "openai";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";

export interface RealtimeSessionConfig {
  sessionId: string;
  clientSecret: {
    value: string;
    expires_at: string;
  };
  instructions: string;
}

/**
 * Creates an ephemeral realtime session with OpenAI.
 * 
 * This establishes a new realtime conversation endpoint that the client
 * will connect to via WebRTC.
 */
export async function createRealtimeSession(
  systemInstructions: string
): Promise<RealtimeSessionConfig> {
  const env = getEnv();
  
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  logger.info("Creating ephemeral realtime session");

  try {
    // realtime API is in beta - use any casting for now
    // @ts-ignore
    const response = await client.beta.realtime.sessions.create({
      // SDK types lag behind newer realtime model names; pass through as string.
      model: "gpt-realtime-2025-08-28" as any,
      modalities: ["text", "audio"],
      instructions: systemInstructions,
      voice: "marin",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      // Enable transcription of the user's microphone input so we can show
      // what the candidate said in the live transcript and in results.
      input_audio_transcription: {
        model: "gpt-4o-transcribe",
      },
      // Session will auto-expire; client handles reconnection if needed
    });

    // The response includes a client secret for WebRTC connection
    const sessionId = String((response as any).id || "");
    const clientSecretData = (response as any).client_secret || {};

    logger.info("Realtime session created", { sessionId });

    return {
      sessionId,
      clientSecret: {
        value: String(clientSecretData.value || ""),
        expires_at: String(clientSecretData.expires_at || ""),
      },
      instructions: systemInstructions,
    };
  } catch (error) {
    logger.error("Failed to create realtime session", error);
    throw error;
  }
}
