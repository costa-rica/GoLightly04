import { AppError } from "../../lib/errors";

type Requester = { id: number; isAdmin?: boolean } | undefined;
type Intent = "read" | "stream" | "mutate" | "favorite";
type MeditationLike = {
  userId: number;
  visibility: "public" | "private";
  status?: string;
  stage?: "template" | "staged" | "library";
};

export function assertMeditationAccess(
  meditation: MeditationLike,
  requester: Requester,
  intent: Intent,
): void {
  const stage = meditation.stage ?? "library";

  if (intent === "read" || intent === "stream") {
    if (stage === "staged") {
      if (requester?.id === meditation.userId) {
        return;
      }
      throw new AppError(404, "NOT_FOUND", "Meditation not found");
    }
    if (
      (meditation.visibility === "public" && meditation.status === "complete") ||
      requester?.id === meditation.userId ||
      requester?.isAdmin
    ) {
      return;
    }
    throw new AppError(403, "FORBIDDEN", "You do not have access to this meditation");
  }

  if (stage === "staged") {
    throw new AppError(409, "STAGED_MEDITATION", "Use staging endpoints to mutate staged meditations");
  }
  if (intent === "favorite") {
    if (
      requester &&
      ((meditation.visibility === "public" && meditation.status === "complete") ||
        requester.id === meditation.userId ||
        requester.isAdmin)
    ) {
      return;
    }
    throw new AppError(403, "FORBIDDEN", "You cannot favorite this meditation");
  }
  if (requester?.id === meditation.userId || requester?.isAdmin) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "You cannot mutate this meditation");
}
