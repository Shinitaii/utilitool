// NOTE: MemoryStore is per-instance and not shared across Firebase Function
// instances (maxInstances: 2). For a shared limit, replace with a Redis-backed
// store once Redis is provisioned. See redis.config.ts.
import rateLimit from "express-rate-limit";

const TOO_MANY_REQUESTS_MESSAGE = "Too many requests, please try again later.";

/**
 * Stricter limiter for authentication routes (/auth).
 * Prevents brute-force login and registration abuse.
 * Allows 20 requests per 15-minute window per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {error: TOO_MANY_REQUESTS_MESSAGE},
});

/**
 * General limiter for all other API routes.
 * Allows 100 requests per 15-minute window per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {error: TOO_MANY_REQUESTS_MESSAGE},
});
