import path from "path";

/**
 * Sanitizes a filename to prevent security issues
 * Removes path traversal characters and limits to safe characters
 */
export function sanitizeFilename(filename: string): string {
  // Remove any path components
  const baseName = path.basename(filename);

  // Replace any character that isn't alphanumeric, dash, underscore, or dot
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Remove any leading dots to prevent hidden files
  const withoutLeadingDots = sanitized.replace(/^\.+/, "");

  // Ensure filename is not empty after sanitization
  if (!withoutLeadingDots) {
    return "unnamed_file.mp3";
  }

  return withoutLeadingDots;
}

/**
 * Validates that a file has a .mp3 extension
 */
export function isMP3File(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ext === ".mp3";
}

/**
 * Gets filename without extension
 */
export function getFilenameWithoutExtension(filename: string): string {
  return path.parse(filename).name;
}
