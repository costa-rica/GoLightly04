import { Router } from "express";
import { Op } from "sequelize";
import type { AdminMeditation } from "@golightly/shared-types";
import { getDb } from "../lib/db";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { deleteMeditationCascade } from "../services/meditations/deleteMeditationCascade";
import { notifyWorker } from "../services/workerClient";
import {
  BENEVOLENT_USER_EMAIL,
  findBenevolentUser,
} from "../services/users/findBenevolentUser";
import { assertAdminMeditationMutable } from "../services/meditations/assertAdminMeditationMutable";
import { ensureString } from "../middleware/validate";
import { logger } from "../config/logger";
import { setDefaultMeditation } from "../services/meditations/defaultMeditation";

const ADMIN_MEDITATION_METADATA_FIELDS = ["title", "description", "visibility"] as const;

function serializeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function serializeAdminMeditationRow(
  meditation: any,
  benevolentUserId: number | null,
): AdminMeditation {
  const ownerEmail = meditation.User?.email ?? meditation.user?.email;
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
    scriptSource: meditation.scriptSource ?? undefined,
    createdAt: serializeDate(meditation.createdAt),
    updatedAt: serializeDate(meditation.updatedAt),
    listenCount: meditation.listenCount,
    durationSeconds: meditation.durationSeconds ?? null,
    durationSecondsTalking: meditation.durationSecondsTalking ?? null,
    durationSecondsPause: meditation.durationSecondsPause ?? null,
    durationSecondsSound: meditation.durationSecondsSound ?? null,
    status: meditation.status,
    ownerUserId: meditation.userId,
    isDefault: meditation.isDefault === true,
    importMetadata: meditation.metadata ?? {},
    ownerEmail,
    isBenevolentOwned: benevolentUserId !== null && meditation.userId === benevolentUserId,
  };
}

function normalizeOptionalDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", "description must be a string");
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeVisibility(value: unknown): "public" | "private" {
  const visibility = ensureString(value, "visibility");
  if (visibility !== "public" && visibility !== "private") {
    throw new AppError(400, "VALIDATION_ERROR", "visibility must be public or private");
  }
  return visibility;
}

