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
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  let createdCount = 0;
  let promotedCount = 0;
  for (const email of env.ADMIN_EMAILS) {
    const existingAdmin = await User.findOne({ where: { email } });
    if (!existingAdmin) {
      await User.create({
        email,
        password: passwordHash,
        isAdmin: true,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        authProvider: "local",
      });
      createdCount += 1;
      continue;
    }

    if (!existingAdmin.isAdmin) {
      existingAdmin.isAdmin = true;
      await existingAdmin.save();
      promotedCount += 1;
    }
  }
  logger.info("Admin bootstrap complete", {
    configuredCount: env.ADMIN_EMAILS.length,
    createdCount,
    promotedCount,
  });
}
