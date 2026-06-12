import type { ImportProvenanceMetadata } from "@golightly/shared-types";
import { AppError } from "../../lib/errors";

const USER_KEYS = new Set(["nick", "benevolent_monkey"]);

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(400, "VALIDATION_ERROR", `${field} is required`);
  }
  return value.trim();
}

export function validateImportProvenanceMetadata(value: unknown): ImportProvenanceMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(400, "VALIDATION_ERROR", "importMetadata must be an object");
  }

  const metadata = value as Record<string, unknown>;
  const allowedKeys = new Set(["sourceFile", "sourceRoot", "sourceUserKey", "importedAt", "checksum"]);
  for (const key of Object.keys(metadata)) {
    if (!allowedKeys.has(key)) {
      throw new AppError(400, "UNKNOWN_FIELD", `Unknown importMetadata field: ${key}`);
    }
  }

  const sourceUserKey = requireNonEmptyString(metadata.sourceUserKey, "importMetadata.sourceUserKey");
  if (!USER_KEYS.has(sourceUserKey)) {
    throw new AppError(400, "VALIDATION_ERROR", "importMetadata.sourceUserKey must be nick or benevolent_monkey");
  }

  const importedAt = requireNonEmptyString(metadata.importedAt, "importMetadata.importedAt");
  if (Number.isNaN(Date.parse(importedAt))) {
    throw new AppError(400, "VALIDATION_ERROR", "importMetadata.importedAt must be an ISO date string");
  }

  const checksum = requireNonEmptyString(metadata.checksum, "importMetadata.checksum");
  if (!/^sha256:[a-f0-9]{64}$/.test(checksum)) {
    throw new AppError(400, "VALIDATION_ERROR", "importMetadata.checksum must be a sha256 digest");
  }

  return {
    sourceFile: requireNonEmptyString(metadata.sourceFile, "importMetadata.sourceFile"),
    sourceRoot: requireNonEmptyString(metadata.sourceRoot, "importMetadata.sourceRoot"),
    sourceUserKey: sourceUserKey as ImportProvenanceMetadata["sourceUserKey"],
    importedAt,
    checksum,
  };
}

export function normalizeImportLookup(value: unknown, field: string): string {
  return requireNonEmptyString(value, field);
}
