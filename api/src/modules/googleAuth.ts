import { OAuth2Client } from "google-auth-library";
import logger from "./logger";
import { AppError, ErrorCodes } from "./errorHandler";

// Initialize Google OAuth2 client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Interface for Google user data extracted from token
export interface GoogleUserData {
  email: string;
  name?: string;
  googleId: string;
  emailVerified: boolean;
}

/**
 * Verifies a Google ID token and extracts user data
 * @param token - The Google ID token to verify
 * @returns GoogleUserData object containing email, name, googleId, and emailVerified status
 * @throws AppError if token is invalid or verification fails
 */
export async function verifyGoogleToken(
  token: string
): Promise<GoogleUserData> {
  try {
    // Verify the token with Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      logger.error("Google token verification failed: No payload returned");
      throw new AppError(
        ErrorCodes.INVALID_GOOGLE_TOKEN,
        "Invalid Google token: No payload",
        401
      );
    }

    // Extract user data from payload
    const { sub: googleId, email, name, email_verified } = payload;

    if (!email) {
      logger.error("Google token verification failed: No email in payload");
      throw new AppError(
        ErrorCodes.INVALID_GOOGLE_TOKEN,
        "Invalid Google token: Email not provided",
        401
      );
    }

    logger.info(`Successfully verified Google token for email: ${email}`);

    return {
      email: email.toLowerCase(), // Normalize email to lowercase
      name,
      googleId,
      emailVerified: email_verified || false,
    };
  } catch (error: any) {
    // Handle errors from Google's verification
    if (error instanceof AppError) {
      throw error;
    }

    logger.error(`Google token verification error: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    // Generic error for token verification failures
    throw new AppError(
      ErrorCodes.INVALID_GOOGLE_TOKEN,
      "Failed to verify Google token",
      401,
      error.message
    );
  }
}
