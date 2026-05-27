import { AppError } from "../../lib/errors";

export function assertAdminMeditationMutable(
  meditation: { stage?: "template" | "staged" | "library" },
  _intent: "delete" | "queue-delete" | "requeue",
): void {
  if ((meditation.stage ?? "library") === "template") {
    throw new AppError(409, "PROTECTED_TEMPLATE", "Template meditations are protected");
  }
}
