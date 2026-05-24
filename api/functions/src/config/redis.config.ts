import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import {logger} from '../utils/logger.util';

let redisClient: RedisClientType | null = null;

export function getRedisClient(): RedisClientType | null {
  if (redisClient) return redisClient;

  const redisHost = process.env.REDIS_HOST;
  const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
  const redisUsername = process.env.REDIS_USERNAME;
  const redisPassword = process.env.REDIS_PASSWORD;

  if (!redisHost) {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('Redis not configured (REDIS_HOST not set). Caching and rate limiting will use in-memory store.');
    }
    return null;
  }

  try {
    redisClient = createClient({
      username: redisUsername || 'default',
      password: redisPassword,
      socket: {
        host: redisHost,
        port: redisPort,
        tls: process.env.REDIS_TLS === 'true',
      },
    });

    redisClient.on('error', (err: Error) => {
      logger.error({err}, 'Redis connection error');
    });

    // Connect immediately so rate-limit and caching can use it synchronously
    redisClient.connect().catch((err: Error) => {
      logger.warn({err}, 'Failed to connect Redis client; falling back to in-memory caching/rate-limiting');
      redisClient = null;
    });

    return redisClient;
  } catch (err) {
    logger.error({err}, 'Failed to initialize Redis client');
    return null;
  }
}
