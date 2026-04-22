import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { Op } from "sequelize";
import { Router } from "express";
import type { MeditationElement } from "@golightly/shared-types";
import { getDb } from "../lib/db";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { ensureString, requireBodyFields } from "../middleware/validate";
import { canAccessMeditation, isStreamStart, readStreamToken } from "../lib/meditationAccess";
import { getPrerecordedAudioPath } from "../lib/projectPaths";
import { issueStreamToken } from "../lib/authTokens";
import { notifyWorker } from "../services/workerClient";
import { deleteMeditationCascade } from "../services/meditations/deleteMeditationCascade";

function deriveType(element: MeditationElement): "text" | "sound" | "pause" {
  if (element.text) return "text";
  if (element.sound_file) return "sound";
  if (element.pause_duration) return "pause";
  throw new AppError(400, "VALIDATION_ERROR", "Unable to derive meditation element type");
}

function mapMeditationRecord(
  meditation: any,
  options: { isFavorite?: boolean; isOwned?: boolean } = {},
) {
  return {
    id: meditation.id,
    title: meditation.title,
    description: meditation.description ?? undefined,
    meditationArray: meditation.meditationArray,
    filename: meditation.filename ?? "",
    filePath: meditation.filePath ?? undefined,
    visibility: meditation.visibility,
    createdAt: meditation.createdAt instanceof Date ? meditation.createdAt.toISOString() : meditation.createdAt,
    updatedAt: meditation.updatedAt instanceof Date ? meditation.updatedAt.toISOString() : meditation.updatedAt,
    listenCount: meditation.listenCount,
    status: meditation.status,
    isFavorite: options.isFavorite,
    isOwned: options.isOwned,
    ownerUserId: meditation.userId,
  };
}

async function loadMeditationOrThrow(id: number) {
  const { Meditation } = getDb();
  const meditation = await Meditation.findByPk(id);
  if (!meditation) {
    throw new AppError(404, "NOT_FOUND", "Meditation not found");
  }
  return meditation;
}

