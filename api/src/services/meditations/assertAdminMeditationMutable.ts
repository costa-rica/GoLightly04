import { AppError } from "../../lib/errors";

export function assertAdminMeditationMutable(
  meditation: { stage?: "template" | "staged" | "library" },
  _intent: "delete" | "queue-delete" | "requeue",
): void {
  if ((meditation.stage ?? "library") === "staged") {
    throw new AppError(409, "STAGED_MEDITATION", "Staged meditations must be managed through staging flows");
  }
}
