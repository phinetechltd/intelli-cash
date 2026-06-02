import cors from "cors";
import express from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { env } from "./config/env";
import { analyticsRouter } from "./routes/analytics";
import { adminRouter } from "./routes/admin";
import { apiKeysRouter } from "./routes/api-keys";
import { auditRouter } from "./routes/audit";
import { authRouter } from "./routes/auth";
import { groupsRouter } from "./routes/groups";
import { integrationsRouter } from "./routes/integrations";
import { intelliStoreRouter } from "./routes/intelli-store";
import { intelliAuditRouter } from "./routes/intelliaudit";
import { notificationsRouter } from "./routes/notifications";
import { partnerPortalRouter } from "./routes/partner-portal";
import { paymentsRouter } from "./routes/payments";
import { reportsRouter } from "./routes/reports";
import { uploadsRouter } from "./routes/uploads";
import { webhooksRouter } from "./routes/webhooks";
import { ApiHttpError, fail, ok } from "./lib/http";
import { ensureUploadDirectory, uploadRoot } from "./lib/uploads";
import { requestTracingMiddleware } from "./middleware/request-tracing";

function isAllowedCorsOrigin(origin: string) {
  const configuredOrigins = env.WEB_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const isConfiguredOrigin = configuredOrigins.includes(origin);
  const isLocalDevOrigin =
    env.NODE_ENV !== "production" &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

  return isConfiguredOrigin || isLocalDevOrigin;
}

export function createApp(options: { includeNotFoundHandler?: boolean } = {}) {
  const app = express();
  ensureUploadDirectory();

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(requestTracingMiddleware);
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => {
    ok(res, { status: "ok", service: "intellicash-api" });
  });

  app.use("/uploads", express.static(uploadRoot, { maxAge: "7d" }));

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1", uploadsRouter);
  app.use("/api/v1", apiKeysRouter);
  app.use("/api/v1", adminRouter);
  app.use("/api/v1", groupsRouter);
  app.use("/api/v1", analyticsRouter);
  app.use("/api/v1", reportsRouter);
  app.use("/api/v1", auditRouter);
  app.use("/api/v1", intelliAuditRouter);
  app.use("/api/v1", integrationsRouter);
  app.use("/api/v1", notificationsRouter);
  app.use("/api/v1", intelliStoreRouter);
  app.use("/api/v1", partnerPortalRouter);
  app.use("/api/v1", paymentsRouter);
  app.use("/api/v1", webhooksRouter);

  if (options.includeNotFoundHandler ?? true) {
    app.use((_req, _res, next) => {
      next(new ApiHttpError(404, "NOT_FOUND", "Route not found."));
    });
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      return fail(
        res,
        new ApiHttpError(400, "VALIDATION_ERROR", "Request validation failed.", error.flatten())
      );
    }

    return fail(res, error);
  });

  return app;
}
