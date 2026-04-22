import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";
import { AppError, isAppError } from "../lib/errors";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isAppError(error)) {
    if (error.status >= 500) {
      logger.error("AppError response", { code: error.code, message: error.message, details: error.details });
    }
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        status: error.status,
        details: error.details,
      },
    });
    return;
  }

  logger.error("Unhandled error", { error });
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      status: 500,
    },
  });
}
