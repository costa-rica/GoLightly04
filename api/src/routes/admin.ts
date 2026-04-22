import { Router } from "express";
import { Op } from "sequelize";
import { getDb } from "../lib/db";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError } from "../lib/errors";
import { requireAdmin } from "../middleware/auth";
import { deleteMeditationCascade } from "../services/meditations/deleteMeditationCascade";
import { notifyWorker } from "../services/workerClient";

async function getOrCreateBenevolentUser() {
  const { User } = getDb();
  const email = "benevolent.system@golightly.local";
  const [user] = await User.findOrCreate({
    where: { email },
    defaults: {
      email,
      password: null,
      authProvider: "local",
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      isAdmin: false,
    },
  });
  return user;
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
        const benevolentUser = await getOrCreateBenevolentUser();
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
      const { Meditation } = getDb();
      const meditations = await Meditation.findAll({ order: [["createdAt", "DESC"]] });
      res.json({ meditations });
    }),
  );

  router.delete(
    "/meditations/:id",
    asyncHandler(async (req, res) => {
      const meditationId = Number(req.params.id);
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
