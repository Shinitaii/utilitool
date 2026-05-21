import {NextFunction, Response} from "express";
import {AppError} from "../utils/error.util";
import {AuthenticatedRequest, Role} from "../utils/auth.util";
import {userRepository} from "../features/auth/auth.repository";

/**
 * Middleware factory that enforces role-based access control.
 * Fetches the user's current role from Firestore on each call,
 * ensuring role changes take effect immediately.
 */
export function requireRole(...allowedRoles: Role[]) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      throw new AppError(401, "Authentication required");
    }

    const user = await userRepository.getById(req.user.userId);

    if (!user) {
      throw new AppError(403, "User profile not found");
    }

    if (!allowedRoles.includes(user.role)) {
      throw new AppError(403, `Access denied. Required role: ${allowedRoles.join(" or ")}`);
    }

    req.user.role = user.role;
    next();
  };
}
