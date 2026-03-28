import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  process.stderr.write("[FATAL] Missing JWT_SECRET environment variable\n");
  process.exit(1);
}

// Payload interface for access tokens
export interface AccessTokenPayload {
  userId: number;
  email: string;
}

// Payload interface for email verification tokens
export interface EmailVerificationPayload {
  userId: number;
  email: string;
}

// Payload interface for password reset tokens
export interface PasswordResetPayload {
  userId: number;
  email: string;
}

// Generate access token (no expiration as per requirements)
export const generateAccessToken = (userId: number, email: string): string => {
  const payload: AccessTokenPayload = {
    userId,
    email,
  };
  return jwt.sign(payload, JWT_SECRET);
};

// Verify access token
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
};

// Generate email verification token (30 minutes expiration)
export const generateEmailVerificationToken = (
  userId: number,
  email: string
): string => {
  const payload: EmailVerificationPayload = {
    userId,
    email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30m" });
};

// Verify email verification token
export const verifyEmailVerificationToken = (
  token: string
): EmailVerificationPayload => {
  return jwt.verify(token, JWT_SECRET) as EmailVerificationPayload;
};

// Generate password reset token (30 minutes expiration)
export const generatePasswordResetToken = (
  userId: number,
  email: string
): string => {
  const payload: PasswordResetPayload = {
    userId,
    email,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30m" });
};

// Verify password reset token
export const verifyPasswordResetToken = (
  token: string
): PasswordResetPayload => {
  return jwt.verify(token, JWT_SECRET) as PasswordResetPayload;
};