export function buildAdminRouter(): Router {
  const router = Router();
  router.use(requireAdmin);

  router.get(
    "/users",
    asyncHandler(async (_req, res) => {
      const { Meditation, User } = getDb();
      const users = await User.findAll({ order: [["id", "ASC"]] });
      const publicCounts = await Meditation.findAll({
        attributes: ["userId"],
        where: { visibility: "public" },
      });
      const publicUserIds = new Set(publicCounts.map((row) => row.userId));
      res.json({
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          authProvider: user.authProvider,
          isEmailVerified: user.isEmailVerified,
          emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
          isAdmin: user.isAdmin,
          hasPublicMeditations: publicUserIds.has(user.id),
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        })),
      });
    }),
  );

  router.delete(
    "/users/:id",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const savePublicMeditationsAsBenevolentUser =
        req.body?.savePublicMeditationsAsBenevolentUser === true;
      const { Meditation, User } = getDb();
      const user = await User.findByPk(id);
      if (!user) {
        throw new AppError(404, "NOT_FOUND", "User not found");
      }

      const meditations = await Meditation.findAll({ where: { userId: id } });
      if (savePublicMeditationsAsBenevolentUser) {
        const benevolentUser = await findBenevolentUser();
        if (!benevolentUser) {
          throw new AppError(
            409,
            "BENEVOLENT_USER_REQUIRED",
            "The manually registered benevolent_monkey account must exist before public meditations can be reassigned",
          );
        }
        await Meditation.update(
          { userId: benevolentUser.id },
          { where: { userId: id, visibility: "public" } },
        );
        for (const meditation of meditations.filter((item) => item.visibility !== "public")) {
          await deleteMeditationCascade(meditation.id);
        }
      } else {
        for (const meditation of meditations) {
          await deleteMeditationCascade(meditation.id);
        }
      }

      await user.destroy();
      res.json({ message: "User deleted", userId: id });
    }),
  );

  router.get(
    "/meditations",
    asyncHandler(async (_req, res) => {
      const { Meditation, User } = getDb();
      const benevolentUser = await findBenevolentUser();
      const meditations = await Meditation.findAll({
        include: [{ model: User, attributes: ["email"], required: false }],
        order: [["createdAt", "DESC"]],
      });
      res.json({
        meditations: meditations.map((meditation) =>
          serializeAdminMeditationRow(meditation, benevolentUser?.id ?? null),
        ),
      });
    }),
  );

  router.patch(
    "/meditations/:id/metadata",
    asyncHandler(async (req, res) => {
      const meditationId = Number(req.params.id);
      if (!Number.isFinite(meditationId)) {
        throw new AppError(400, "VALIDATION_ERROR", "Meditation id must be numeric");
      }

      const contentType = req.headers["content-type"];
      if (contentType && !req.is("application/json")) {
        throw new AppError(400, "VALIDATION_ERROR", "Request body must be JSON");
      }

      if (
        req.body === undefined ||
        req.body === null ||
        typeof req.body !== "object" ||
        Array.isArray(req.body)
      ) {
        throw new AppError(400, "VALIDATION_ERROR", "Request body must be a JSON object");
      }

      const body = req.body as Record<string, unknown>;
      for (const key of Object.keys(body)) {
        if (!ADMIN_MEDITATION_METADATA_FIELDS.includes(key as typeof ADMIN_MEDITATION_METADATA_FIELDS[number])) {
          throw new AppError(400, "UNKNOWN_FIELD", `Unknown metadata field: ${key}`);
        }
      }

      const hasAtLeastOneField = ADMIN_MEDITATION_METADATA_FIELDS.some((key) => key in body);
      if (!hasAtLeastOneField) {
        throw new AppError(400, "VALIDATION_ERROR", "At least one metadata field must be provided");
      }

      const { Meditation } = getDb();
      const meditation = await Meditation.findByPk(meditationId);
      if (!meditation) {
        throw new AppError(404, "NOT_FOUND", "Meditation not found");
      }

      const benevolentUser = await findBenevolentUser();
      if (!benevolentUser) {
        throw new AppError(
          409,
          "BENEVOLENT_USER_REQUIRED",
          "The manually registered benevolent_monkey account must exist before benevolent meditations can be edited",
        );
      }
      if (meditation.userId !== benevolentUser.id) {
        logger.warn("admin.benevolent_meditation_metadata_update_rejected", {
          reason: "benevolent_owner_required",
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          meditationId: meditation.id,
          targetOwnerUserId: meditation.userId,
        });
        throw new AppError(
          409,
          "BENEVOLENT_OWNER_REQUIRED",
          "Only benevolent-owned meditations can be edited by admins",
        );
      }

      if ((meditation.stage ?? "library") !== "library") {
        logger.warn("admin.benevolent_meditation_metadata_update_rejected", {
          reason: "stage_not_eligible",
          actorId: req.user!.id,
          actorEmail: req.user!.email,
          meditationId: meditation.id,
          stage: meditation.stage ?? "library",
        });
        throw new AppError(
          409,
          "STAGE_NOT_ELIGIBLE",
          "Only library meditations can be edited by admins",
        );
      }

      const updates: {
        title?: string;
        description?: string | null;
        visibility?: "public" | "private";
      } = {};
      if ("title" in body) {
        updates.title = ensureString(body.title, "title");
      }
      if ("description" in body) {
        updates.description = normalizeOptionalDescription(body.description);
      }
      if ("visibility" in body) {
        updates.visibility = normalizeVisibility(body.visibility);
      }

      const previous = {
        title: meditation.title,
        description: meditation.description ?? null,
        visibility: meditation.visibility,
      };

      if (updates.title !== undefined) {
        meditation.title = updates.title;
      }
      if ("description" in updates) {
        meditation.description = updates.description ?? null;
      }
      if (updates.visibility !== undefined) {
        meditation.visibility = updates.visibility;
      }

      await meditation.save();

      logger.info("admin.benevolent_meditation_metadata_update", {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        actorIsAdmin: req.user!.isAdmin,
        meditationId: meditation.id,
        targetOwnerUserId: meditation.userId,
        targetOwnerEmail: BENEVOLENT_USER_EMAIL,
        previous,
        next: {
          title: meditation.title,
          description: meditation.description ?? null,
          visibility: meditation.visibility,
        },
        request: {
          ip: req.ip,
          userAgent: req.headers["user-agent"] ?? null,
        },
        timestamp: new Date().toISOString(),
      });

      res.json({
        message: "Meditation metadata updated",
        meditation: serializeAdminMeditationRow(meditation, benevolentUser.id),
      });
    }),
  );

  router.post(
    "/meditations/:id/set-default",
    asyncHandler(async (req, res) => {
      const meditationId = Number(req.params.id);
      if (!Number.isFinite(meditationId)) {
        throw new AppError(400, "VALIDATION_ERROR", "Meditation id must be numeric");
      }

      const meditation = await setDefaultMeditation(meditationId);
      const benevolentUser = await findBenevolentUser();
      logger.info("admin.default_meditation_set", {
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        meditationId: meditation.id,
        targetOwnerUserId: meditation.userId,
      });

      res.json({
        message: "Default meditation updated",
        meditation: serializeAdminMeditationRow(meditation, benevolentUser?.id ?? null),
      });
    }),
  );

  router.delete(
    "/meditations/:id",
    asyncHandler(async (req, res) => {
      const meditationId = Number(req.params.id);
      const { Meditation } = getDb();
      const meditation = await Meditation.findByPk(meditationId);
      if (!meditation) {
        throw new AppError(404, "NOT_FOUND", "Meditation not found");
      }
      assertAdminMeditationMutable(meditation, "delete");
      await deleteMeditationCascade(meditationId);
      res.json({ message: "Meditation deleted", meditationId });
    }),
  );

  router.get(
    "/queuer",
    asyncHandler(async (_req, res) => {
      const { JobQueue } = getDb();
      const queue = await JobQueue.findAll({ order: [["id", "ASC"]] });
      res.json({
        queue: queue.map((job) => ({
          id: job.id,
          meditationId: job.meditationId,
          sequence: job.sequence,
          type: job.type,
          status: job.status,
          filePath: job.filePath,
          attemptCount: job.attemptCount,
          lastError: job.lastError,
          lastAttemptedAt: job.lastAttemptedAt ? job.lastAttemptedAt.toISOString() : null,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
        })),
      });
    }),
  );

  router.delete(
    "/queuer/:id",
    asyncHandler(async (req, res) => {
      const id = Number(req.params.id);
      const { JobQueue } = getDb();
      const job = await JobQueue.findByPk(id);
      if (!job) {
        throw new AppError(404, "NOT_FOUND", "Queue record not found");
      }
      const { Meditation } = getDb();
      const meditation = await Meditation.findByPk(job.meditationId);
      if (!meditation) {
        throw new AppError(404, "NOT_FOUND", "Meditation not found");
      }
      assertAdminMeditationMutable(meditation, "queue-delete");
      await deleteMeditationCascade(job.meditationId);
      res.json({ message: "Queue record deleted", queueId: id });
    }),
  );

  router.post(
    "/meditations/:id/requeue",
    asyncHandler(async (req, res) => {
      const meditationId = Number(req.params.id);
      const { JobQueue, Meditation } = getDb();
      const meditation = await Meditation.findByPk(meditationId);
      if (!meditation) {
        throw new AppError(404, "NOT_FOUND", "Meditation not found");
      }
      assertAdminMeditationMutable(meditation, "requeue");
      const retryableCount = await JobQueue.count({
        where: {
          meditationId,
          status: { [Op.ne]: "complete" },
        },
      });
      const completedCount = await JobQueue.count({
        where: { meditationId, status: "complete" },
      });
      if (retryableCount === 0 && !(completedCount > 0 && meditation.status !== "complete")) {
        throw new AppError(409, "REQUEUE_NOT_ALLOWED", "Meditation has nothing to requeue");
      }

      if (meditation.status === "failed") {
        meditation.status = "pending";
        await meditation.save();
      }
      void notifyWorker(meditationId, "requeue");
      res.json({ message: "Meditation requeued", meditationId });
    }),
  );

  return router;
}
