import {NextFunction} from "express";
import {AppError} from "../utils/error.util";
import {authLib} from "../lib/auth.lib";
import {extractBearerToken, AuthenticatedRequest} from "../utils/auth.util";

export const authMiddleware = (req: AuthenticatedRequest, _res: unknown, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new AppError(401, "Missing or invalid authorization header");
  }

  const payload = authLib.verifyAccessToken(token);

  if (!payload) {
    throw new AppError(401, "Invalid or expired access token");
  }

  req.user = {
    userId: payload.userId,
    email: payload.email,
  };

  next();
};

export const optionalAuthMiddleware = (req: AuthenticatedRequest, _res: unknown, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = extractBearerToken(authHeader);

  if (token) {
    const payload = authLib.verifyAccessToken(token);
    if (payload) {
      req.user = {
        userId: payload.userId,
        email: payload.email,
      };
    }
  }

  next();
};
