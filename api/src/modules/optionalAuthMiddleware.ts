import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./jwt";
import logger from "./logger";

// Optional authentication middleware
// Attaches user info to request if valid token is present, but doesn't fail if token is missing
export const optionalAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    // If no auth header, continue without user
    if (!authHeader) {
      req.user = undefined;
      return next();
    }

    // Check if it's a Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      // Invalid format, continue without user
      req.user = undefined;
      return next();
    }

    const token = parts[1];

    // Try to verify token
    try {
      const payload = verifyAccessToken(token);
      // Attach user info to request
      req.user = payload;
    } catch (error: any) {
      // Token verification failed, continue without user
      logger.warn(
        `Optional auth: Token verification failed - ${error.message}`
      );
      req.user = undefined;
    }

    next();
  } catch (error: any) {
    // Any unexpected error, log and continue without user
    logger.error(`Optional auth middleware error: ${error.message}`);
    req.user = undefined;
    next();
  }
};
