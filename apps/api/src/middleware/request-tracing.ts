import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const traceHeaderCandidates = ["x-request-id", "x-correlation-id"] as const;

function sanitizeTraceId(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (typeof rawValue !== "string") return null;

  const cleaned = rawValue.trim().replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, 96);
  return cleaned.length >= 8 ? cleaned : null;
}

export function traceIdFromResponse(res: Response) {
  return typeof res.locals.traceId === "string" ? res.locals.traceId : undefined;
}

function shouldWriteTraceLogs() {
  return process.env.NODE_ENV !== "test";
}

export function requestTracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId =
    traceHeaderCandidates
      .map((header) => sanitizeTraceId(req.headers[header]))
      .find((value): value is string => Boolean(value)) ?? randomUUID();
  const startedAt = process.hrtime.bigint();

  res.locals.traceId = traceId;
  res.setHeader("X-Request-Id", traceId);

  res.on("finish", () => {
    if (!shouldWriteTraceLogs()) return;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    const logPayload = {
      level,
      event: "api.request.completed",
      traceId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.user?.id,
      role: req.user?.role,
      apiKeyId: req.apiKeyId
    };

    const logLine = JSON.stringify(logPayload);
    if (level === "error") {
      console.error(logLine);
    } else if (level === "warn") {
      console.warn(logLine);
    } else {
      console.info(logLine);
    }
  });

  next();
}
