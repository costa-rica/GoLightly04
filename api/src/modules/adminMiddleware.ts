import { Request, Response, NextFunction } from "express";
import { User } from "@golightly/db-models";
import { AppError, ErrorCodes } from "./errorHandler";
import logger from "./logger";

/**
 * Admin middleware - verifies that the authenticated user is an admin
 * Must be used after authMiddleware
 */
export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Check if user is authenticated (should be set by authMiddleware)
    if (!req.user) {
      throw new AppError(
        ErrorCodes.AUTH_FAILED,
        "Authentication required",
        401,
      );
    }

    // Fetch user from database to check admin status
    const user = await User.findByPk(req.user.userId);

    if (!user) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, "User not found", 404);
    }

    // Check if user is admin
    const isAdmin = user.get("isAdmin") as boolean;

    if (!isAdmin) {
      logger.warn(
        `Non-admin user ${req.user.userId} attempted to access admin endpoint: ${req.method} ${req.path}`,
      );
      throw new AppError(
        ErrorCodes.ADMIN_REQUIRED,
        "Admin privileges required",
        403,
      );
    }

    // User is admin, continue
    next();
  } catch (error: any) {
    next(error);
  }
};
