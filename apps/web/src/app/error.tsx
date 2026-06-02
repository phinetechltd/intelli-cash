"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "@/lib/theme-icons";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const traceId = error.digest ?? "client-route-error";

  useEffect(() => {
    console.error("[intellicash-route-error]", {
      traceId,
      message: error.message,
      stack: error.stack
    });
  }, [error, traceId]);

  return (
    <main className="app-error-page">
      <section className="app-error-card" aria-labelledby="app-error-title">
        <span className="app-error-icon" aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <div>
          <p className="eyebrow">Something needs attention</p>
          <h1 id="app-error-title">This page could not finish loading.</h1>
          <p>
            The error has been captured with a trace reference. Retry the page, or share the trace ID
            with support if it continues.
          </p>
        </div>
        <div className="app-error-actions">
          <button type="button" className="primary-action" onClick={reset}>
            <RefreshCw size={16} />
            Try again
          </button>
          <span className="trace-pill">Trace ID: {traceId}</span>
        </div>
      </section>
    </main>
  );
}
