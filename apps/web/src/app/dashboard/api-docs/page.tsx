"use client";

import type { FormEvent } from "react";
import React, { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  Clipboard,
  Download,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  Trash2
} from "@/lib/theme-icons";
import { API_BASE_URL, apiFetch, humanizeEnum } from "../../../lib/api";
import {
  allMobileApiEndpoints,
  buildMobileOpenApiSpec,
  mobileApiModules
} from "../../../lib/mobile-api-docs";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { ApiKeyCreated, ApiKeyPreset, ApiKeyRow, User } from "../../../components/dashboard/types";

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ApiDocsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [presets, setPresets] = useState<ApiKeyPreset[]>([]);
  const [keyName, setKeyName] = useState("Mobile backend integration");
  const [selectedPreset, setSelectedPreset] = useState("MOBILE_CORE");
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadApiDocsWorkspace() {
    const [meResponse, keyResponse, presetResponse] = await Promise.all([
      apiFetch<User>("/auth/me"),
      apiFetch<ApiKeyRow[]>("/api-keys"),
      apiFetch<ApiKeyPreset[]>("/api-keys/presets")
    ]);

    setUser(meResponse);
    setKeys(keyResponse);
    setPresets(presetResponse);
    setSelectedPreset((current) =>
      presetResponse.some((preset) => preset.id === current) ? current : presetResponse[0]?.id ?? "MOBILE_CORE"
    );
  }

  useEffect(() => {
    let mounted = true;

    loadApiDocsWorkspace()
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "API docs failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const canWriteKeys = user?.permissions?.includes("api-keys:write") ?? false;
  const activeKeys = keys.filter((key) => !key.revokedAt);
  const selectedPresetRow = presets.find((preset) => preset.id === selectedPreset) ?? presets[0];
  const endpoints = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allMobileApiEndpoints();

    return allMobileApiEndpoints().filter((endpoint) =>
      [
        endpoint.module,
        endpoint.title,
        endpoint.method,
        endpoint.path,
        endpoint.permission,
        endpoint.summary
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [query]);

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setCreatedKey(null);

    try {
      const created = await apiFetch<ApiKeyCreated>("/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: keyName,
          preset: selectedPreset
        })
      });
      setCreatedKey(created);
      setKeyName("Mobile backend integration");
      await loadApiDocsWorkspace();
      setMessage({ ok: true, text: `${created.name} created. Copy the token now; it will not be shown again.` });
    } catch (createError) {
      setMessage({
        ok: false,
        text: createError instanceof Error ? createError.message : "API key creation failed"
      });
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(key: ApiKeyRow) {
    setBusy(true);
    setMessage(null);

    try {
      const revoked = await apiFetch<ApiKeyRow>(`/api-keys/${key.id}`, {
        method: "DELETE"
      });
      await loadApiDocsWorkspace();
      setMessage({ ok: true, text: `${revoked.name} revoked.` });
    } catch (revokeError) {
      setMessage({
        ok: false,
        text: revokeError instanceof Error ? revokeError.message : "API key revoke failed"
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!createdKey?.token) return;
    await navigator.clipboard.writeText(createdKey.token);
    setMessage({ ok: true, text: "API token copied to clipboard." });
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  const curlSnippet = `curl -H "Authorization: Bearer ic_sk_your_key" \\\n  ${API_BASE_URL}/groups`;
  const fetchSnippet = `const response = await fetch("${API_BASE_URL}/groups", {\n  headers: { Authorization: "Bearer ic_sk_your_key" }\n});\nconst { data } = await response.json();`;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">API Docs</p>
          <h2
            aria-label="API Docs"
            className="has-hint"
            data-hint="Curated API documentation and server key management for mobile/backend integrations."
            tabIndex={0}
          >
            API Docs
          </h2>
          <p>Keys, endpoints, and OpenAPI.</p>
        </div>
        <div className="page-heading-actions">
          <button className="button secondary" onClick={loadApiDocsWorkspace} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            className="button"
            onClick={() => downloadJson("intellicash-mobile-openapi.json", buildMobileOpenApiSpec(API_BASE_URL))}
            type="button"
          >
            <Download size={16} />
            OpenAPI JSON
          </button>
        </div>
      </section>

      {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

      <section className="stat-grid">
        <StatCard icon={<ServerCog size={20} />} label="API base" note="/api/v1" value={API_BASE_URL.replace(/^https?:\/\//, "")} />
        <StatCard icon={<KeyRound size={20} />} label="Active keys" note="Owned by this account" value={activeKeys.length.toString()} />
        <StatCard icon={<ShieldCheck size={20} />} label="Preset" note={selectedPresetRow?.name ?? "Mobile Core"} value={selectedPresetRow?.scopes.length.toString() ?? "0"} />
        <StatCard icon={<BookOpenText size={20} />} label="Documented endpoints" note="Mobile catalog" value={allMobileApiEndpoints().length.toString()} />
      </section>

      <section className="api-docs-grid">
        <div className="data-card">
          <header>
            <div>
              <h3>Overview</h3>
              <span>Server-to-server mobile backend integration defaults</span>
            </div>
          </header>
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Authentication</strong>
                <span>
                  Send <code>Authorization: Bearer ic_sk_...</code> on every request.
                </span>
              </div>
              <span className="pill blue">Bearer</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Success envelope</strong>
                <span>
                  Successful responses are JSON objects shaped as <code>{'{ "data": ... }'}</code>.
                </span>
              </div>
              <span className="pill">JSON</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Error envelope</strong>
                <span>
                  Errors return <code>{'{ "error": { "code", "message", "details"?, "traceId"? } }'}</code>.
                </span>
              </div>
              <span className="pill gold">Scoped</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Money and time</strong>
                <span>Amounts use integer cents; timestamps use ISO 8601 strings.</span>
              </div>
              <span className="pill">Stable</span>
            </div>
          </div>
        </div>

        <section className="data-card">
          <header>
            <div>
              <h3>API Keys</h3>
              <span>Create, list, and revoke server keys for this account.</span>
            </div>
          </header>

          {canWriteKeys ? (
            <form className="credential-form" onSubmit={createKey}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Name</span>
                  <input
                    onChange={(event) => setKeyName(event.target.value)}
                    required
                    value={keyName}
                  />
                </label>
                <label className="credential-field">
                  <span>Preset</span>
                  <select onChange={(event) => setSelectedPreset(event.target.value)} value={selectedPreset}>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button className="button" disabled={busy || presets.length === 0} type="submit">
                <Plus size={16} />
                {busy ? "Creating" : "Create API key"}
              </button>
            </form>
          ) : (
            <div className="empty-state">Read only</div>
          )}

          {createdKey ? (
            <div className="token-panel">
              <span>Copy now. Hidden after this.</span>
              <code>{createdKey.token}</code>
              <button className="button secondary" onClick={copyToken} type="button">
                <Clipboard size={16} />
                Copy token
              </button>
            </div>
          ) : null}

          <div className="api-key-list">
            {keys.map((key) => (
              <article className="store-action-card" key={key.id}>
                <header>
                  <span>
                    <strong>{key.name}</strong>
                    <small>
                      {key.effectiveScopes.length}/{key.scopes.length} effective scopes - last used {formatDate(key.lastUsedAt)}
                    </small>
                  </span>
                  <span className={`pill ${key.revokedAt ? "gold" : "blue"}`}>
                    {key.revokedAt ? "Revoked" : "Active"}
                  </span>
                </header>
                <div className="permission-summary">
                  {key.effectiveScopes.map((scope) => (
                    <code key={scope}>{scope}</code>
                  ))}
                </div>
                {canWriteKeys && !key.revokedAt ? (
                  <button className="button secondary" disabled={busy} onClick={() => revokeKey(key)} type="button">
                    <Trash2 size={16} />
                    Revoke
                  </button>
                ) : null}
              </article>
            ))}
            {keys.length === 0 ? <div className="empty-state">No keys</div> : null}
          </div>
        </section>
      </section>

      <section className="two-column">
        <div className="data-card">
          <header>
            <div>
              <h3>Examples</h3>
              <span>Use the generated server token from a secure backend.</span>
            </div>
          </header>
          <div className="code-block">
            <strong>curl</strong>
            <pre>{curlSnippet}</pre>
          </div>
          <div className="code-block">
            <strong>fetch</strong>
            <pre>{fetchSnippet}</pre>
          </div>
        </div>

        <div className="data-card">
          <header>
            <div>
              <h3>Mobile Core Preset</h3>
              <span>{selectedPresetRow?.description ?? "Field app integration scopes."}</span>
            </div>
          </header>
          <div className="permission-summary">
            {(selectedPresetRow?.scopes ?? []).map((scope) => (
              <code key={scope}>{scope}</code>
            ))}
          </div>
        </div>
      </section>

      <section className="data-card">
        <header>
          <div>
            <h3>Mobile API Catalog</h3>
            <span>{endpoints.length} endpoints match the current filter</span>
          </div>
          <label className="search-box data-table-search">
            <Search size={17} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search endpoints"
              value={query}
            />
          </label>
        </header>

        <div className="api-module-list">
          {mobileApiModules.map((module) => {
            const moduleEndpoints = endpoints.filter((endpoint) => endpoint.module === module.title);
            if (moduleEndpoints.length === 0) return null;

            return (
              <section className="api-module" key={module.id}>
                <header>
                  <div>
                    <h4>{module.title}</h4>
                    <span>{module.description}</span>
                  </div>
                  <span className="pill">{moduleEndpoints.length} endpoints</span>
                </header>
                <div className="endpoint-grid">
                  {moduleEndpoints.map((endpoint) => (
                    <article className="endpoint-card" key={`${endpoint.method}-${endpoint.path}`}>
                      <header>
                        <span className={`method-badge method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                        <code>{endpoint.path}</code>
                      </header>
                      <strong>{endpoint.title}</strong>
                      <p>{endpoint.summary}</p>
                      <div>
                        {endpoint.permission ? <span className="pill">{endpoint.permission}</span> : null}
                        <span className="pill blue">{humanizeEnum(module.id)}</span>
                      </div>
                      {endpoint.request ? (
                        <details>
                          <summary>Request example</summary>
                          <pre>{endpoint.request}</pre>
                        </details>
                      ) : null}
                      <small>{endpoint.response}</small>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </>
  );
}
