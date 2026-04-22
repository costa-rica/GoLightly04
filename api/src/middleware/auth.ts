import type { NextFunction, Request, Response } from "express";
import { AccessTokenPayload, verifyToken } from "../lib/authTokens";
import { AppError } from "../lib/errors";

function readBearerToken(req: Request): string | null {
  const header = req.header("Authorization");
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyToken<AccessTokenPayload>(token);
    if (payload.kind !== "access") {
      throw new AppError(401, "AUTH_FAILED", "Invalid access token");
    }
    req.user = {
      id: payload.id,
      email: payload.email,
      isAdmin: payload.isAdmin,
      authProvider: payload.authProvider,
    };
    next();
  } catch (_error) {
    next(new AppError(401, "AUTH_FAILED", "Invalid access token"));
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  optionalAuth(req, res, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }
    if (!req.user) {
      next(new AppError(401, "AUTH_REQUIRED", "Authentication required"));
      return;
    }
    next();
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, (error?: unknown) => {
    if (error) {
      next(error);
      return;
    }
    if (!req.user?.isAdmin) {
      next(new AppError(403, "ADMIN_REQUIRED", "Admin access required"));
      return;
    }
    next();
  });
}
