import Redis from "ioredis";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";

export interface StoredSecret {
  secret: string;
  userId: string;
  expiresAt: number; // Unix timestamp
  nonce?: string;
}

let redisClient: Redis | null = null;

/**
 * Get or initialize Redis client.
 * Falls back to in-memory Map if REDIS_URL not configured (dev only).
 */
function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const env = getEnv();
  if (!env.REDIS_URL) {
    logger.warn("REDIS_URL not configured; using in-memory fallback (NOT FOR PRODUCTION)");
    return null;
  }

  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  redisClient.on("error", (err) => {
    logger.error("Redis connection error", err);
  });

  redisClient.on("connect", () => {
    logger.info("Redis connected");
  });

  return redisClient;
}

// In-memory fallback for dev (NOT production-safe across instances)
const inMemoryStore = new Map<string, StoredSecret>();

/**
 * Store ephemeral secret with TTL.
 * Key: rt:session:<sessionId>
 */
export async function storeSecret(
  sessionId: string,
  secret: string,
  userId: string,
  ttlSeconds: number,
  nonce?: string
): Promise<void> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload: StoredSecret = { secret, userId, expiresAt, nonce };

  const redis = getRedisClient();
  if (redis) {
    const key = `rt:session:${sessionId}`;
    await redis.setex(key, ttlSeconds, JSON.stringify(payload));
    logger.info("Stored realtime secret in Redis", { sessionId, userId, ttlSeconds });
  } else {
    // Fallback: in-memory with manual TTL cleanup
    inMemoryStore.set(sessionId, payload);
    setTimeout(() => inMemoryStore.delete(sessionId), ttlSeconds * 1000);
    logger.warn("Stored realtime secret in-memory (dev fallback)", { sessionId, userId, ttlSeconds });
  }
}

/**
 * Atomically consume secret (read-and-delete).
 * Returns null if missing/expired.
 */
export async function consumeSecret(sessionId: string): Promise<StoredSecret | null> {
  const redis = getRedisClient();

  if (redis) {
    const key = `rt:session:${sessionId}`;
    // Atomic GETDEL (Redis 6.2+)
    const raw = await redis.getdel(key);
    if (!raw) {
      logger.warn("Secret not found or already consumed", { sessionId });
      return null;
    }

    const parsed = JSON.parse(raw) as StoredSecret;
    
    // Check if expired (Redis TTL should prevent this, but double-check)
    if (parsed.expiresAt < Date.now()) {
      logger.warn("Secret expired", { sessionId, expiresAt: parsed.expiresAt });
      return null;
    }

    logger.info("Secret consumed from Redis", { sessionId, userId: parsed.userId });
    return parsed;
  } else {
    // Fallback: in-memory
    const stored = inMemoryStore.get(sessionId);
    if (!stored) {
      logger.warn("Secret not found in-memory", { sessionId });
      return null;
    }

    if (stored.expiresAt < Date.now()) {
      inMemoryStore.delete(sessionId);
      logger.warn("Secret expired in-memory", { sessionId });
      return null;
    }

    inMemoryStore.delete(sessionId);
    logger.info("Secret consumed from in-memory store", { sessionId, userId: stored.userId });
    return stored;
  }
}

/**
 * Check if secret exists (without consuming).
 * Used for debugging/health checks only.
 */
export async function secretExists(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    const key = `rt:session:${sessionId}`;
    const exists = await redis.exists(key);
    return exists === 1;
  } else {
    return inMemoryStore.has(sessionId);
  }
}

/**
 * Cleanup on shutdown.
 */
export async function closeSecretStore(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info("Redis connection closed");
  }
  inMemoryStore.clear();
}
