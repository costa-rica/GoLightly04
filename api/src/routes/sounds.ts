import fs from "fs/promises";
import path from "path";
import { Router } from "express";
import { getDb } from "../lib/db";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { ensureString } from "../middleware/validate";
import { getPrerecordedAudioPath } from "../lib/projectPaths";
import { probeDurationSeconds } from "../lib/audioMetadata";
import type { SoundFile as SoundFileResponse } from "@golightly/shared-types";
import type { SoundFile } from "@golightly/db-models";

function normalizeSoundName(name: string) {
  return name.trim().toLowerCase();
}

function serializeSoundFile(sound: SoundFile): SoundFileResponse {
  return {
    id: sound.id,
    name: sound.name,
    description: sound.description ?? null,
    filename: sound.filename,
    duration_seconds: sound.durationSeconds ?? null,
  };
}

function parseNullableDescription(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "description must be a string or null");
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseNullableDuration(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "duration_seconds must be a whole non-negative number or null",
    );
  }

  return value;
}

export function buildSoundsRouter(): Router {
  const router = Router();

  router.get(
    "/sound_files",
    asyncHandler(async (_req, res) => {
      const { SoundFile } = getDb();
      const soundFiles = await SoundFile.findAll({ order: [["id", "ASC"]] });
      res.json({
        soundFiles: soundFiles.map(serializeSoundFile),
      });
    }),
  );

  router.post(
    "/upload",
    requireAdmin,
    upload.single("file"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new AppError(400, "VALIDATION_ERROR", "file is required");
      }

      const originalName = ensureString(req.body.name || req.file.originalname, "name");
      const description =
        typeof req.body.description === "string" && req.body.description.trim()
          ? req.body.description.trim()
          : null;
      const { SoundFile } = getDb();
      const existingSounds = await SoundFile.findAll();
      const duplicate = existingSounds.find(
        (sound) => normalizeSoundName(sound.name) === normalizeSoundName(originalName),
      );
      if (duplicate) {
        throw new AppError(
          409,
          "DUPLICATE_SOUND_NAME",
          `A sound named "${duplicate.name}" already exists`,
        );
      }

      const filename = `${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;
      const filePath = getPrerecordedAudioPath(filename);

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, req.file.buffer);
      const durationSeconds = await probeDurationSeconds(filePath);

      const soundFile = await SoundFile.create({
        name: originalName,
        description,
        filename,
        durationSeconds,
      });

      res.status(201).json({
        message: "Sound file uploaded successfully",
        soundFile: serializeSoundFile(soundFile),
      });
    }),
  );

  router.patch(
    "/sound_file/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError(400, "VALIDATION_ERROR", "id must be a positive integer");
      }

      const { SoundFile } = getDb();
      const soundFile = await SoundFile.findByPk(id);
      if (!soundFile) {
        throw new AppError(404, "NOT_FOUND", "Sound file not found");
      }

      const updates: {
        name?: string;
        description?: string | null;
        durationSeconds?: number | null;
      } = {};

      if (Object.prototype.hasOwnProperty.call(req.body, "name")) {
        updates.name = ensureString(req.body.name, "name");
      }

      const description = parseNullableDescription(req.body.description);
      if (description !== undefined) {
        updates.description = description;
      }

      const durationSeconds = parseNullableDuration(req.body.duration_seconds);
      if (durationSeconds !== undefined) {
        updates.durationSeconds = durationSeconds;
      }

      if (updates.name !== undefined) {
        const existingSounds = await SoundFile.findAll();
        const duplicate = existingSounds.find(
          (sound) =>
            sound.id !== soundFile.id &&
            normalizeSoundName(sound.name) === normalizeSoundName(updates.name ?? ""),
        );
        if (duplicate) {
          throw new AppError(
            409,
            "DUPLICATE_SOUND_NAME",
            `A sound named "${duplicate.name}" already exists`,
          );
        }
      }

      await soundFile.update(updates);

      res.json({
        message: "Sound file updated",
        soundFile: serializeSoundFile(soundFile),
      });
    }),
  );

  router.delete(
    "/sound_file/:id",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const { SoundFile } = getDb();
      const soundFile = await SoundFile.findByPk(id);
      if (!soundFile) {
        throw new AppError(404, "NOT_FOUND", "Sound file not found");
      }

      await fs.rm(getPrerecordedAudioPath(soundFile.filename), { force: true });
      await soundFile.destroy();

      res.json({
        message: "Sound file deleted",
        soundFileId: id,
      });
    }),
  );

  return router;
}
