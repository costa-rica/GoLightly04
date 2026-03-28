import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import logger from "./logger";

// Validate email environment variables
const requiredEmailVars = [
  "EMAIL_HOST",
  "EMAIL_PORT",
  "EMAIL_USER",
  "EMAIL_PASSWORD",
  "EMAIL_FROM",
];
const missingEmailVars = requiredEmailVars.filter(
  (varName) => !process.env[varName],
);

if (missingEmailVars.length > 0) {
  process.stderr.write(
    `[FATAL] Missing required email environment variables: ${missingEmailVars.join(", ")}\n`,
  );
  process.exit(1);
}

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST!,
  port: parseInt(process.env.EMAIL_PORT!, 10),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER!,
    pass: process.env.EMAIL_PASSWORD!,
  },
});

// Validate URL_BASE_WEBSITE environment variable
if (!process.env.URL_BASE_WEBSITE) {
  process.stderr.write("[FATAL] Missing URL_BASE_WEBSITE environment variable\n");
  process.exit(1);
}

const resolveTemplatePath = (templateName: string): string => {
  const distPath = path.resolve(__dirname, "../templates", templateName);
  if (fs.existsSync(distPath)) {
    return distPath;
  }

  return path.resolve(process.cwd(), "src", "templates", templateName);
};

// Send verification email
export const sendVerificationEmail = async (
  email: string,
  token: string,
): Promise<void> => {
  try {
    // Read HTML template
    const templatePath = resolveTemplatePath("emailVerification.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf-8");

    // Build verification URL
    const verificationUrl = `${process.env.URL_BASE_WEBSITE}/verify?token=${token}`;

    // Replace placeholders in template
    htmlTemplate = htmlTemplate.replace("{{verificationUrl}}", verificationUrl);

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_FROM!,
      to: email,
      subject: "Verify your GoLightly account",
      html: htmlTemplate,
    });

    logger.info(`Verification email sent to ${email}`);
  } catch (error: any) {
    logger.error(
      `Failed to send verification email to ${email}: ${error.message}`,
    );
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
};

// Send password reset email
export const sendPasswordResetEmail = async (
  email: string,
  token: string,
): Promise<void> => {
  try {
    // Read HTML template
    const templatePath = resolveTemplatePath("passwordReset.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf-8");

    // Build password reset URL
    const resetUrl = `${process.env.URL_BASE_WEBSITE}/reset-password/${token}`;

    // Replace placeholders in template
    htmlTemplate = htmlTemplate.replace(/{{resetUrl}}/g, resetUrl);

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_FROM!,
      to: email,
      subject: "Reset your GoLightly password",
      html: htmlTemplate,
    });

    logger.info(`Password reset email sent to ${email}`);
  } catch (error: any) {
    logger.error(
      `Failed to send password reset email to ${email}: ${error.message}`,
    );
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
};
