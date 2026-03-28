import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "./jwt";
import { AppError, ErrorCodes } from "./errorHandler";

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

// Authentication middleware
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AppError(
        ErrorCodes.AUTH_FAILED,
        "Authorization header missing",
        401
      );
    }

    // Check if it's a Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new AppError(
        ErrorCodes.AUTH_FAILED,
        "Invalid authorization format. Expected: Bearer <token>",
        401
      );
    }

    const token = parts[1];

    // Verify token
    const payload = verifyAccessToken(token);

    // Attach user info to request
    req.user = payload;

    next();
  } catch (error: any) {
    if (error instanceof AppError) {
      next(error);
    } else if (error.name === "JsonWebTokenError") {
      next(
        new AppError(ErrorCodes.INVALID_TOKEN, "Invalid token", 401, error.message)
      );
    } else if (error.name === "TokenExpiredError") {
      next(
        new AppError(ErrorCodes.TOKEN_EXPIRED, "Token expired", 401, error.message)
      );
    } else {
      next(
        new AppError(
          ErrorCodes.AUTH_FAILED,
          "Authentication failed",
          401,
          error.message
        )
      );
    }
  }
};
