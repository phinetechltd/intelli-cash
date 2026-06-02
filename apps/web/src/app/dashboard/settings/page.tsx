"use client";

import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Download, KeyRound, ServerCog, ShieldCheck, Smartphone } from "@/lib/theme-icons";
import { languagePreferenceLabels, type LanguagePreference } from "@intellicash/shared";
import { API_BASE_URL, apiFetch, humanizeEnum } from "../../../lib/api";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { IntegrationHealth, User } from "../../../components/dashboard/types";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationHealth | null>(null);
  const [apiHealthy, setApiHealthy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const me = await apiFetch<User>("/auth/me");
        const health = await apiFetch<IntegrationHealth>("/integrations/health").catch(() => null);
        const apiRoot = API_BASE_URL.replace(/\/api\/v1$/, "");
        const apiResponse = await fetch(`${apiRoot}/health`).catch(() => null);

        if (!mounted) return;
        setUser(me);
        setIntegrations(health);
        setApiHealthy(apiResponse?.ok ?? false);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="loading-panel">Loading...</div>;
  const languageLabel =
    languagePreferenceLabels[(user?.languagePreference ?? "ENGLISH") as LanguagePreference] ?? "English";
  const canManagePwa = user?.role === "IWL_ADMIN";

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">System Configuration</p>
          <h2
            aria-label="Settings"
            className="has-hint"
            data-hint="Review the current development environment, API target, auth role, integration posture, and operational defaults."
            tabIndex={0}
          >
            Settings
          </h2>
        </div>
        <Link className="button secondary" href="/">
          Public landing
        </Link>
      </section>

      <section className="stat-grid">
        <StatCard icon={<ServerCog size={20} />} label="API" note={API_BASE_URL} value={apiHealthy ? "Online" : "Check"} />
        <StatCard icon={<Database size={20} />} label="Database" note="Local development fallback" value="SQLite" />
        <StatCard icon={<KeyRound size={20} />} label="Role" note={user?.email ?? "Signed in"} value={humanizeEnum(user?.role ?? "READ_ONLY")} />
        <StatCard icon={<ShieldCheck size={20} />} label="Language" note="Account preference" value={languageLabel} />
        <StatCard icon={<ShieldCheck size={20} />} label="Integrations" note={integrations ? "Sandbox providers ready" : "Restricted for this account"} value={integrations ? `${integrations.configured}/${integrations.total}` : "Scoped"} />
      </section>

      <section className="two-column">
        <div className="data-card">
          <header>
            <h3>Defaults</h3>
          </header>
          <div className="list">
            <div className="list-row">
              <div>
                <strong>API version</strong>
                <span>/api/v1</span>
              </div>
              <span className="pill blue">Active</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Meeting method</strong>
                <span>8 steps, 3 keys</span>
              </div>
              <span className="pill">Enabled</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Ledger policy</strong>
                <span>Append-only</span>
              </div>
              <span className="pill">Protected</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Auth mode</strong>
                <span>Email/password RBAC</span>
              </div>
              <span className="pill gold">V1</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Language options</strong>
                <span>English, Kiswahili, Kiembu, and Gikuyu</span>
              </div>
              <span className="pill blue">Enabled</span>
            </div>
          </div>
        </div>

        <div className="data-card">
          <header>
            <h3>Routes</h3>
          </header>
          <div className="list">
            <Link className="list-row route-row" href="/dashboard/groups">
              <strong>Groups</strong>
              <span>/dashboard/groups</span>
            </Link>
            <Link className="list-row route-row" href="/dashboard/integrations">
              <strong>Integrations</strong>
              <span>/dashboard/integrations</span>
            </Link>
            <Link className="list-row route-row" href="/dashboard/audit">
              <strong>Audit</strong>
              <span>/dashboard/audit</span>
            </Link>
            <Link className="list-row route-row" href="/login">
              <strong>Login</strong>
              <span>/login</span>
            </Link>
          </div>
        </div>
      </section>

      {canManagePwa ? (
        <section className="pwa-admin-grid">
          <div className="data-card pwa-admin-card">
            <header>
              <div>
                <h3>Group Account PWA</h3>
                <span>Admin managed install experience</span>
              </div>
              <span className="pill blue">Enabled</span>
            </header>
            <div className="pwa-admin-preview">
              <img alt="" src="/pwa/icon-192.png" />
              <div>
                <strong>Intelli-Cash Group Account</strong>
                <span>Start URL /dashboard with bottom tabs, icon, splash screens, and offline asset cache.</span>
              </div>
            </div>
            <div className="pwa-admin-actions">
              <a className="button secondary" href="/manifest.webmanifest" rel="noopener noreferrer" target="_blank">
                <Smartphone size={16} />
                Manifest
              </a>
              <a className="button secondary" href="/sw.js" rel="noopener noreferrer" target="_blank">
                <ServerCog size={16} />
                Service worker
              </a>
              <a className="button secondary" href="/pwa/icon-512.png" rel="noopener noreferrer" target="_blank">
                <Download size={16} />
                App icon
              </a>
            </div>
          </div>

          <div className="data-card">
            <header>
              <h3>PWA controls</h3>
            </header>
            <div className="list">
              <div className="list-row">
                <div>
                  <strong>Install access</strong>
                  <span>Shown to group account users in the dashboard top bar.</span>
                </div>
                <span className="pill blue">Active</span>
              </div>
              <div className="list-row">
                <div>
                  <strong>App navigation</strong>
                  <span>Bottom tabs for Dashboard, Meetings, Store, Groups, and Account.</span>
                </div>
                <span className="pill">Mobile</span>
              </div>
              <div className="list-row">
                <div>
                  <strong>Splash screen</strong>
                  <span>Generated icons and iOS startup images are served from /pwa.</span>
                </div>
                <span className="pill">Ready</span>
              </div>
              <div className="list-row">
                <div>
                  <strong>Offline shell</strong>
                  <span>Static assets are cached by the service worker; live records still need API access.</span>
                </div>
                <span className="pill gold">Network data</span>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
