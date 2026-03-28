import express, { Request, Response } from "express";
import cors from "cors";

import usersRouter from "./routes/users";
import meditationsRouter from "./routes/meditations";
import soundsRouter from "./routes/sounds";
import adminRouter from "./routes/admin";
import databaseRouter from "./routes/database";
import { errorHandler, notFoundHandler } from "./modules/errorHandler";

export const buildApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "GoLightly03API" });
  });

  app.use("/users", usersRouter);
  app.use("/meditations", meditationsRouter);
  app.use("/sounds", soundsRouter);
  app.use("/admin", adminRouter);
  app.use("/database", databaseRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
