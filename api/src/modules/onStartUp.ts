import { sequelize, User } from "@golightly/db-models";
import { hashPassword } from "./passwordHash";
import logger from "./logger";
import path from "path";
import { mkdir } from "fs/promises";

/**
 * Ensures all required project directories exist, creating them when missing.
 */
export const ensureProjectDirectories = async (): Promise<void> => {
  const pathProjectResources = process.env.PATH_PROJECT_RESOURCES;
  const pathToLogs = process.env.PATH_TO_LOGS;
  const pathMp3Output = process.env.PATH_MP3_OUTPUT;
  const pathMp3SoundFiles = process.env.PATH_MP3_SOUND_FILES;

  const missingVars = [
    ["PATH_PROJECT_RESOURCES", pathProjectResources],
    ["PATH_TO_LOGS", pathToLogs],
    ["PATH_MP3_OUTPUT", pathMp3Output],
    ["PATH_MP3_SOUND_FILES", pathMp3SoundFiles],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables for directory checks: ${missingVars.join(", ")}`,
    );
  }

  const directoriesToEnsure = [
    pathProjectResources!,
    pathToLogs!,
    pathMp3Output!,
    pathMp3SoundFiles!,
  ];

  for (const directoryPath of directoriesToEnsure) {
    await mkdir(directoryPath, { recursive: true });
    logger.info(`Verified directory exists: ${directoryPath}`);
  }
};

/**
 * Checks and creates the database if it doesn't exist
 * Uses Sequelize sync to create all tables based on models
 */
export const checkDatabase = async (): Promise<void> => {
  try {
    logger.info("Checking database connection...");

    // Test database connection
    await sequelize.authenticate();
    logger.info("Database connection established successfully");

    // Sync database (creates tables if they don't exist)
    await sequelize.sync();
    logger.info("Database schema synchronized successfully");
  } catch (error: any) {
    logger.error(`Database check failed: ${error.message}`);
    throw new Error(`Database initialization failed: ${error.message}`);
  }
};

/**
 * Creates an admin user if one doesn't exist
 * Uses EMAIL_USER from environment variables as the admin email
 * Default password is "test"
 */
export const createAdminUser = async (): Promise<void> => {
  try {
    // Validate EMAIL_USER environment variable
    const adminEmail = process.env.EMAIL_USER;

    if (!adminEmail) {
      logger.warn(
        "EMAIL_USER environment variable not set. Skipping admin user creation.",
      );
      return;
    }

    // Normalize email to lowercase
    const normalizedEmail = adminEmail.toLowerCase();

    logger.info(`Checking for admin user: ${normalizedEmail}`);

    // Check if admin user already exists
    const existingUser = await User.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      logger.info(`Admin user already exists: ${normalizedEmail}`);

      // Ensure existing user has admin privileges
      if (!existingUser.isAdmin) {
        await User.update(
          { isAdmin: true },
          { where: { email: normalizedEmail } },
        );
        logger.info(`Updated existing user to admin: ${normalizedEmail}`);
      }

      return;
    }

    // Create admin user with default password "test"
    logger.info(`Creating admin user: ${normalizedEmail}`);
    const hashedPassword = await hashPassword("test");

    await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      isAdmin: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
    });

    logger.info(`Admin user created successfully: ${normalizedEmail}`);
    logger.info(
      `Default password is "test" - please change it after first login`,
    );
  } catch (error: any) {
    logger.error(`Failed to create admin user: ${error.message}`);
    throw new Error(`Admin user creation failed: ${error.message}`);
  }
};

/**
 * Runs all startup checks in sequence
 * This is the main entry point for startup operations
 */
export const runStartupChecks = async (): Promise<void> => {
  logger.info("Running startup checks...");

  try {
    // Ensure required directories exist
    await ensureProjectDirectories();

    // Check and initialize database
    await checkDatabase();

    // Create admin user if needed
    await createAdminUser();

    logger.info("All startup checks completed successfully");
  } catch (error: any) {
    logger.error(`Startup checks failed: ${error.message}`);
    throw error;
  }
};
