import rateLimit, {ipKeyGenerator} from "express-rate-limit";
import {RedisStore} from "rate-limit-redis";
import {getRedisClient} from "./redis.config";
import {AuthenticatedRequest} from "../utils/auth.util";

const TOO_MANY_REQUESTS_MESSAGE = "Too many requests, please try again later.";

function buildStore(prefix: string) {
  const redis = getRedisClient();
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: async (...args: string[]) => {
      const result = await redis.sendCommand(args as Parameters<typeof redis.sendCommand>[0]);
      return result as number;
    },
    prefix,
  });
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {error: TOO_MANY_REQUESTS_MESSAGE},
  store: buildStore("rl:auth:"),
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 1000,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {error: TOO_MANY_REQUESTS_MESSAGE},
  store: buildStore("rl:api:"),
});

/**
 * The generic apiRateLimiter (1000/hr) isn't cost-aware: each /chatbot call can
 * run up to MAX_TOOL_CALL_ROUNDS LLM round-trips against the tenant's own
 * provider key, so it needs a much tighter, per-user (not per-IP) cap to bound
 * LLM spend and stop a single account from burning through a shared office IP's
 * whole request budget.
 */
export const chatbotRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {error: TOO_MANY_REQUESTS_MESSAGE},
  store: buildStore("rl:chatbot:"),
  keyGenerator: (req: AuthenticatedRequest) => req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
});

/**
 * Vision-OCR endpoints (/image-extraction/*, /readings/ocr, /billing-cycles/ocr,
 * /bills/ocr) are cost-bearing like the chatbot (each call hits the tenant's own
 * configured vision provider), but are also a normal, repeated part of the reading
 * and bill capture workflow rather than incidental chat — so the cap sits between
 * the tight chatbot limit (30/hr) and the generic per-IP limit (1000/hr), and is
 * keyed per-user (not per-IP) for the same shared-office-IP reason as chatbotRateLimiter.
 */
export const ocrRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 150,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {error: TOO_MANY_REQUESTS_MESSAGE},
  store: buildStore("rl:ocr:"),
  keyGenerator: (req: AuthenticatedRequest) => req.user?.userId ?? ipKeyGenerator(req.ip ?? ""),
});
