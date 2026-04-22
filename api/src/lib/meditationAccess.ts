import type { Request } from "express";
import { verifyToken, type StreamTokenPayload } from "./authTokens";
import { AppError } from "./errors";

export function isStreamStart(rangeHeader: string | undefined): boolean {
  if (!rangeHeader) {
    return true;
  }

  return rangeHeader.trim() === "bytes=0-";
}

export function readStreamToken(req: Request): StreamTokenPayload | null {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) {
    return null;
  }

  const payload = verifyToken<StreamTokenPayload>(token);
  if (payload.kind !== "stream-token") {
    throw new AppError(401, "AUTH_FAILED", "Invalid stream token");
  }

  return payload;
}

export function canAccessMeditation(
  meditation: { userId: number; visibility: string },
  req: Request,
): boolean {
  if (meditation.visibility === "public") {
    return true;
  }

  if (req.user?.isAdmin || req.user?.id === meditation.userId) {
    return true;
  }

  const tokenPayload = readStreamToken(req);
  return !!tokenPayload && tokenPayload.userId === meditation.userId;
}
