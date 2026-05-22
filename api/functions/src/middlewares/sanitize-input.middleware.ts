import { Request, Response, NextFunction } from 'express';
import { stripHtml } from 'string-strip-html';

/**
 * Sanitizes user input to prevent XSS attacks.
 * Recursively processes all string values in request body, query, and params.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query as Record<string, unknown>);
  req.params = sanitizeObject(req.params);
  next();
}

/**
 * Recursively sanitizes all string values in an object.
 * Removes HTML tags and dangerous characters while preserving structure.
 */
function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    // Remove HTML tags and escape dangerous characters
    return stripHtml(obj).result.trim();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  // Return as-is for numbers, booleans, null, undefined, etc.
  return obj;
}
