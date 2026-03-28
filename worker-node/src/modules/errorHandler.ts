import { Request, Response, NextFunction } from 'express';
import logger from './logger';
import { AppError } from './errors';

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    status: number;
    details?: any;
  };
}

/**
 * Error handler middleware
 * Formats errors according to ERROR_REQUIREMENTS.md standards
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error
  logger.error(`Error: ${err.message}`, {
    error: err,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Determine if this is an operational error
  const isAppError = err instanceof AppError;

  // Build error response
  const errorResponse: ErrorResponse = {
    error: {
      code: isAppError ? err.code : 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      status: isAppError ? err.statusCode : 500,
    },
  };

  // Add details in development mode, but sanitize in production
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.details = {
      stack: err.stack,
      ...(isAppError && (err as any).details ? { validationDetails: (err as any).details } : {}),
    };
  } else if (process.env.NODE_ENV === 'testing') {
    // In testing, include details but sanitized
    if (isAppError && (err as any).details) {
      errorResponse.error.details = (err as any).details;
    }
  }
  // In production, never expose internal details

  // Send response
  res.status(errorResponse.error.status).json(errorResponse);
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
      status: 404,
    },
  };

  res.status(404).json(errorResponse);
}
