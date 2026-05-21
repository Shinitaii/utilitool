import rateLimit from "express-rate-limit";
import {RedisStore} from "rate-limit-redis";
import {getRedisClient} from "./redis.config";

const TOO_MANY_REQUESTS_MESSAGE = "Too many requests, please try again later.";

function buildStore(prefix: string) {
  const redis = getRedisClient();
  if (!redis) return undefined;
  return new RedisStore({
    // rate-limit-redis calls sendCommand with individual string args
    sendCommand: (...args: string[]) => redis.call(args[0], ...args.slice(1)) as Promise<number>,
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
