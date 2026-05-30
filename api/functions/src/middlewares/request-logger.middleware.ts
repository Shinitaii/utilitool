import {pinoHttp} from "pino-http";
import {logger} from "../utils/logger.util";
import {Request, Response} from "express";

function formatLogMessage(
  method: string,
  path: string,
  status: number,
  duration: number,
  cacheHit: boolean,
  errorMsg?: string
): string {
  // Cache hit detection from request context
  const cacheStatus = cacheHit ? " (✓ cached hit)" : "";

  // Slow request detection (>500ms)
  const isSlow = duration > 500;
  const slowStatus = isSlow ? " (⚠️ slow)" : " (✓)";

  // Performance indicator
  const perfIndicator = cacheStatus || slowStatus;

  // Status code
  const statusStr = ` ${status}`;

  // Error message if present
  const errStr = errorMsg ? ` - ${errorMsg}` : "";

  return `${method} ${path} - ${duration}ms${perfIndicator}${statusStr}${errStr}`;
}

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req: Request) => {
      const url = req.url || "";
      return url.includes("health") || url.includes("metrics") || url.includes("docs");
    },
  },
  customLogLevel: (req, res, err) => {
    if (err) return "error";
    if (res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req, res, responseTime) => {
    const method = req.method;
    const path = (req.url || "").split("?")[0];
    const status = res.statusCode;
    const duration = Math.round(responseTime);
    const cacheHit = (res as any).requestContext?.isCacheHit || false;

    return formatLogMessage(method, path, status, duration, cacheHit);
  },
  customErrorMessage: (req, res, err) => {
    const method = req.method;
    const path = (req.url || "").split("?")[0];
    const status = res.statusCode;
    const cacheHit = (res as any).requestContext?.isCacheHit || false;

    // Extract error message from Error object
    let errorMsg = "";
    if (err && typeof err === "object" && "message" in err) {
      errorMsg = (err as any).message;
    }

    // Duration is not available in customErrorMessage, use 0 as placeholder
    return formatLogMessage(method, path, status, 0, cacheHit, errorMsg);
  },
  serializers: {
    req: (req: Request) => ({
      method: req.method,
      path: req.url?.split("?")[0],
      query: req.query,
    }),
    res: (res: Response) => ({
      status: res.statusCode,
      cacheHit: (res as any).requestContext?.isCacheHit,
    }),
  },
});
