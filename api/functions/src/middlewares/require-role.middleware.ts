import {NextFunction, Response} from "express";
import {AppError} from "../utils/error.util";
import {AuthenticatedRequest, Role} from "../utils/auth.util";
import {userRepository} from "../features/auth/auth.repository";

interface CachedRole {
  role: Role;
  timestamp: number;
}

const roleCache = new Map<string, CachedRole>();
const CACHE_TTL_MS = 45 * 1000; // 45 seconds

function getCachedRole(userId: string): Role | null {
  const cached = roleCache.get(userId);
  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  if (age > CACHE_TTL_MS) {
    roleCache.delete(userId);
    return null;
  }

  return cached.role;
}

function setCachedRole(userId: string, role: Role): void {
  roleCache.set(userId, { role, timestamp: Date.now() });
}

/**
 * Middleware factory that enforces role-based access control.
 * Caches user roles for 45s to reduce Firestore reads.
 * Cache is transparent—role changes propagate within 45s.
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      throw new AppError(401, "Authentication required");
    }

    let role = getCachedRole(req.user.userId);

    if (!role) {
      const user = await userRepository.getById(req.user.userId);

      if (!user) {
        throw new AppError(403, "User profile not found");
      }

      role = user.role;
      setCachedRole(req.user.userId, role);
    }

    if (!allowedRoles.includes(role)) {
      throw new AppError(403, `Access denied. Required role: ${allowedRoles.join(" or ")}`);
    }

    req.user.role = role;
    next();
  };
}
