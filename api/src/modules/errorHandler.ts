import { Request, Response, NextFunction } from "express";
import logger from "./logger";

// Standard error response interface
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    status: number;
  };
}

// Common error codes
export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTH_FAILED: "AUTH_FAILED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  MANTRA_NOT_FOUND: "MANTRA_NOT_FOUND",
  UNAUTHORIZED_ACCESS: "UNAUTHORIZED_ACCESS",
  QUEUER_ERROR: "QUEUER_ERROR",
  ADMIN_REQUIRED: "ADMIN_REQUIRED",
  BACKUP_FAILED: "BACKUP_FAILED",
  BACKUP_NOT_FOUND: "BACKUP_NOT_FOUND",
  INVALID_FILENAME: "INVALID_FILENAME",
  RESTORE_FAILED: "RESTORE_FAILED",
  INVALID_BACKUP_FILE: "INVALID_BACKUP_FILE",
  GOOGLE_AUTH_FAILED: "GOOGLE_AUTH_FAILED",
  INVALID_GOOGLE_TOKEN: "INVALID_GOOGLE_TOKEN",
  GOOGLE_USER_EXISTS: "GOOGLE_USER_EXISTS",
  PASSWORD_AUTH_DISABLED: "PASSWORD_AUTH_DISABLED",
};

// Create standard error response
export const createErrorResponse = (
  code: string,
  message: string,
  status: number,
  details?: any
): ErrorResponse => {
  const isDevelopment = process.env.NODE_ENV === "development";

  return {
    error: {
      code,
      message,
      details: isDevelopment ? details : undefined,
      status,
    },
  };
};

// Custom error class
export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(code: string, message: string, statusCode: number, details?: any) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Express error handling middleware
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the error
  logger.error(`Error: ${err.message}`, { stack: err.stack });

  // Handle AppError
  if (err instanceof AppError) {
    const response = createErrorResponse(
      err.code,
      err.message,
      err.statusCode,
      err.details
    );
    return res.status(err.statusCode).json(response);
  }

  // Handle generic errors
  const response = createErrorResponse(
    ErrorCodes.INTERNAL_ERROR,
    "An unexpected error occurred",
    500,
    err.message
  );
  return res.status(500).json(response);
};

// 404 handler for unknown routes
export const notFoundHandler = (req: Request, res: Response) => {
  const response = createErrorResponse(
    ErrorCodes.NOT_FOUND,
    `Route ${req.method} ${req.path} not found`,
    404
  );
  return res.status(404).json(response);
};