export function buildMeditationsRouter(): Router {
  const router = Router();

  router.post(
    "/create",
    requireAuth,
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["title", "visibility", "meditationArray"]);
      const title = ensureString(req.body.title, "title");
      const visibilityRaw = ensureString(req.body.visibility, "visibility");
      if (visibilityRaw !== "public" && visibilityRaw !== "private") {
        throw new AppError(400, "VALIDATION_ERROR", "visibility must be public or private");
      }
      const visibility: "public" | "private" = visibilityRaw;
      const description =
        typeof req.body.description === "string" && req.body.description.trim()
          ? req.body.description.trim()
          : null;
      if (!Array.isArray(req.body.meditationArray) || req.body.meditationArray.length === 0) {
        throw new AppError(400, "VALIDATION_ERROR", "meditationArray must contain at least one element");
      }

      const meditationArray = req.body.meditationArray as MeditationElement[];
      const { sequelize, JobQueue, Meditation } = getDb();
      const meditation = await sequelize.transaction(async (transaction) => {
        const createdMeditation = await Meditation.create(
          {
            userId: req.user!.id,
            title,
            description,
            visibility,
            status: "pending",
            meditationArray: meditationArray.map((element, index) => ({
              ...element,
              sequence: index + 1,
            })),
          },
          { transaction },
        );

        for (const [index, element] of meditationArray.entries()) {
          const type = deriveType(element);
          let status: "pending" | "complete" = type === "text" ? "pending" : "complete";
          let filePath: string | null = null;
          let inputData = "";

          if (type === "text") {
            inputData = JSON.stringify({
              text: element.text,
              voice_id: element.voice_id,
              speed: element.speed,
            });
          } else if (type === "sound") {
            if (!element.sound_file) {
              throw new AppError(400, "VALIDATION_ERROR", "sound_file is required for sound elements");
            }
            filePath = getPrerecordedAudioPath(element.sound_file);
            inputData = JSON.stringify({ sound_file: element.sound_file });
          } else {
            inputData = JSON.stringify({ pause_duration: element.pause_duration });
          }

          await JobQueue.create(
            {
              meditationId: createdMeditation.id,
              sequence: index + 1,
              type,
              inputData,
              status,
              filePath,
              attemptCount: 0,
              lastError: null,
              lastAttemptedAt: null,
            },
            { transaction },
          );
        }

        return createdMeditation;
      });

      void notifyWorker(meditation.id, "intake");

      res.status(201).json({
        message: "Meditation created successfully",
        queueId: meditation.id,
        filePath: "",
      });
    }),
  );

  router.get(
    "/all",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const { ContractUserMeditation, Meditation } = getDb();
      const where = req.user
        ? {
            [Op.or]: [{ visibility: "public" }, { userId: req.user.id }],
          }
        : { visibility: "public" };

      const meditations = await Meditation.findAll({
        where,
        order: [["createdAt", "DESC"]],
      });

      let favorites = new Set<number>();
      if (req.user) {
        const favoriteRows = await ContractUserMeditation.findAll({
          where: { userId: req.user.id },
        });
        favorites = new Set(favoriteRows.map((row) => row.meditationId));
      }

      res.json({
        meditations: meditations.map((meditation) =>
          mapMeditationRecord(meditation, {
            isFavorite: favorites.has(meditation.id),
            isOwned: req.user?.id === meditation.userId,
          }),
        ),
      });
    }),
  );

  router.get(
    "/:id",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      if (!canAccessMeditation(meditation, req)) {
        throw new AppError(403, "FORBIDDEN", "You do not have access to this meditation");
      }
      res.json({ meditation: mapMeditationRecord(meditation, { isOwned: req.user?.id === meditation.userId }) });
    }),
  );

  router.get(
    "/:id/stream-token",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      if (!canAccessMeditation(meditation, req)) {
        throw new AppError(403, "FORBIDDEN", "You do not have access to this meditation");
      }
      res.json({ token: issueStreamToken(meditation.id, req.user!.id) });
    }),
  );

  router.get(
    "/:id/stream",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      const tokenPayload = readStreamToken(req);
      if (tokenPayload && tokenPayload.meditationId !== meditation.id) {
        throw new AppError(401, "AUTH_FAILED", "Invalid stream token");
      }
      if (!canAccessMeditation(meditation, req)) {
        throw new AppError(403, "FORBIDDEN", "You do not have access to this meditation");
      }
      if (!meditation.filePath) {
        throw new AppError(409, "MEDITATION_NOT_READY", "Meditation audio is not ready");
      }

      const filePath = meditation.filePath;
      const stat = await fsPromises.stat(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (isStreamStart(range)) {
        meditation.listenCount += 1;
        await meditation.save();
      }

      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) {
          throw new AppError(416, "INVALID_RANGE", "Invalid Range header");
        }
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : fileSize - 1;
        const chunkSize = end - start + 1;
        res.status(206).set({
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "audio/mpeg",
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.set({
        "Content-Length": String(fileSize),
        "Content-Type": "audio/mpeg",
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath).pipe(res);
    }),
  );

  router.post(
    "/favorite/:meditationId/:trueOrFalse",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditationId = Number(req.params.meditationId);
      const shouldFavorite = req.params.trueOrFalse === "true";
      await loadMeditationOrThrow(meditationId);
      const { ContractUserMeditation } = getDb();

      if (shouldFavorite) {
        await ContractUserMeditation.findOrCreate({
          where: {
            userId: req.user!.id,
            meditationId,
          },
        });
      } else {
        await ContractUserMeditation.destroy({
          where: {
            userId: req.user!.id,
            meditationId,
          },
        });
      }

      res.json({
        message: shouldFavorite ? "Meditation favorited" : "Meditation unfavorited",
        meditationId,
        favorite: shouldFavorite,
      });
    }),
  );

  router.patch(
    "/update/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      if (req.user!.id !== meditation.userId) {
        throw new AppError(403, "FORBIDDEN", "You do not own this meditation");
      }

      if (req.body.title !== undefined) {
        meditation.title = ensureString(req.body.title, "title");
      }
      if (req.body.description !== undefined) {
        meditation.description =
          typeof req.body.description === "string" && req.body.description.trim()
            ? req.body.description.trim()
            : null;
      }
      if (req.body.visibility !== undefined) {
        const visibilityRaw = ensureString(req.body.visibility, "visibility");
        if (visibilityRaw !== "public" && visibilityRaw !== "private") {
          throw new AppError(400, "VALIDATION_ERROR", "visibility must be public or private");
        }
        meditation.visibility = visibilityRaw;
      }
      await meditation.save();

      res.json({
        message: "Meditation updated",
        meditation: mapMeditationRecord(meditation, { isOwned: true }),
      });
    }),
  );

  router.delete(
    "/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      if (req.user!.id !== meditation.userId && !req.user!.isAdmin) {
        throw new AppError(403, "FORBIDDEN", "You cannot delete this meditation");
      }

      await deleteMeditationCascade(meditation.id);
      res.json({
        message: "Meditation deleted",
        meditationId: meditation.id,
      });
    }),
  );

  return router;
}
