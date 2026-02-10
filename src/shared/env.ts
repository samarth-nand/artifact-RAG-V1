import { z } from "zod";
import * as dotenv from "dotenv";

// Load .env for local development (safe no-op in prod where vars are already set)
dotenv.config({ override: false });

const envSchema = z.object({
  DATABASE_URL: z.string().url("Invalid DATABASE_URL"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-transcribe"),
  OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-large"),
  OPENAI_GRADE_MODEL: z.string().default("gpt-5.2"),
  OPENAI_CHAT_MODEL: z.string().default("gpt-5.2"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts-2025-12-15"),
  // Only required for the legacy audio-upload flow. For realtime interview + local/dev,
  // defaulting this avoids blocking non-AWS deployments.
  AUDIO_BUCKET_NAME: z.string().default("local-audio"),
  AWS_REGION: z.string().default("us-east-1"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  // Comma-separated list of allowed origins for CORS (e.g., https://yourapp.vercel.app,http://localhost:3000)
  CORS_ORIGINS: z.string().default("*"),
  // Set to "false" to disable serving static frontend files (API-only mode)
  SERVE_FRONTEND: z.string().default("true"),
  // Redis connection URL for ephemeral session secrets (Upstash/Redis Cloud)
  REDIS_URL: z.string().url("Invalid REDIS_URL").optional(),
  // Session secret TTL in seconds (default 90s)
  REALTIME_SECRET_TTL_SECONDS: z.string().default("90"),
  // RSA public key for encrypting client secrets (PEM format)
  RSA_PUBLIC_KEY: z.string().optional(),
  // Turso (SQLite) database for recruiter roles/assessments
  TURSO_DATABASE_URL: z.string().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
});

export type Environment = z.infer<typeof envSchema>;

let env: Environment | null = null;

export function getEnv(): Environment {
  if (!env) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error("Invalid environment variables:", parsed.error.flatten());
      throw new Error("Environment validation failed");
    }
    env = parsed.data;
  }
  return env;
}

export function resetEnv(): void {
  env = null;
}
