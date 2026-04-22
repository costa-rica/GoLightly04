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

export function buildSoundsRouter(): Router {
  const router = Router();

  router.get(
    "/sound_files",
    asyncHandler(async (_req, res) => {
      const { SoundFile } = getDb();
      const soundFiles = await SoundFile.findAll({ order: [["id", "ASC"]] });
      res.json({
        soundFiles: soundFiles.map((sound) => ({
          id: sound.id,
          name: sound.name,
          description: sound.description ?? undefined,
          filename: sound.filename,
        })),
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
      const filename = `${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;
      const filePath = getPrerecordedAudioPath(filename);

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, req.file.buffer);

      const { SoundFile } = getDb();
      const soundFile = await SoundFile.create({
        name: originalName,
        description,
        filename,
      });

      res.status(201).json({
        message: "Sound file uploaded successfully",
        soundFile: {
          id: soundFile.id,
          name: soundFile.name,
          description: soundFile.description ?? undefined,
          filename: soundFile.filename,
        },
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
