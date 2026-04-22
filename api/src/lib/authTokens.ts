import jwt from "jsonwebtoken";
import { readApiEnv } from "../config/env";

export type AuthenticatedRequestUser = {
  id: number;
  email: string;
  isAdmin: boolean;
  authProvider?: "local" | "google" | "both";
};

type TokenKind = "access" | "verify-email" | "reset-password" | "stream-token";

type BaseTokenPayload = {
  kind: TokenKind;
};

export type AccessTokenPayload = BaseTokenPayload &
  AuthenticatedRequestUser & {
    kind: "access";
  };

export type VerificationTokenPayload = BaseTokenPayload & {
  kind: "verify-email";
  email: string;
};

export type ResetPasswordTokenPayload = BaseTokenPayload & {
  kind: "reset-password";
  email: string;
};

export type StreamTokenPayload = BaseTokenPayload & {
  kind: "stream-token";
  meditationId: number;
  userId: number;
};

export function issueAccessToken(user: AuthenticatedRequestUser): string {
  const env = readApiEnv();
  return jwt.sign(
    {
      kind: "access",
      id: user.id,
      email: user.email,
      isAdmin: user.isAdmin,
      authProvider: user.authProvider,
    } satisfies AccessTokenPayload,
    env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

export function issueVerificationToken(email: string): string {
  const env = readApiEnv();
  return jwt.sign({ kind: "verify-email", email } satisfies VerificationTokenPayload, env.JWT_SECRET, {
    expiresIn: "24h",
  });
}

export function issueResetPasswordToken(email: string): string {
  const env = readApiEnv();
  return jwt.sign({ kind: "reset-password", email } satisfies ResetPasswordTokenPayload, env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

export function issueStreamToken(meditationId: number, userId: number): string {
  const env = readApiEnv();
  return jwt.sign(
    { kind: "stream-token", meditationId, userId } satisfies StreamTokenPayload,
    env.JWT_SECRET,
    { expiresIn: "5m" },
  );
}

export function verifyToken<T>(token: string): T {
  const env = readApiEnv();
  return jwt.verify(token, env.JWT_SECRET) as T;
}
