import fs from "fs";
import fsPromises from "fs/promises";
import { Op } from "sequelize";
import { Router } from "express";
import {
  SCRIPT_MAX_BYTES,
  serializeMeditationElementsToScript,
  type GenerateStagedMeditationRequest,
  type MeditationElement,
  type RegenerateMeditationRequest,
} from "@golightly/shared-types";
import { getDb } from "../lib/db";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { ensureString, requireBodyFields } from "../middleware/validate";
import { isStreamStart, readStreamToken } from "../lib/meditationAccess";
import { issueStreamToken } from "../lib/authTokens";
import { getProjectResourcePath } from "../lib/projectPaths";
import { notifyWorker, WorkerConflictError } from "../services/workerClient";
import { deleteMeditationCascade } from "../services/meditations/deleteMeditationCascade";
import { createMeditationFromElements } from "../services/meditations/createMeditationFromElements";
import { regenerateMeditationFromScript } from "../services/meditations/regenerateMeditationFromScript";
import { buildSoundFilenameToNameLookup } from "../services/meditations/soundLookup";
import { validateMeditationMetadata } from "../services/meditations/validateMeditationMetadata";
import { createOrRegenerateStagedMeditation } from "../services/meditations/createOrRegenerateStagedMeditation";
import { saveStagedToLibrary } from "../services/meditations/saveStagedToLibrary";
import { assertMeditationAccess } from "../services/meditations/assertMeditationAccess";
import { getDefaultMeditation } from "../services/meditations/defaultMeditation";
import { createScriptMeditation } from "../services/meditations/createScriptMeditation";
import {
  normalizeImportLookup,
  validateImportProvenanceMetadata,
} from "../services/meditations/importProvenance";

