import { Router, Request, Response, NextFunction } from "express";
import { User } from "@golightly/db-models";
import { hashPassword, comparePassword } from "../modules/passwordHash";
import {
  generateAccessToken,
  generateEmailVerificationToken,
  verifyEmailVerificationToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from "../modules/jwt";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../modules/emailService";
import { AppError, ErrorCodes } from "../modules/errorHandler";
import logger from "../modules/logger";
import { checkUserHasPublicMeditations } from "../modules/userPublicMeditations";
import { deleteUser } from "../modules/deleteUser";
import { authMiddleware } from "../modules/authMiddleware";
import { verifyGoogleToken } from "../modules/googleAuth";

const router = Router();

// POST /users/register
router.post(
  "/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Email and password are required",
          400,
        );
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Invalid email format",
          400,
        );
      }

      // Validate password length
      if (password.length < 4) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Password must be at least 4 characters long",
          400,
        );
      }

      // Normalize email to lowercase
      const normalizedEmail = email.toLowerCase();

      // Check if user already exists
      const existingUser = await User.findOne({
        where: { email: normalizedEmail },
      });

      if (existingUser) {
        // Check if existing user has Google authentication
        if (existingUser.authProvider === "google") {
          throw new AppError(
            ErrorCodes.GOOGLE_USER_EXISTS,
            "An account with this email already exists. Please use Google Sign-In.",
            409,
          );
        }

        throw new AppError(
          ErrorCodes.CONFLICT,
          "User with this email already exists",
          409,
        );
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const user = await User.create({
        email: normalizedEmail,
        password: hashedPassword,
        isEmailVerified: false,
        isAdmin: false,
        authProvider: "local",
      });

      logger.info(`New user registered: ${normalizedEmail}`);

      // Generate email verification token
      const verificationToken = generateEmailVerificationToken(
        user.id as number,
        user.email as string,
      );

      // Send verification email
      await sendVerificationEmail(normalizedEmail, verificationToken);

      res.status(201).json({
        message:
          "Registration successful. Please check your email to verify your account.",
        userId: user.id,
      });
    } catch (error) {
      next(error);
    }
  },
);

// GET /users/verify
router.get(
  "/verify",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.query;

      // Validate token exists
      if (!token || typeof token !== "string") {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Verification token is required",
          400,
        );
      }

      // Verify and decode token
      let payload;
      try {
        payload = verifyEmailVerificationToken(token);
      } catch (error: any) {
        if (error.name === "TokenExpiredError") {
          throw new AppError(
            ErrorCodes.TOKEN_EXPIRED,
            "Verification token has expired. Please request a new verification email.",
            401,
          );
        } else {
          throw new AppError(
            ErrorCodes.INVALID_TOKEN,
            "Invalid verification token",
            401,
          );
        }
      }

      // Find user
      const user = await User.findByPk(payload.userId);

      if (!user) {
        throw new AppError(ErrorCodes.USER_NOT_FOUND, "User not found", 404);
      }

      // Check if already verified
      if (user.isEmailVerified) {
        return res.status(200).json({
          message: "Email is already verified. You can now log in.",
        });
      }

      // Update user verification status
      await User.update(
        {
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        },
        {
          where: { id: payload.userId },
        },
      );

      logger.info(`Email verified for user: ${user.email}`);

      res.status(200).json({
        message: "Email verified successfully. You can now log in.",
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /users/login
router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Email and password are required",
          400,
        );
      }

      // Normalize email
      const normalizedEmail = email.toLowerCase();

      // Find user
      const user = await User.findOne({
        where: { email: normalizedEmail },
      });

      if (!user) {
        throw new AppError(
          ErrorCodes.AUTH_FAILED,
          "Invalid email or password",
          401,
        );
      }

      // Check if user is Google-only (cannot login with password)
      if (user.authProvider === "google") {
        throw new AppError(
          ErrorCodes.PASSWORD_AUTH_DISABLED,
          "This account uses Google Sign-In. Please use the Google button to log in.",
          403,
        );
      }

      // Check if email is verified
      if (!user.isEmailVerified) {
        throw new AppError(
          ErrorCodes.EMAIL_NOT_VERIFIED,
          "Please verify your email before logging in",
          403,
        );
      }

      // Compare password
      const isPasswordValid = await comparePassword(
        password,
        user.password as string,
      );

      if (!isPasswordValid) {
        throw new AppError(
          ErrorCodes.AUTH_FAILED,
          "Invalid email or password",
          401,
        );
      }

      // Generate access token
      const accessToken = generateAccessToken(
        user.id as number,
        user.email as string,
      );

      // Check if user has public meditations
      const hasPublicMeditations = await checkUserHasPublicMeditations(
        user.id as number,
      );

      logger.info(`User logged in: ${user.email}`);

      res.status(200).json({
        message: "Login successful",
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          isAdmin: user.isAdmin,
          hasPublicMeditations,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /users/google-auth
router.post(
  "/google-auth",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { idToken } = req.body;

      // Validate input
      if (!idToken) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Google ID token is required",
          400,
        );
      }

      // Verify Google token
      const googleUser = await verifyGoogleToken(idToken);

      // Check if user exists
      const existingUser = await User.findOne({
        where: { email: googleUser.email },
      });

      let user: any;
      let isNewUser = false;

      if (!existingUser) {
        // Create new user with Google authentication
        user = await User.create({
          email: googleUser.email,
          password: null,
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
          isAdmin: false,
          authProvider: "google",
        });

        isNewUser = true;
        logger.info(
          `New user registered via Google: ${googleUser.email}`,
        );
      } else {
        user = existingUser;

        // Handle account linking for existing local users
        if (user.authProvider === "local") {
          await User.update(
            { authProvider: "both" },
            { where: { id: user.id } },
          );

          logger.info(
            `Linked Google account to existing user: ${user.email}`,
          );
        } else {
          logger.info(`User logged in via Google: ${user.email}`);
        }
      }

      // Generate access token
      const accessToken = generateAccessToken(
        user.id as number,
        user.email as string,
      );

      // Check if user has public meditations
      const hasPublicMeditations = await checkUserHasPublicMeditations(
        user.id as number,
      );

      const message = isNewUser
        ? "Registration successful via Google"
        : "Login successful via Google";

      res.status(200).json({
        message,
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          isAdmin: user.isAdmin,
          hasPublicMeditations,
          authProvider: user.authProvider === "local" ? "both" : user.authProvider,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /users/forgot-password
router.post(
  "/forgot-password",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      // Validate input
      if (!email) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Email is required",
          400,
        );
      }

      // Normalize email
      const normalizedEmail = email.toLowerCase();

      // Find user
      const user = await User.findOne({
        where: { email: normalizedEmail },
      });

      // If user doesn't exist, return error
      if (!user) {
        throw new AppError(
          ErrorCodes.USER_NOT_FOUND,
          "No account found with this email address",
          404,
        );
      }

      // Generate password reset token
      const resetToken = generatePasswordResetToken(
        user.id as number,
        user.email as string,
      );

      // Send password reset email
      await sendPasswordResetEmail(normalizedEmail, resetToken);

      logger.info(`Password reset email sent to ${normalizedEmail}`);

      res.status(200).json({
        message: "Password reset link has been sent to your email address",
      });
    } catch (error) {
      next(error);
    }
  },
);

