import { createClient, type Client } from "@libsql/client";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";

let tursoClient: Client | null = null;

export function getTursoClient(): Client {
  if (!tursoClient) {
    const env = getEnv();

    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
      throw new Error(
        "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required for recruiter features"
      );
    }

    tursoClient = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    });

    logger.info("Turso client initialized");
  }

  return tursoClient;
}
