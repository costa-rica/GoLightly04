import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import { createSequelize, getDefaultSequelize, initializeModels, provisionDatabase } from "@golightly/db-models";
import { logger } from "../config/logger";
import { readApiEnv } from "../config/env";
import { getDb } from "../lib/db";

export async function onStartUp(): Promise<void> {
  const env = readApiEnv();
  const bootSequelize = createSequelize({ role: "boot" });
  initializeModels(bootSequelize);
  await provisionDatabase(bootSequelize);
  logger.info("Database provisioned");

  for (const dirName of [
    "meditation_soundfiles",
    "eleven_labs_audio_files",
    "prerecorded_audio",
    "backups_db",
  ]) {
    fs.mkdirSync(path.join(env.PATH_PROJECT_RESOURCES, dirName), { recursive: true });
  }
  logger.info("Project resource directories ensured");

  const { User } = getDb();
  const existingAdmin = await User.findOne({ where: { email: env.ADMIN_EMAIL } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
    await User.create({
      email: env.ADMIN_EMAIL,
      password: passwordHash,
      isAdmin: true,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      authProvider: "local",
    });
    logger.info("Admin user created");
  }
}