// POST /users/reset-password
router.post(
  "/reset-password",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body;

      // Validate input
      if (!token || !newPassword) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Token and new password are required",
          400,
        );
      }

      // Validate password length
      if (newPassword.length < 2) {
        throw new AppError(
          ErrorCodes.VALIDATION_ERROR,
          "Password must be at least 2 characters long",
          400,
        );
      }

      // Verify and decode token
      let payload;
      try {
        payload = verifyPasswordResetToken(token);
      } catch (error: any) {
        if (error.name === "TokenExpiredError") {
          throw new AppError(
            ErrorCodes.TOKEN_EXPIRED,
            "Password reset token has expired. Please request a new password reset.",
            401,
          );
        } else {
          throw new AppError(
            ErrorCodes.INVALID_TOKEN,
            "Invalid password reset token",
            401,
          );
        }
      }

      // Find user
      const user = await User.findByPk(payload.userId);

      if (!user) {
        throw new AppError(ErrorCodes.USER_NOT_FOUND, "User not found", 404);
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);

      // Update user password
      await User.update(
        {
          password: hashedPassword,
        },
        {
          where: { id: payload.userId },
        },
      );

      logger.info(`Password reset successful for user: ${user.email}`);

      res.status(200).json({
        message:
          "Password has been reset successfully. You can now log in with your new password.",
      });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /users/me
router.delete(
  "/me",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new AppError(
          ErrorCodes.AUTH_FAILED,
          "Authentication required",
          401,
        );
      }

      // Extract savePublicMeditationsAsBenevolentUser from request body (default: false)
      const savePublicMeditationsAsBenevolentUser =
        req.body.savePublicMeditationsAsBenevolentUser === true;

      logger.info(`User ${userId} initiated self-deletion`);

      // Call deleteUser module
      const result = await deleteUser(
        userId,
        savePublicMeditationsAsBenevolentUser,
      );

      res.status(200).json({
        message: "Your account has been deleted successfully",
        userId: result.userId,
        meditationsDeleted: result.meditationsDeleted,
        elevenLabsFilesDeleted: result.elevenLabsFilesDeleted,
        benevolentUserCreated: result.benevolentUserCreated,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
      } else {
        logger.error(
          `Failed to delete user ${req.user?.userId}: ${error.message}`,
        );
        next(
          new AppError(
            ErrorCodes.INTERNAL_ERROR,
            "Failed to delete user account",
            500,
            error.message,
          ),
        );
      }
    }
  },
);

export default router;
