import { AlertTriangle } from "@/lib/theme-icons";

export default function NotFound() {
  return (
    <main className="app-error-page">
      <section className="app-error-card" aria-labelledby="not-found-title">
        <span className="app-error-icon" aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <div>
          <p className="eyebrow">Page not found</p>
          <h1 id="not-found-title">This page is not available.</h1>
          <p>Check the link, or return to the dashboard to continue working.</p>
        </div>
        <div className="app-error-actions">
          <a className="primary-action" href="/dashboard">
            Open dashboard
          </a>
          <a className="secondary-action" href="/">
            Go home
          </a>
        </div>
      </section>
    </main>
  );
}
