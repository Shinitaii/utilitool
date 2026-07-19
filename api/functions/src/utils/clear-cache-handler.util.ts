import type {Response} from "express";
import type {AuthenticatedRequest} from "./auth.util";
import {cacheDelPattern} from "./cache.util";

/**
 * Every feature's `POST /cache/clear` handler was byte-identical except for the
 * cache-key prefix and the human-readable label in the response message —
 * this factory is the single copy.
 */
export function makeClearCacheHandler(cacheKeyPrefix: string, label: string) {
  return async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
    const deletedCount = await cacheDelPattern(`utilitool:${cacheKeyPrefix}:*`);
    res.status(200).json({message: `Cleared ${deletedCount} cache entries for ${label}`});
  };
}
