import * as bcrypt from 'bcrypt';
import { sequelize, User } from './database';
import logger from './logger';

/**
 * Check if database exists and has users
 * @returns true if database has at least one user, false otherwise
 */
export async function checkDatabase(): Promise<boolean> {
  try {
    logger.info('Checking database status...');

    // Authenticate and sync database (will create if doesn't exist)
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync database to create tables if they don't exist
    await sequelize.sync({ alter: false });
    logger.info('Database tables verified');

    // Check if Users table has any users
    const userCount = await User.count();
    logger.info(`Found ${userCount} user(s) in database`);

    return userCount > 0;
  } catch (error) {
    logger.error('Failed to check database:', error);
    throw new Error('Database check failed');
  }
}

/**
 * Create admin user with credentials from environment variables
 * @returns Created user record
 */
export async function createAdminUser(): Promise<any> {
  try {
    logger.info('Creating admin user...');

    // Validate ADMIN_EMAIL environment variable
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      logger.error('ADMIN_EMAIL environment variable is required to create admin user');
      throw new Error('ADMIN_EMAIL environment variable not set');
    }

    // Hash the default password "test"
    const hashedPassword = await bcrypt.hash('test', 10);

    // Create admin user
    const adminUser = await User.create({
      email: adminEmail,
      password: hashedPassword,
      isEmailVerified: true,
      isAdmin: true,
    });

    logger.info(`Admin user created successfully: ${adminUser.email} (ID: ${adminUser.id})`);
    logger.info('Default password: test');

    return adminUser;
  } catch (error) {
    logger.error('Failed to create admin user:', error);
    throw new Error('Admin user creation failed');
  }
}

/**
 * Validate required environment variables
 */
function validateEnvironmentVariables(): void {
  logger.info('Validating required environment variables...');

  const requiredEnvVars = [
    'PATH_MP3_SOUND_FILES',
    'PATH_QUEUER',
    'PATH_DATABASE',
    'NAME_DB',
  ];

  const missingVars: string[] = [];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
    }
  }

  if (missingVars.length > 0) {
    const errorMsg = `Missing required environment variables: ${missingVars.join(', ')}`;
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  logger.info('All required environment variables are set');
}

/**
 * Initialize application on startup
 * Checks database and creates admin user if needed
 */
export async function initializeApp(): Promise<void> {
  try {
    logger.info('Starting application initialization...');

    // Validate required environment variables
    validateEnvironmentVariables();

    // Check if database has users
    const hasUsers = await checkDatabase();

    if (hasUsers) {
      logger.info('Database has existing users - skipping admin user creation');
    } else {
      logger.info('Database has no users - creating admin user');
      await createAdminUser();
    }

    logger.info('Application initialization complete');
  } catch (error) {
    logger.error('Application initialization failed:', error);
    // Implement async IIFE pattern for early exit to ensure logs flush
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.exit(1);
  }
}
