import { Router } from "express";
import bcrypt from "bcrypt";
import { OAuth2Client } from "google-auth-library";
import { getDb } from "../lib/db";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import {
  issueAccessToken,
  issueResetPasswordToken,
  issueVerificationToken,
  verifyToken,
  type ResetPasswordTokenPayload,
  type VerificationTokenPayload,
} from "../lib/authTokens";
import { ensureString, requireBodyFields } from "../middleware/validate";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/email";
import { readApiEnv } from "../config/env";

async function hasPublicMeditations(userId: number): Promise<boolean> {
  const { Meditation } = getDb();
  const count = await Meditation.count({
    where: {
      userId,
      visibility: "public",
    },
  });
  return count > 0;
}

function mapUser(user: { id: number; email: string; isAdmin: boolean; authProvider?: "local" | "google" | "both" }, publicFlag?: boolean) {
  return {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    authProvider: user.authProvider ?? "local",
    hasPublicMeditations: publicFlag ?? false,
  };
}

export function buildUsersRouter(): Router {
  const router = Router();

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["email", "password"]);
      const email = ensureString(req.body.email, "email").toLowerCase();
      const password = ensureString(req.body.password, "password");
      const { User } = getDb();

      const existing = await User.findOne({ where: { email } });
      if (existing) {
        throw new AppError(409, "EMAIL_EXISTS", "Email is already registered");
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        email,
        password: passwordHash,
        authProvider: "local",
        isEmailVerified: false,
      });

      const token = issueVerificationToken(email);
      await sendVerificationEmail({ email }, token);

      res.status(201).json({
        message: "Registration successful",
        userId: user.id,
      });
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["email", "password"]);
      const email = ensureString(req.body.email, "email").toLowerCase();
      const password = ensureString(req.body.password, "password");
      const { User } = getDb();
      const user = await User.findOne({ where: { email } });

      if (!user || !user.password) {
        throw new AppError(401, "AUTH_FAILED", "Invalid email or password");
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new AppError(401, "AUTH_FAILED", "Invalid email or password");
      }

      if (!user.isEmailVerified) {
        throw new AppError(403, "EMAIL_NOT_VERIFIED", "Please verify your email before logging in");
      }

      const accessToken = issueAccessToken({
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
        authProvider: user.authProvider,
      });

      res.json({
        message: "Login successful",
        accessToken,
        user: mapUser(user, await hasPublicMeditations(user.id)),
      });
    }),
  );

  router.post(
    "/forgot-password",
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["email"]);
      const email = ensureString(req.body.email, "email").toLowerCase();
      const { User } = getDb();
      const user = await User.findOne({ where: { email } });
      if (user) {
        const token = issueResetPasswordToken(email);
        await sendPasswordResetEmail({ email }, token);
      }

      res.json({ message: "If that account exists, a password reset email has been sent" });
    }),
  );

  router.post(
    "/reset-password",
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["token", "newPassword"]);
      const token = ensureString(req.body.token, "token");
      const newPassword = ensureString(req.body.newPassword, "newPassword");
      const payload = verifyToken<ResetPasswordTokenPayload>(token);
      if (payload.kind !== "reset-password") {
        throw new AppError(400, "INVALID_TOKEN", "Invalid reset token");
      }

      const { User } = getDb();
      const user = await User.findOne({ where: { email: payload.email } });
      if (!user) {
        throw new AppError(404, "USER_NOT_FOUND", "User not found");
      }

      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();
      res.json({ message: "Password reset successful" });
    }),
  );

  router.get(
    "/verify",
    asyncHandler(async (req, res) => {
      const token = ensureString(req.query.token, "token");
      const payload = verifyToken<VerificationTokenPayload>(token);
      if (payload.kind !== "verify-email") {
        throw new AppError(400, "INVALID_TOKEN", "Invalid verification token");
      }

      const { User } = getDb();
      const user = await User.findOne({ where: { email: payload.email } });
      if (!user) {
        throw new AppError(404, "USER_NOT_FOUND", "User not found");
      }

      user.isEmailVerified = true;
      user.emailVerifiedAt = new Date();
      await user.save();

      res.json({ message: "Email verified successfully" });
    }),
  );

  router.post(
    "/google-auth",
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["idToken"]);
      const idToken = ensureString(req.body.idToken, "idToken");
      const env = readApiEnv();
      const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const email = payload?.email?.toLowerCase();
      if (!email) {
        throw new AppError(400, "GOOGLE_AUTH_FAILED", "Google account email is unavailable");
      }

      const { User } = getDb();
      let user = await User.findOne({ where: { email } });

      if (!user) {
        user = await User.create({
          email,
          password: null,
          authProvider: "google",
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        });
      } else if (user.authProvider === "local") {
        user.authProvider = "both";
        user.isEmailVerified = true;
        user.emailVerifiedAt = new Date();
        await user.save();
      }

      const accessToken = issueAccessToken({
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
        authProvider: user.authProvider,
      });

      res.json({
        message: "Google authentication successful",
        accessToken,
        user: mapUser(user, await hasPublicMeditations(user.id)),
      });
    }),
  );

  return router;
}
