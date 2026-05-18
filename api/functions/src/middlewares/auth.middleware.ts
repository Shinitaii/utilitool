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
  } catch {
    throw new AppError(401, "Invalid or expired access token");
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
    } catch {
      // Token is invalid, but optional auth allows this
    }
  }

  next();
};
