import path from "path";
import { AppError, ErrorCodes } from "../errorHandler";

/**
 * Validate filename for path traversal attacks
 * Throws AppError if filename is invalid
 */
export function validateFilename(filename: string): void {
  // Check for path traversal attempts
  if (
    filename.includes("..") ||
    filename.includes("/") ||
    filename.includes("\\") ||
    path.isAbsolute(filename)
  ) {
    throw new AppError(
      ErrorCodes.INVALID_FILENAME,
      "Invalid filename: path traversal detected",
      400,
    );
  }

  // Check for null bytes (command injection)
  if (filename.includes("\0")) {
    throw new AppError(
      ErrorCodes.INVALID_FILENAME,
      "Invalid filename: null byte detected",
      400,
    );
  }

  // Check if filename is empty
  if (!filename || filename.trim().length === 0) {
    throw new AppError(
      ErrorCodes.INVALID_FILENAME,
      "Filename cannot be empty",
      400,
    );
  }
}

/**
 * Validate that filename has .zip extension
 */
export function validateZipExtension(filename: string): void {
  if (!filename.endsWith(".zip")) {
    throw new AppError(
      ErrorCodes.INVALID_FILENAME,
      "Filename must have .zip extension",
      400,
    );
  }
}

/**
 * Sanitize filename by removing dangerous characters
 */
export function sanitizeFilename(filename: string): string {
  // Remove any path components
  const basename = path.basename(filename);

  // Remove any characters that aren't alphanumeric, dash, underscore, or dot
  return basename.replace(/[^a-zA-Z0-9._-]/g, "_");
}
