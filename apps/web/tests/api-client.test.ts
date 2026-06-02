import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiFetch } from "../src/lib/api";

describe("API client traceability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("propagates trace IDs from failed API responses", async () => {
    const traceId = "trace-web-123";
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);

      expect(headers.get("X-Request-Id")).toBe(traceId);
      expect(headers.get("Content-Type")).toBe("application/json");

      return new Response(
        JSON.stringify({
          error: {
            code: "BROKEN",
            message: "The request failed.",
            details: { field: "name" },
            traceId
          }
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "X-Request-Id": traceId
          }
        }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    try {
      await apiFetch("/broken", {
        method: "POST",
        headers: { "X-Request-Id": traceId },
        body: JSON.stringify({ ok: false })
      });
      throw new Error("Expected apiFetch to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect(error).toMatchObject({
        status: 500,
        code: "BROKEN",
        traceId,
        path: "/broken",
        method: "POST"
      });
      expect((error as Error).message).toContain(`Trace ID: ${traceId}`);
    }
  });

  it("wraps network failures with a trace ID", async () => {
    const traceId = "trace-network-123";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    await expect(
      apiFetch("/offline", {
        headers: { "X-Request-Id": traceId }
      })
    ).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
      traceId,
      path: "/offline",
      method: "GET"
    });
  });
});
