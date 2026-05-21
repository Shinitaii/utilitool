import Redis from 'ioredis';
import {logger} from '../utils/logger.util';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('REDIS_URL is not set. Rate limiting will use in-memory store (not shared across instances).');
    }
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      logger.error({err}, 'Redis connection error');
    });

    return redisClient;
  } catch (err) {
    logger.error({err}, 'Failed to initialize Redis client');
    return null;
  }
}
