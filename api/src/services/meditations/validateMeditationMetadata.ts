import { DESCRIPTION_MAX, TITLE_MAX } from "@golightly/shared-types";
import { AppError } from "../../lib/errors";

export function validateMeditationMetadata(input: {
  title: unknown;
  description?: unknown;
  visibility: unknown;
}): {
  title: string;
  description: string | null;
  visibility: "public" | "private";
} {
  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Title is required");
  }

  const title = input.title.trim();
  if (title.length > TITLE_MAX) {
    throw new AppError(400, "VALIDATION_ERROR", `Title must be ${TITLE_MAX} characters or less`);
  }

  if (input.visibility !== "public" && input.visibility !== "private") {
    throw new AppError(400, "VALIDATION_ERROR", "visibility must be public or private");
  }

  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string") {
      throw new AppError(400, "VALIDATION_ERROR", "description must be a string");
    }
    const normalizedDescription = input.description.trim();
    if (normalizedDescription.length > DESCRIPTION_MAX) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        `Description must be ${DESCRIPTION_MAX} characters or less`,
      );
    }
    description = normalizedDescription || null;
  }

  return {
    title,
    description,
    visibility: input.visibility,
  };
}
