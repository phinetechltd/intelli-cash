import type { Response } from "express";
import { traceIdFromResponse } from "../middleware/request-tracing";

export class ApiHttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  const traceId = traceIdFromResponse(res);
  const responseMeta = { ...(traceId ? { traceId } : {}), ...(meta ?? {}) };
  return res.json({ data, ...(Object.keys(responseMeta).length > 0 ? { meta: responseMeta } : {}) });
}

export function fail(res: Response, error: unknown) {
  const traceId = traceIdFromResponse(res);

  if (error instanceof ApiHttpError) {
    logApiFailure(error.status, error.code, error.message, traceId, error.details);
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        ...(traceId ? { traceId } : {})
      }
    });
  }

  logApiFailure(500, "INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown API error", traceId, error);
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred.",
      ...(traceId ? { traceId } : {})
    }
  });
}

function logApiFailure(status: number, code: string, message: string, traceId?: string, details?: unknown) {
  if (process.env.NODE_ENV === "test") return;

  const level = status >= 500 ? "error" : "warn";
  const payload = {
    level,
    event: "api.error",
    traceId,
    statusCode: status,
    code,
    message,
    ...(details instanceof Error
      ? { stack: details.stack }
      : status >= 500 && details
        ? { details: String(details) }
        : {})
  };
  const logLine = JSON.stringify(payload);
  if (level === "error") {
    console.error(logLine);
  } else {
    console.warn(logLine);
  }
}
