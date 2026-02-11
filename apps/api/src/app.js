import express from "express";
import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import containerRoutes from "./routes/containerRoutes.js";
import mediaRoutes from "./routes/mediaRoutes.js";
import downloadRoutes from "./routes/downloadRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import sslRoutes from "./routes/sslRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import appsRoutes from "./routes/appsRoutes.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  );
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan("combined"));

  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1500,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "arknas-api",
      timestamp: new Date().toISOString(),
      version: "0.2.0"
    });
  });

  app.get("/api/meta", (_req, res) => {
    res.json({
      name: "ArkNAS Hub API",
      version: "0.2.0",
      features: [
        "auth",
        "dashboard",
        "docker",
        "jellyfin",
        "qbittorrent",
        "ssl-management",
        "audit-log",
        "app-center",
        "app-task-center"
      ]
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/containers", containerRoutes);
  app.use("/api/media", mediaRoutes);
  app.use("/api/downloads", downloadRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/ssl", sslRoutes);
  app.use("/api/system", systemRoutes);
  app.use("/api/apps", appsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
