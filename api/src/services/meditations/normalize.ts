import {
  PAUSE_MAX,
  PAUSE_MIN,
  SPEED_MAX,
  SPEED_MIN,
} from "@golightly/shared-types";
import { AppError } from "../../lib/errors";

function normalizeNumber(
  raw: string | number | undefined | null,
  field: string,
): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  if (typeof raw === "string" && raw.trim() === "") {
    return undefined;
  }

  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    throw new AppError(400, "VALIDATION_ERROR", `${field} must be a number`);
  }

  return value;
}

export function normalizeSpeed(
  raw: string | number | undefined | null,
): number | undefined {
  const value = normalizeNumber(raw, "speed");
  if (value === undefined) {
    return undefined;
  }

  if (value < SPEED_MIN || value > SPEED_MAX) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `speed must be between ${SPEED_MIN} and ${SPEED_MAX}`,
    );
  }

  return value;
}

export function normalizePauseDuration(
  raw: string | number | undefined | null,
): number | undefined {
  const value = normalizeNumber(raw, "pause_duration");
  if (value === undefined) {
    return undefined;
  }

  if (value <= PAUSE_MIN) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "pause_duration must be greater than 0",
    );
  }

  if (value > PAUSE_MAX) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `pause_duration must be less than or equal to ${PAUSE_MAX}`,
    );
  }

  return value;
}
