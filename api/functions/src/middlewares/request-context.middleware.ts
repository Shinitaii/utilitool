import { Request, Response, NextFunction } from "express";
import { AsyncLocalStorage } from "async_hooks";

interface RequestContext {
  isCacheHit: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const context: RequestContext = { isCacheHit: false };

  // Make context and setter available to handlers
  (res as any).requestContext = context;
  (req as any).setRequestContext = (ctx: Partial<RequestContext>) => {
    Object.assign(context, ctx);
  };

  storage.run(context, () => next());
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function markCacheHit() {
  const ctx = getRequestContext();
  if (ctx) {
    ctx.isCacheHit = true;
  }
}
