import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle> | null = null;
let sqlClient: ReturnType<typeof postgres> | null = null;

export async function initializeDb() {
  try {
    if (db && sqlClient) {
      logger.debug("Database already initialized");
      return db;
    }

    const env = getEnv();
    
    // Create postgres client with connection pooling
    sqlClient = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    db = drizzle(sqlClient, { schema });
    
    // Test connection
    await sqlClient`SELECT 1`;
    
    logger.info("Database initialized successfully");
    return db;
  } catch (error) {
    logger.error("Failed to initialize database", error);
    throw error;
  }
}

export function getDb() {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initializeDb() first."
    );
  }
  return db;
}

export async function closeDb() {
  if (sqlClient) {
    await sqlClient.end();
    sqlClient = null;
    db = null;
    logger.info("Database connection closed");
  }
}

export { schema };
