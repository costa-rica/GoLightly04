/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    this.name = this.constructor.name;
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR');
    if (details) {
      (this as any).details = details;
    }
  }
}

/**
 * File not found error (404)
 */
export class FileNotFoundError extends AppError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, 404, 'FILE_NOT_FOUND');
  }
}

/**
 * Child process error (500)
 */
export class ChildProcessError extends AppError {
  constructor(message: string, processName?: string) {
    const fullMessage = processName ? `${processName}: ${message}` : message;
    super(fullMessage, 500, 'CHILD_PROCESS_ERROR');
  }
}

/**
 * Queue error (500)
 */
export class QueueError extends AppError {
  constructor(message: string) {
    super(message, 500, 'QUEUE_ERROR');
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string) {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

/**
 * Internal server error (500)
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}