export function mapMeditationRecord(
  meditation: any,
  options: {
    isFavorite?: boolean;
    isOwned?: boolean;
    soundFilenameToName?: (filename: string) => string | null;
  } = {},
) {
  return {
    id: meditation.id,
    title: meditation.title,
    description: meditation.description ?? undefined,
    meditationArray: meditation.meditationArray,
    filename: meditation.filename ?? "",
    filePath: meditation.filePath ?? undefined,
    visibility: meditation.visibility,
    stage: meditation.stage ?? "library",
    sourceMode: meditation.sourceMode ?? "spreadsheet",
    scriptSource:
      meditation.scriptSource ??
      serializeMeditationElementsToScript(
        meditation.meditationArray ?? [],
        options.soundFilenameToName ?? (() => null),
      ),
    createdAt: meditation.createdAt instanceof Date ? meditation.createdAt.toISOString() : meditation.createdAt,
    updatedAt: meditation.updatedAt instanceof Date ? meditation.updatedAt.toISOString() : meditation.updatedAt,
    listenCount: meditation.listenCount,
    durationSeconds: meditation.durationSeconds ?? null,
    durationSecondsTalking: meditation.durationSecondsTalking ?? null,
    durationSecondsPause: meditation.durationSecondsPause ?? null,
    durationSecondsSound: meditation.durationSecondsSound ?? null,
    status: meditation.status,
    isFavorite: options.isFavorite,
    isOwned: options.isOwned,
    ownerUserId: meditation.userId,
    isDefault: meditation.isDefault === true,
    importMetadata: meditation.metadata ?? {},
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

async function loadSoundFilenameToNameLookup() {
  const { SoundFile } = getDb();
  const soundFiles = await SoundFile.findAll();
  return buildSoundFilenameToNameLookup(soundFiles);
}

function safeDownloadFilename(title: string | null | undefined, id: number): string {
  const base = (title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/[._ -]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${base || `meditation-${id}`}.mp3`;
}

function restoredResourcePath(filePath: string): string | null {
  const parts = filePath.split(/[\\/]+/).filter(Boolean);
  const resourceIndex = parts.lastIndexOf("meditation_soundfiles");
  if (resourceIndex === -1) {
    return null;
  }

  return getProjectResourcePath(...parts.slice(resourceIndex));
}

async function loadMeditationAudioFile(filePath: string): Promise<{
  filePath: string;
  stat: Awaited<ReturnType<typeof fsPromises.stat>>;
}> {
  const candidates = [filePath, restoredResourcePath(filePath)].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const candidate of new Set(candidates)) {
    try {
      const stat = await fsPromises.stat(candidate);
      if (stat.isFile()) {
        return { filePath: candidate, stat };
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new AppError(409, "MEDITATION_NOT_READY", "Meditation audio is not ready");
}

function buildImportLookupWhere(opts: {
  userId: number;
  sourceUserKey: string;
  sourceFile: string;
}) {
  return {
    userId: opts.userId,
    metadata: {
      [Op.contains]: {
        sourceUserKey: opts.sourceUserKey,
        sourceFile: opts.sourceFile,
      },
    },
  } as any;
}

export function buildMeditationsRouter(): Router {
  const router = Router();

  router.post(
    "/create",
    requireAuth,
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["title", "visibility", "meditationArray"]);
      const { title, description, visibility } = validateMeditationMetadata(req.body);
      if (!Array.isArray(req.body.meditationArray) || req.body.meditationArray.length === 0) {
        throw new AppError(400, "VALIDATION_ERROR", "meditationArray must contain at least one element");
      }

      const meditationArray = req.body.meditationArray as MeditationElement[];
      const meditation = await createMeditationFromElements({
        userId: req.user!.id,
        title,
        description,
        visibility,
        elements: meditationArray,
        sourceMode: "spreadsheet",
        scriptSource: null,
      });

      try {
        await notifyWorker(meditation.id, "intake");
      } catch (error) {
        if (error instanceof WorkerConflictError) {
          res.status(409).json({
            error: "Meditation saved but processing is temporarily unavailable. Please retry shortly.",
          });
          return;
        }
        throw error;
      }

      res.status(201).json({
        message: "Meditation created successfully",
        queueId: meditation.id,
        filePath: "",
      });
    }),
  );

  router.post(
    "/create/script",
    requireAuth,
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["title", "visibility", "script"]);
      const { title, description, visibility } = validateMeditationMetadata(req.body);
      const script = ensureString(req.body.script, "script");

      const meditation = await createScriptMeditation({
        userId: req.user!.id,
        title,
        description,
        visibility,
        script,
      });

      try {
        await notifyWorker(meditation.id, "intake");
      } catch (error) {
        if (error instanceof WorkerConflictError) {
          res.status(409).json({
            error: "Meditation saved but processing is temporarily unavailable. Please retry shortly.",
          });
          return;
        }
        throw error;
      }

      res.status(201).json({
        message: "Meditation created successfully",
        queueId: meditation.id,
        filePath: "",
      });
    }),
  );

  router.get(
    "/default",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const meditation = await getDefaultMeditation();
      const soundFilenameToName = await loadSoundFilenameToNameLookup();
      res.json({
        meditation: mapMeditationRecord(meditation, {
          isOwned: req.user?.id === meditation.userId,
          soundFilenameToName,
        }),
      });
    }),
  );

  router.get(
    "/imports",
    requireAuth,
    asyncHandler(async (req, res) => {
      const sourceUserKey = normalizeImportLookup(req.query.sourceUserKey, "sourceUserKey");
      const sourceFile = normalizeImportLookup(req.query.sourceFile, "sourceFile");
      const { Meditation } = getDb();
      const meditation = await Meditation.findOne({
        where: buildImportLookupWhere({ userId: req.user!.id, sourceUserKey, sourceFile }),
        order: [["createdAt", "DESC"]],
      });

      if (!meditation) {
        res.json({ duplicate: false });
        return;
      }

      const soundFilenameToName = await loadSoundFilenameToNameLookup();
      res.json({
        duplicate: true,
        meditation: mapMeditationRecord(meditation, {
          isOwned: true,
          soundFilenameToName,
        }),
      });
    }),
  );

  router.post(
    "/imports",
    requireAuth,
    asyncHandler(async (req, res) => {
      requireBodyFields(req.body, ["title", "script", "importMetadata"]);
      const { title, description } = validateMeditationMetadata({
        ...req.body,
        visibility: "private",
      });
      const script = ensureString(req.body.script, "script");
      const importMetadata = validateImportProvenanceMetadata(req.body.importMetadata);
      const overwrite = req.body.overwrite === true;
      const { Meditation } = getDb();

      const existing = await Meditation.findOne({
        where: buildImportLookupWhere({
          userId: req.user!.id,
          sourceUserKey: importMetadata.sourceUserKey,
          sourceFile: importMetadata.sourceFile,
        }),
        order: [["createdAt", "DESC"]],
      });

      const soundFilenameToName = await loadSoundFilenameToNameLookup();
      if (existing && !overwrite) {
        res.status(200).json({
          action: "duplicate",
          meditation: mapMeditationRecord(existing, {
            isOwned: true,
            soundFilenameToName,
          }),
        });
        return;
      }

      const previousMeditationId = existing?.id;
      if (existing && overwrite) {
        await deleteMeditationCascade(existing.id);
      }

      const meditation = await createScriptMeditation({
        userId: req.user!.id,
        title,
        description,
        visibility: "private",
        script,
        metadata: importMetadata,
      });
      try {
        await notifyWorker(meditation.id, "intake");
      } catch (error) {
        if (error instanceof WorkerConflictError) {
          res.status(409).json({
            error: "Meditation saved but processing is temporarily unavailable. Please retry shortly.",
          });
          return;
        }
        throw error;
      }

      res.status(existing ? 200 : 201).json({
        action: existing ? "overwritten" : "created",
        meditation: mapMeditationRecord(meditation, {
          isOwned: true,
          soundFilenameToName,
        }),
        ...(previousMeditationId ? { previousMeditationId } : {}),
      });
    }),
  );

  router.get(
    "/staging",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { Meditation, SoundFile } = getDb();
      const meditation = await Meditation.findOne({
        where: { userId: req.user!.id, stage: "staged" },
        order: [["updatedAt", "DESC"]],
      });
      if (!meditation) {
        throw new AppError(404, "NO_STAGED_MEDITATION", "No staged meditation exists");
      }
      const soundFilenameToName = buildSoundFilenameToNameLookup(await SoundFile.findAll());
      res.json({
        meditation: mapMeditationRecord(meditation, {
          isOwned: req.user!.id === meditation.userId,
          soundFilenameToName,
        }),
      });
    }),
  );

  router.post(
    "/staging/generate",
    requireAuth,
    asyncHandler(async (req, res) => {
      let meditation;
      try {
        meditation = await createOrRegenerateStagedMeditation({
          userId: req.user!.id,
          payload: req.body as GenerateStagedMeditationRequest,
        });
      } catch (error) {
        if (error instanceof WorkerConflictError) {
          res.status(409).json({
            error: "Meditation saved but processing is temporarily unavailable. Please retry shortly.",
          });
          return;
        }
        throw error;
      }
      const soundFilenameToName = await loadSoundFilenameToNameLookup();
      res.status(201).json({
        message: "Staged meditation generation started",
        meditation: mapMeditationRecord(meditation, { isOwned: true, soundFilenameToName }),
      });
    }),
  );

  router.post(
    "/staging/save-to-library",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditation = await saveStagedToLibrary({
        userId: req.user!.id,
        metadata: req.body,
      });
      const soundFilenameToName = await loadSoundFilenameToNameLookup();
      res.json({
        message: "Meditation saved to library",
        meditation: mapMeditationRecord(meditation, { isOwned: true, soundFilenameToName }),
      });
    }),
  );

  router.get(
    "/all",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const { ContractUserMeditation, Meditation, SoundFile } = getDb();
      const stageClause = { stage: "library", isDefault: false };
      const where = req.user?.isAdmin
        ? stageClause
        : req.user
          ? {
              ...stageClause,
              [Op.or]: [
                { visibility: "public", status: "complete" },
                { userId: req.user.id },
              ],
            }
          : { ...stageClause, visibility: "public", status: "complete" };

      const meditations = await Meditation.findAll({
        where,
        order: [["createdAt", "DESC"]],
      });
      const soundFilenameToName = buildSoundFilenameToNameLookup(await SoundFile.findAll());

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
            soundFilenameToName,
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
      assertMeditationAccess(meditation, req.user, "read");
      const soundFilenameToName = await loadSoundFilenameToNameLookup();
      res.json({
        meditation: mapMeditationRecord(meditation, {
          isOwned: req.user?.id === meditation.userId,
          soundFilenameToName,
        }),
      });
    }),
  );

  router.get(
    "/:id/stream-token",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      assertMeditationAccess(meditation, req.user, "stream");
      res.json({ token: issueStreamToken(meditation.id, req.user!.id, req.user!.isAdmin) });
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
      assertMeditationAccess(
        meditation,
        req.user ?? (tokenPayload ? { id: tokenPayload.userId, isAdmin: tokenPayload.isAdmin } : undefined),
        "stream",
      );
      if (!meditation.filePath) {
        throw new AppError(409, "MEDITATION_NOT_READY", "Meditation audio is not ready");
      }

      const audioFile = await loadMeditationAudioFile(meditation.filePath);
      const filePath = audioFile.filePath;
      const fileSize = Number(audioFile.stat.size);
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

  router.get(
    "/:id/download",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      assertMeditationAccess(meditation, req.user, "stream");
      if (!meditation.filePath) {
        throw new AppError(409, "MEDITATION_NOT_READY", "Meditation audio is not ready");
      }

      const audioFile = await loadMeditationAudioFile(meditation.filePath);
      res.set({
        "Content-Length": String(Number(audioFile.stat.size)),
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${safeDownloadFilename(meditation.title, meditation.id)}"`,
      });
      fs.createReadStream(audioFile.filePath).pipe(res);
    }),
  );

  router.post(
    "/favorite/:meditationId/:trueOrFalse",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditationId = Number(req.params.meditationId);
      const shouldFavorite = req.params.trueOrFalse === "true";
      const meditation = await loadMeditationOrThrow(meditationId);
      assertMeditationAccess(meditation, req.user, "favorite");
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
      assertMeditationAccess(meditation, req.user, "mutate");

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
      const soundFilenameToName = await loadSoundFilenameToNameLookup();

      res.json({
        message: "Meditation updated",
        meditation: mapMeditationRecord(meditation, { isOwned: true, soundFilenameToName }),
      });
    }),
  );

  router.put(
    "/:id/script",
    requireAuth,
    asyncHandler(async (req, res) => {
      const body = req.body as RegenerateMeditationRequest;
      const script = ensureString(body.script, "script");
      if (Buffer.byteLength(script, "utf8") > SCRIPT_MAX_BYTES) {
        throw new AppError(400, "VALIDATION_ERROR", `script must be ${SCRIPT_MAX_BYTES} bytes or less`);
      }

      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      assertMeditationAccess(meditation, req.user, "mutate");

      const updated = await regenerateMeditationFromScript({
        meditationId: meditation.id,
        script,
      });
      try {
        await notifyWorker(updated.id, "intake");
      } catch (error) {
        if (error instanceof WorkerConflictError) {
          res.status(409).json({
            error: "Meditation saved but processing is temporarily unavailable. Please retry shortly.",
          });
          return;
        }
        throw error;
      }
      const soundFilenameToName = await loadSoundFilenameToNameLookup();

      res.json({
        message: "Meditation regeneration started",
        meditation: mapMeditationRecord(updated, { isOwned: true, soundFilenameToName }),
      });
    }),
  );

  router.delete(
    "/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
      const meditation = await loadMeditationOrThrow(Number(req.params.id));
      assertMeditationAccess(meditation, req.user, "mutate");

      await deleteMeditationCascade(meditation.id);
      res.json({
        message: "Meditation deleted",
        meditationId: meditation.id,
      });
    }),
  );

  return router;
}
