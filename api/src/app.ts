import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { logger } from "./config/logger";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { buildAdminRouter } from "./routes/admin";
import { buildDatabaseRouter } from "./routes/database";
import { buildHealthRouter } from "./routes/health";
import { buildMeditationsRouter } from "./routes/meditations";
import { buildSoundsRouter } from "./routes/sounds";
import { buildUsersRouter } from "./routes/users";

export function buildApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    morgan("tiny", {
      stream: {
        write: (message) => logger.http(message.trim()),
      },
    }),
  );

  app.use(buildHealthRouter());
  app.use("/users", buildUsersRouter());
  app.use("/sounds", buildSoundsRouter());
  app.use("/meditations", buildMeditationsRouter());
  app.use("/admin", buildAdminRouter());
  app.use("/database", buildDatabaseRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
