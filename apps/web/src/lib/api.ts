const LOCAL_API_BASE_URL = "http://localhost:4000/api/v1";

function normalizeApiBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function fallbackApiBaseUrl() {
  if (typeof window !== "undefined") {
    return isLocalHost(window.location.hostname) ? LOCAL_API_BASE_URL : `${window.location.origin}/api/v1`;
  }

  return LOCAL_API_BASE_URL;
}

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackApiBaseUrl()
);

export class ApiClientError extends Error {
  status: number;
  code: string;
  traceId?: string;
  details?: unknown;
  path?: string;
  method?: string;

  constructor(options: {
    status: number;
    code: string;
    message: string;
    traceId?: string;
    details?: unknown;
    path?: string;
    method?: string;
  }) {
    super(formatErrorMessage(options.message, options.traceId));
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
    this.traceId = options.traceId;
    this.details = options.details;
    this.path = options.path;
    this.method = options.method;
  }
}

type ApiPayload<T = unknown> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    traceId?: string;
  };
};

function createClientTraceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatErrorMessage(message: string, traceId?: string) {
  return traceId ? `${message} (Trace ID: ${traceId})` : message;
}

function requestMethod(init: RequestInit) {
  return (init.method ?? "GET").toUpperCase();
}

function buildHeaders(initHeaders?: HeadersInit, includeJsonContentType = true) {
  const headers = new Headers(initHeaders);
  const traceId = headers.get("X-Request-Id") ?? createClientTraceId();

  headers.set("X-Request-Id", traceId);
  if (includeJsonContentType && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return { headers, traceId };
}

async function readPayload<T>(response: Response) {
  return (await response.json().catch(() => null)) as ApiPayload<T> | null;
}

function responseTraceId(response: Response, payload: ApiPayload | null, fallbackTraceId: string) {
  return payload?.error?.traceId ?? response.headers.get("X-Request-Id") ?? fallbackTraceId;
}

function logClientApiError(error: ApiClientError) {
  if (process.env.NODE_ENV === "test") return;

  console.error("[intellicash-api]", {
    status: error.status,
    code: error.code,
    traceId: error.traceId,
    path: error.path,
    method: error.method,
    details: error.details
  });
}

function createResponseError(
  response: Response,
  payload: ApiPayload | null,
  fallbackTraceId: string,
  path: string,
  method: string,
  fallbackCode: string,
  fallbackMessage: string
) {
  const traceId = responseTraceId(response, payload, fallbackTraceId);
  return new ApiClientError({
    status: response.status,
    code: payload?.error?.code ?? fallbackCode,
    message: payload?.error?.message ?? fallbackMessage,
    details: payload?.error?.details,
    traceId,
    path,
    method
  });
}

function createNetworkError(error: unknown, traceId: string, path: string, method: string) {
  return new ApiClientError({
    status: 0,
    code: "NETWORK_ERROR",
    message: "Network request failed. Check the API server or your connection.",
    details: error instanceof Error ? error.message : String(error),
    traceId,
    path,
    method
  });
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = requestMethod(init);
  const { headers, traceId } = buildHeaders(init.headers);
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers
    });
  } catch (error) {
    const clientError = createNetworkError(error, traceId, path, method);
    logClientApiError(clientError);
    throw clientError;
  }

  const payload = await readPayload<T>(response);

  if (!response.ok) {
    const clientError = createResponseError(
      response,
      payload,
      traceId,
      path,
      method,
      "API_ERROR",
      "API request failed"
    );
    logClientApiError(clientError);
    throw clientError;
  }

  return payload?.data as T;
}

export interface UploadedFile {
  kind: string;
  url: string;
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export async function uploadFile(kind: "avatar" | "image" | "file" | "store-image", file: File): Promise<UploadedFile> {
  const body = new FormData();
  body.append("file", file);

  const path = `/uploads/${kind}`;
  const method = "POST";
  const { headers, traceId } = buildHeaders(undefined, false);
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers,
      body
    });
  } catch (error) {
    const clientError = createNetworkError(error, traceId, path, method);
    logClientApiError(clientError);
    throw clientError;
  }

  const payload = await readPayload<UploadedFile>(response);

  if (!response.ok) {
    const clientError = createResponseError(
      response,
      payload,
      traceId,
      path,
      method,
      "UPLOAD_ERROR",
      "File upload failed"
    );
    logClientApiError(clientError);
    throw clientError;
  }

  return payload?.data as UploadedFile;
}

export function formatKes(cents: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(cents / 100);
}

export function humanizeEnum(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}
