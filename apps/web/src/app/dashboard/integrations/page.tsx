"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, KeyRound, LockKeyhole, PlugZap, Trash2 } from "@/lib/theme-icons";
import { apiFetch, humanizeEnum } from "../../../lib/api";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { IntegrationHealth, IntegrationStatus } from "../../../components/dashboard/types";

interface TestResult {
  ok: boolean;
  message: string;
  status?: IntegrationStatus;
}

const smsProviders = ["AFRICAS_TALKING", "BONGA_SMS"];

function inputTypeForKey(key: string) {
  if (key.includes("URL")) return "url";
  if (key.includes("USERNAME") || key.includes("SENDER") || key.includes("CLIENT_ID") || key.includes("SHORTCODE")) {
    return "text";
  }
  return "password";
}

function visibleCredentialValues(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.trim()])
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

export default function IntegrationsPage() {
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHealth();
  }, []);

  async function loadHealth() {
    setLoading(true);
    try {
      const response = await apiFetch<IntegrationHealth>("/integrations/health");
      const preferredProvider =
        response.statuses.find((status) => !smsProviders.includes(status.provider))?.provider ??
        response.statuses[0]?.provider ??
        null;

      setHealth(response);
      setSelectedProvider((current) =>
        current && response.statuses.some((status) => status.provider === current) ? current : preferredProvider
      );
      setError(null);
    } catch (integrationError) {
      setError(integrationError instanceof Error ? integrationError.message : "Integrations failed");
    } finally {
      setLoading(false);
    }
  }

  function updateProviderStatus(status: IntegrationStatus) {
    setHealth((current) => {
      if (!current) return current;

      const statuses = current.statuses.map((candidate) =>
        candidate.provider === status.provider ? status : candidate
      );

      return {
        ...current,
        configured: statuses.filter((candidate) => candidate.configured).length,
        statuses
      };
    });
  }

  function selectProvider(status: IntegrationStatus) {
    setSelectedProvider(status.provider);
    setCredentialValues({});
    setCredentialMessage(null);
  }

  async function testProvider(provider: string) {
    setTestingProvider(provider);
    try {
      const result = await apiFetch<TestResult>(`/integrations/${provider}/test`, {
        method: "POST"
      });
      if (result.status) updateProviderStatus(result.status);
      setTestResults((current) => ({ ...current, [provider]: result }));
    } catch (testError) {
      setTestResults((current) => ({
        ...current,
        [provider]: {
          ok: false,
          message: testError instanceof Error ? testError.message : "Test failed"
        }
      }));
    } finally {
      setTestingProvider(null);
    }
  }

  async function saveCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProvider) return;

    const credentials = visibleCredentialValues(credentialValues);
    if (Object.keys(credentials).length === 0) {
      setCredentialMessage({ ok: false, message: "Enter at least one credential value before saving." });
      return;
    }

    setSavingCredentials(true);
    setCredentialMessage(null);

    try {
      const status = await apiFetch<IntegrationStatus>(`/integrations/${selectedProvider}/credentials`, {
        method: "PUT",
        body: JSON.stringify({ credentials })
      });
      updateProviderStatus(status);
      setCredentialValues({});
      setCredentialMessage({
        ok: true,
        message: `${status.displayName} credentials saved.`
      });
    } catch (saveError) {
      setCredentialMessage({
        ok: false,
        message: saveError instanceof Error ? saveError.message : "Credentials failed to save"
      });
    } finally {
      setSavingCredentials(false);
    }
  }

  async function clearCredentials() {
    if (!selectedProvider) return;

    setSavingCredentials(true);
    setCredentialMessage(null);

    try {
      const status = await apiFetch<IntegrationStatus>(`/integrations/${selectedProvider}/credentials`, {
        method: "DELETE"
      });
      updateProviderStatus(status);
      setCredentialValues({});
      setCredentialMessage({
        ok: true,
        message: `${status.displayName} stored credentials cleared.`
      });
    } catch (clearError) {
      setCredentialMessage({
        ok: false,
        message: clearError instanceof Error ? clearError.message : "Credentials failed to clear"
      });
    } finally {
      setSavingCredentials(false);
    }
  }

  if (loading && !health) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  const statuses = health?.statuses ?? [];
  const configured = health?.configured ?? 0;
  const total = health?.total ?? 0;
  const missingTotal = statuses.reduce((sum, status) => sum + status.missingEnv.length, 0);
  const selectedStatus = statuses.find((status) => status.provider === selectedProvider) ?? statuses[0] ?? null;
  const selectedTestResult = selectedStatus ? testResults[selectedStatus.provider] : null;
  const smsStatuses = statuses.filter((status) => smsProviders.includes(status.provider));
  const readySmsCount = smsStatuses.filter((status) => status.configured).length;
  const otherStatuses = statuses.filter((status) => !smsProviders.includes(status.provider));

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Sandbox Integrations</p>
          <h2
            aria-label="Integrations"
            className="has-hint"
            data-hint="Configure sandbox providers used by payments, maps, SMS notifications, KYC, banking, credit bureau, and market-data features."
            tabIndex={0}
          >
            Integrations
          </h2>
        </div>
        <button className="button secondary" onClick={loadHealth} type="button">
          Refresh
        </button>
      </section>

      <section className="stat-grid">
        <StatCard icon={<PlugZap size={20} />} label="Providers" note="Configured adapters" value={total.toString()} />
        <StatCard icon={<CheckCircle2 size={20} />} label="Ready" note="All credentials present" value={configured.toString()} />
        <StatCard icon={<LockKeyhole size={20} />} label="Missing fields" note="Across providers" value={missingTotal.toString()} />
        <StatCard icon={<FlaskConical size={20} />} label="Network tests" note="Sandbox probes" value={statuses[0]?.networkTestsAllowed ? "On" : "Off"} />
      </section>

      <section className="two-column">
        <div className="data-card">
          <header>
            <div>
              <h3>SMS Notifications</h3>
              <span>{readySmsCount}/{smsStatuses.length} providers ready</span>
            </div>
            <span className={`pill ${readySmsCount > 0 ? "blue" : "gold"}`}>
              {readySmsCount > 0 ? "SMS ready" : "Needs credentials"}
            </span>
          </header>

          <div className="list">
            <div className="list-row">
              <div>
                <strong>Member PIN delivery</strong>
                <span>First ready SMS provider.</span>
              </div>
              <span className="pill blue">Enabled</span>
            </div>
            {smsStatuses.map((status) => {
              const result = testResults[status.provider];

              return (
                <div className="list-row" key={status.provider}>
                  <div>
                    <strong>{status.displayName}</strong>
                    <span>{status.missingEnv.length} missing, {status.storedCredentialKeys.length} stored</span>
                    {result ? <em className={result.ok ? "" : "warning"}>{result.message}</em> : null}
                  </div>
                  <div className="modal-header-actions">
                    <span className={`pill ${status.configured ? "blue" : "gold"}`}>
                      {status.configured ? "Ready" : "Gated"}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="list-row">
              <div>
                <strong>Credential setup</strong>
                <span>Select a provider.</span>
              </div>
              <span className="pill">One form</span>
            </div>
          </div>
        </div>

        <section className="data-card credential-panel">
          <header>
            <div>
              <h3>{selectedStatus ? `${selectedStatus.displayName} Setup` : "Provider Setup"}</h3>
              <span>Saved credentials are encrypted and hidden after saving.</span>
            </div>
            {selectedStatus ? (
              <span className={`pill ${selectedStatus.configured ? "blue" : "gold"}`}>
                {selectedStatus.configured ? "Ready" : `${selectedStatus.missingEnv.length} missing`}
              </span>
            ) : null}
          </header>

          {selectedStatus ? (
            <form className="credential-form" onSubmit={saveCredentials}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Provider</span>
                  <select
                    onChange={(event) => {
                      const status = statuses.find((candidate) => candidate.provider === event.target.value);
                      if (status) selectProvider(status);
                    }}
                    value={selectedStatus.provider}
                  >
                    {statuses.map((status) => (
                      <option key={status.provider} value={status.provider}>
                        {status.displayName}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedStatus.requiredEnv.map((key) => {
                  const stored = selectedStatus.storedCredentialKeys.includes(key);
                  const fromEnv = selectedStatus.envCredentialKeys.includes(key);
                  const missing = selectedStatus.missingEnv.includes(key);

                  return (
                    <label className="credential-field" key={key}>
                      <span>
                        {key}
                        {fromEnv ? <em>from .env</em> : null}
                        {stored ? <em>stored</em> : null}
                        {missing ? <em className="warning">missing</em> : null}
                      </span>
                      <input
                        autoComplete="off"
                        onChange={(event) =>
                          setCredentialValues((current) => ({
                            ...current,
                            [key]: event.target.value
                          }))
                        }
                        placeholder={stored || fromEnv ? "Leave blank to keep current value" : "Enter value"}
                        type={inputTypeForKey(key)}
                        value={credentialValues[key] ?? ""}
                      />
                    </label>
                  );
                })}
              </div>

              {selectedTestResult ? (
                <div className={selectedTestResult.ok ? "notice success" : "notice warning"}>
                  {selectedTestResult.message}
                </div>
              ) : null}
              {credentialMessage ? (
                <div className={credentialMessage.ok ? "notice success" : "notice warning"}>
                  {credentialMessage.message}
                </div>
              ) : null}

              <div className="credential-actions">
                <button className="button" disabled={savingCredentials} type="submit">
                  <KeyRound size={16} />
                  {savingCredentials ? "Saving" : "Save"}
                </button>
                <button
                  className="button secondary"
                  disabled={testingProvider === selectedStatus.provider}
                  onClick={() => testProvider(selectedStatus.provider)}
                  type="button"
                >
                  <FlaskConical size={16} />
                  {testingProvider === selectedStatus.provider ? "Testing" : "Test"}
                </button>
                <button
                  className="button secondary"
                  disabled={savingCredentials || selectedStatus.storedCredentialKeys.length === 0}
                  onClick={clearCredentials}
                  type="button"
                >
                  <Trash2 size={16} />
                  Clear
                </button>
              </div>
            </form>
          ) : (
            <div className="empty-state">No providers</div>
          )}
        </section>
      </section>

      <section className="data-card">
        <header>
          <h3>Other Providers</h3>
          <span className="pill">{otherStatuses.length} listed</span>
        </header>
        <div className="list">
          {otherStatuses.map((status) => (
            <div className="list-row" key={status.provider}>
              <div>
                <strong>{status.displayName}</strong>
                <span>{humanizeEnum(status.provider)}</span>
              </div>
              <div className="modal-header-actions">
                <span className={`pill ${status.configured ? "blue" : "gold"}`}>
                  {status.configured ? "Ready" : `${status.missingEnv.length} missing`}
                </span>
                <button className="button secondary" onClick={() => selectProvider(status)} type="button">
                  Manage
                </button>
              </div>
            </div>
          ))}
          {otherStatuses.length === 0 ? <div className="empty-state">No providers</div> : null}
        </div>
      </section>
    </>
  );
}
