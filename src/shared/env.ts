import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url("Invalid DATABASE_URL"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("whisper-1"),
  OPENAI_EMBED_MODEL: z.string().default("text-embedding-3-small"),
  OPENAI_GRADE_MODEL: z.string().default("gpt-4o-mini"),
  AUDIO_BUCKET_NAME: z.string().min(1, "AUDIO_BUCKET_NAME is required"),
  AWS_REGION: z.string().default("us-east-1"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "production"]).default("development"),
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
