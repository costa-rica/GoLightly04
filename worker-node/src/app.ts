import express, { Request, Response } from "express";

import { errorHandler, notFoundHandler } from "./modules/errorHandler";
import meditationsRouter from "./routes/meditations";

export const buildApp = () => {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (req: Request, res: Response) => {
    res.json({
      message: "GoLightly03WorkerNode API",
      status: "running",
      version: "1.0.0",
    });
  });

  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "GoLightly03WorkerNode" });
  });

  app.use("/meditations", meditationsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
