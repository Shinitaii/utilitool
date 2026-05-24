import * as admin from "firebase-admin";
import { NextFunction } from "express";
import { AppError } from "../utils/error.util";
import { extractBearerToken, AuthenticatedRequest } from "../utils/auth.util";

export const authMiddleware = async (
  req: AuthenticatedRequest,
  _res: unknown,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new AppError(401, "Missing or invalid authorization header");
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      userId: decoded.uid,
      email: decoded.email!,
      displayName: decoded.name,
    };
    next();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    // Only treat auth-specific errors as 401; others indicate SDK misconfiguration
    if (err.message?.includes('auth') || err.message?.includes('token')) {
      throw new AppError(401, "Invalid or expired access token");
    }
    // Re-throw non-auth errors (SDK initialization, credentials issues, etc.)
    throw error;
  }
};

export const optionalAuthMiddleware = async (
  req: AuthenticatedRequest,
  _res: unknown,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (token) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = {
        userId: decoded.uid,
        email: decoded.email!,
        displayName: decoded.name,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // For optional auth, silently skip auth on token errors, but propagate SDK issues
      if (!err.message?.includes('auth') && !err.message?.includes('token')) {
        throw error;
      }
      // Token is invalid or expired, but optional auth allows proceeding without user context
    }
  }

  next();
};
