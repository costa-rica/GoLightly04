import nodemailer from "nodemailer";
import { readApiEnv } from "../config/env";

export function createEmailTransport() {
  const env = readApiEnv();
  return nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    secure: false,
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASSWORD,
    },
  });
}

export async function sendVerificationEmail(user: { email: string }, token: string): Promise<void> {
  const env = readApiEnv();
  const transporter = createEmailTransport();
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: "Verify your GoLightly account",
    text: `${env.URL_BASE_WEBSITE}/verify?token=${token}`,
  });
}

export async function sendPasswordResetEmail(user: { email: string }, token: string): Promise<void> {
  const env = readApiEnv();
  const transporter = createEmailTransport();
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: user.email,
    subject: "Reset your GoLightly password",
    text: `${env.URL_BASE_WEBSITE}/reset-password/${token}`,
  });
}
