import { randomUUID } from "crypto";
import OpenAI from "openai";
import { getEnv } from "../shared/env";
import { putObject, getSignedGetUrl } from "../util/s3";
import { logger } from "../shared/logger";
import { DEFAULT_VOICE, VOICES } from "./voices";

export interface SpeakRequest {
  text: string;
  voice?: string;
  format?: "mp3" | "wav";
  sessionId?: string;
  type?: string;
}

export interface SpeakResponse {
  s3Key: string;
  url: string;
}

export async function speakToS3(req: SpeakRequest): Promise<SpeakResponse> {
  const env = getEnv();
  const format = req.format ?? "mp3";
  const requestedVoice = req.voice || DEFAULT_VOICE;
  const voice = VOICES.includes(requestedVoice) ? requestedVoice : DEFAULT_VOICE;
  const key = `tts/sessions/${req.sessionId ?? "none"}/${req.type ?? "tts"}-${randomUUID()}.${format}`;

  // Generate speech with OpenAI TTS and store in S3
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const speech = await openai.audio.speech.create({
    model: env.OPENAI_TTS_MODEL,
    voice,
    input: req.text,
    response_format: format,
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());
  const contentType = format === "wav" ? "audio/wav" : "audio/mpeg";

  logger.info("Saving TTS audio", { key, bytes: audioBuffer.byteLength, voice, model: env.OPENAI_TTS_MODEL });
  await putObject({ key, body: audioBuffer, contentType });
  const url = await getSignedGetUrl(key);
  return { s3Key: key, url };
}
