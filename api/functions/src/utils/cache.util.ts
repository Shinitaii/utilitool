import {getRedisClient} from "../config/redis.config";
import {logger} from "./logger.util";
import {markCacheHit} from "../middlewares/request-context.middleware";

async function ensureConnected() {
  const client = getRedisClient();
  if (!client) return;

  try {
    if (!client.isReady) {
      await client.connect();
    }
  } catch (err) {
    logger.warn({err}, "Failed to connect Redis client");
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    await ensureConnected();
    const value = await client.get(key);
    if (!value) return null;
    markCacheHit();
    return JSON.parse(value) as T;
  } catch (err) {
    logger.warn({err, key}, "Cache get failed");
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await ensureConnected();
    const json = JSON.stringify(value);
    await client.setEx(key, ttlSeconds, json);
  } catch (err) {
    logger.warn({err, key}, "Cache set failed");
  }
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await ensureConnected();
    await client.del(key);
  } catch (err) {
    logger.warn({err, key}, "Cache del failed");
  }
}

export async function cacheDelPattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  if (!client) return 0;

  try {
    await ensureConnected();
    let cursor = 0;
    let deletedCount = 0;

    do {
      const result = await client.scan(cursor, {MATCH: pattern, COUNT: 100});
      cursor = result.cursor as number;
      const keys = result.keys as string[];

      if (keys.length > 0) {
        deletedCount += await client.del(keys);
      }
    } while (cursor !== 0);

    return deletedCount;
  } catch (err) {
    logger.warn({err, pattern}, "Cache pattern delete failed");
    return 0;
  }
}
