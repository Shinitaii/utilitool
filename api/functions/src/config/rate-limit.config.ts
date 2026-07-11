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
