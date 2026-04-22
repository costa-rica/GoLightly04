import { AppError } from "../lib/errors";

export function requireBodyFields<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
  fields: Array<keyof T>,
): void {
  for (const field of fields) {
    const value = body[String(field)];
    if (value === undefined || value === null || value === "") {
      throw new AppError(400, "VALIDATION_ERROR", `Missing required field: ${String(field)}`);
    }
  }
}

export function ensureString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a non-empty string`);
  }

  return value.trim();
}
