"use client";

import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileUp,
  PlugZap,
  RefreshCw,
  Send,
  ShieldAlert,
  WifiOff
} from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../../../lib/api";
import { DataTable } from "../../../components/dashboard/data-table";
import { StatCard } from "../../../components/dashboard/stat-card";
import type {
  IntelliAuditChatResponse,
  IntelliAuditEvidencePayload,
  IntelliAuditFinding,
  IntelliAuditOverview,
  IntelliAuditReconciliation,
  IntelliAuditReport,
  IntelliAuditStandard,
  User
} from "../../../components/dashboard/types";

type IntelliAuditView =
  | "chat"
  | "evidence"
  | "connectors"
  | "reconciliations"
  | "findings"
  | "reports"
  | "standards";

interface OfflineAction {
  clientActionId: string;
  actionType: string;
  path: string;
  payload: unknown;
}

const views: Array<{ id: IntelliAuditView; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "evidence", label: "Evidence" },
  { id: "connectors", label: "Connectors" },
  { id: "reconciliations", label: "Reconciliations" },
  { id: "findings", label: "Findings" },
  { id: "reports", label: "Reports" },
  { id: "standards", label: "Standards" }
];

const sourceTypes = [
  "DATABASE",
  "MYSQL",
  "CSV",
  "EXCEL",
  "PDF",
  "BANK_STATEMENT",
  "MPESA_STATEMENT",
  "ACCOUNTING_SYSTEM",
  "ERP",
  "PAYROLL",
  "REST_API",
  "OPENAPI",
  "WEBHOOK",
  "MANUAL"
];

const connectorProviders = [
  "MYSQL",
  "REST_API",
  "OPENAPI",
  "BANK_STATEMENT",
  "MPESA_STATEMENT",
  "ACCOUNTING_SYSTEM",
  "ERP",
  "PAYROLL",
  "MPESA_DARAJA",
  "PAYSTACK",
  "KCB_BUNI",
  "IPRS",
  "TRANSUNION_CRB",
  "AFRICAS_TALKING",
  "BONGA_SMS",
  "MFARM"
];

const standards = ["IFRS", "ISA", "IPSAS", "SACCO", "NGO_DONOR", "WORLD_BANK", "CGAP", "VSLA", "CUSTOM"];

function cacheKey(name: string) {
  return `intelliaudit:${name}`;
}

function defaultScopeForUser(user: User | null) {
  if (user?.partnerId && (user.role === "PARTNER_OFFICER" || user.role === "LENDER")) {
    return { scopeType: "PARTNER", scopeId: user.partnerId };
  }
  if (user?.groupId && user.role === "GROUP_ACCOUNT") {
    return { scopeType: "GROUP", scopeId: user.groupId };
  }
  return { scopeType: "GLOBAL", scopeId: "" };
}

function readCached<T>(name: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  if (typeof window.localStorage?.getItem !== "function") return fallback;
  const value = window.localStorage.getItem(cacheKey(name));
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeCached(name: string, value: unknown) {
  if (typeof window === "undefined") return;
  if (typeof window.localStorage?.setItem !== "function") return;
  window.localStorage.setItem(cacheKey(name), JSON.stringify(value));
}

function queuedActions() {
  return readCached<OfflineAction[]>("offline-queue", []);
}

function writeQueuedActions(actions: OfflineAction[]) {
  writeCached("offline-queue", actions);
}

function parseRecords(value: string) {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Records must be a JSON array.");
  return parsed;
}

function toLocalDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-KE") : "Pending";
}

function confidenceLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function IntelliAuditPage() {
  const [user, setUser] = useState<User | null>(null);
  const [overview, setOverview] = useState<IntelliAuditOverview | null>(null);
  const [evidence, setEvidence] = useState<IntelliAuditEvidencePayload>({
    sources: [],
    documents: [],
    records: [],
    findings: []
  });
  const [reconciliations, setReconciliations] = useState<IntelliAuditReconciliation[]>([]);
  const [reports, setReports] = useState<IntelliAuditReport[]>([]);
  const [standardRefs, setStandardRefs] = useState<IntelliAuditStandard[]>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<IntelliAuditView>("chat");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [offlineActions, setOfflineActions] = useState<OfflineAction[]>([]);
  const [chatInput, setChatInput] = useState("Review the current evidence and highlight audit readiness risks.");
  const [sourceType, setSourceType] = useState("MPESA_STATEMENT");
  const [evidenceTitle, setEvidenceTitle] = useState("Uploaded audit evidence");
  const [evidenceRecords, setEvidenceRecords] = useState(
    JSON.stringify(
      [
        {
          recordType: "MPESA_RECEIPT",
          amountCents: 250000,
          currency: "KES",
          direction: "CREDIT",
          counterparty: "Member receipt",
          reference: "MPESA-UPLOAD-001",
          description: "Member share purchase receipt",
          confidence: 0.86,
          data: { channel: "M-Pesa" }
        }
      ],
      null,
      2
    )
  );
  const [connectorProvider, setConnectorProvider] = useState("REST_API");
  const [connectorEndpoint, setConnectorEndpoint] = useState("");
  const [connectorRecords, setConnectorRecords] = useState("[]");
  const [reportTitle, setReportTitle] = useState("IntelliAudit readiness report");
  const [reportStandard, setReportStandard] = useState("IFRS");
  const [saving, setSaving] = useState(false);

  const defaultScope = useMemo(() => defaultScopeForUser(user), [user]);
  const activeFindings = evidence.findings.filter((finding) => finding.status !== "CLOSED");
  const pendingReports = reports.filter((report) => report.status !== "APPROVED").length;

  useEffect(() => {
    setOfflineActions(queuedActions());
    loadAll();
    window.addEventListener("online", flushOfflineQueue);
    return () => window.removeEventListener("online", flushOfflineQueue);
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [me, overviewResponse, evidenceResponse, reconciliationResponse, reportResponse, standardResponse] =
        await Promise.all([
          apiFetch<User>("/auth/me"),
          apiFetch<IntelliAuditOverview>("/intelliaudit/overview"),
          apiFetch<IntelliAuditEvidencePayload>("/intelliaudit/evidence"),
          apiFetch<IntelliAuditReconciliation[]>("/intelliaudit/reconciliations"),
          apiFetch<IntelliAuditReport[]>("/intelliaudit/reports"),
          apiFetch<IntelliAuditStandard[]>("/intelliaudit/standards")
        ]);

      setUser(me);
      setOverview(overviewResponse);
      setEvidence(evidenceResponse);
      setReconciliations(reconciliationResponse);
      setReports(reportResponse);
      setStandardRefs(standardResponse);
      writeCached("overview", overviewResponse);
      writeCached("evidence", evidenceResponse);
      writeCached("reconciliations", reconciliationResponse);
      writeCached("reports", reportResponse);
      writeCached("standards", standardResponse);
      setMessage(null);
    } catch (error) {
      setOverview(readCached<IntelliAuditOverview | null>("overview", null));
      setEvidence(readCached<IntelliAuditEvidencePayload>("evidence", evidence));
      setReconciliations(readCached<IntelliAuditReconciliation[]>("reconciliations", []));
      setReports(readCached<IntelliAuditReport[]>("reports", []));
      setStandardRefs(readCached<IntelliAuditStandard[]>("standards", []));
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Loaded cached IntelliAudit workspace."
      });
    } finally {
      setLoading(false);
    }
  }

  function queueAction(actionType: string, path: string, payload: unknown) {
    const action = {
      clientActionId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      actionType,
      path,
      payload
    };
    const next = [...offlineActions, action];
    setOfflineActions(next);
    writeQueuedActions(next);
    setMessage({ ok: true, text: `${humanizeEnum(actionType)} queued for sync.` });
  }

  async function flushOfflineQueue() {
    const actions = queuedActions();
    if (actions.length === 0) return;

    const remaining: OfflineAction[] = [];
    for (const action of actions) {
      try {
        await apiFetch(action.path, {
          method: "POST",
          body: JSON.stringify(action.payload)
        });
      } catch {
        remaining.push(action);
      }
    }
    writeQueuedActions(remaining);
    setOfflineActions(remaining);
    if (remaining.length !== actions.length) {
      await loadAll();
    }
  }

  async function postOrQueue(actionType: string, path: string, payload: unknown) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      queueAction(actionType, path, payload);
      return null;
    }

    try {
      return await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (error instanceof TypeError) {
        queueAction(actionType, path, payload);
        return null;
      }
      throw error;
    }
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...defaultScope,
        conversationId: conversationId ?? undefined,
        message: chatInput
      };
      const response = await postOrQueue("CHAT_MESSAGE", "/intelliaudit/chat", payload);
      if (response) {
        const chat = response as IntelliAuditChatResponse;
        setConversationId(chat.conversation.id);
        setChatMessages((current) => [
          ...current,
          { role: "USER", content: chatInput },
          { role: "ASSISTANT", content: chat.message.content }
        ]);
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Chat failed" });
    } finally {
      setSaving(false);
    }
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...defaultScope,
        sourceName: evidenceTitle,
        sourceType,
        title: evidenceTitle,
        fileName: `${evidenceTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`,
        mimeType: "application/json",
        metadata: { uploadedFrom: "dashboard" },
        records: parseRecords(evidenceRecords)
      };
      const response = await postOrQueue("EVIDENCE_UPLOAD", "/intelliaudit/evidence", payload);
      if (response) {
        setMessage({ ok: true, text: "Evidence staged for reconciliation." });
        await loadAll();
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Evidence upload failed" });
    } finally {
      setSaving(false);
    }
  }

  async function syncConnector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...defaultScope,
        sourceName: `${humanizeEnum(connectorProvider)} source`,
        endpoint: connectorEndpoint || undefined,
        metadata: { requestedFrom: "dashboard" },
        records: parseRecords(connectorRecords)
      };
      const response = await postOrQueue(
        "CONNECTOR_SYNC",
        `/intelliaudit/connectors/${connectorProvider}/sync`,
        payload
      );
      if (response) {
        setMessage({ ok: true, text: `${humanizeEnum(connectorProvider)} sync recorded.` });
        await loadAll();
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Connector sync failed" });
    } finally {
      setSaving(false);
    }
  }

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await postOrQueue("REPORT_DRAFT", "/intelliaudit/reports", {
        ...defaultScope,
        title: reportTitle,
        templateKey: `${reportStandard}_STANDARD_REPORT`,
        standard: reportStandard
      });
      if (response) {
        setMessage({ ok: true, text: "Report draft generated with audit references." });
        await loadAll();
      }
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Report draft failed" });
    } finally {
      setSaving(false);
    }
  }

  async function approveReport(report: IntelliAuditReport) {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/intelliaudit/reports/${report.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ notes: "Approved from IntelliAudit dashboard." })
      });
      setMessage({ ok: true, text: "Report approved." });
      await loadAll();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Report approval failed" });
    } finally {
      setSaving(false);
    }
  }

  async function approveReconciliation(batch: IntelliAuditReconciliation) {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/intelliaudit/reconciliations/${batch.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ notes: "Approved from IntelliAudit dashboard." })
      });
      setMessage({ ok: true, text: "Reconciliation approved." });
      await loadAll();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Approval failed" });
    } finally {
      setSaving(false);
    }
  }

  async function exportReport(report: IntelliAuditReport) {
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(`/intelliaudit/reports/${report.id}/export`, { method: "POST" });
      setMessage({ ok: true, text: "Report export audit event recorded." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Export failed" });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !overview) {
    return <div className="loading-panel">Loading...</div>;
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">IntelliAudit AI</p>
          <h2
            aria-label="IntelliAudit"
            className="has-hint"
            data-hint="Evidence-backed financial audit workspace with scoped chat, staged reconciliation, standards-based report drafting, approval controls, and immutable audit references."
            tabIndex={0}
          >
            IntelliAudit
          </h2>
        </div>
        <div className="page-heading-actions">
          {offlineActions.length > 0 ? (
            <span className="pill gold">
              <WifiOff size={14} />
              {offlineActions.length} queued
            </span>
          ) : null}
          <button className="button secondary" onClick={loadAll} type="button">
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

      <section className="stat-grid">
        <StatCard icon={<FileUp size={20} />} label="Evidence" note="Documents and records" value={`${overview?.documents ?? 0}/${overview?.records ?? 0}`} />
        <StatCard icon={<ClipboardCheck size={20} />} label="Reconciliations" note="Staged batches" value={(overview?.reconciliations ?? 0).toString()} />
        <StatCard icon={<ShieldAlert size={20} />} label="Findings" note="Open review signals" value={activeFindings.length.toString()} />
        <StatCard icon={<FileCheck2 size={20} />} label="Reports" note={`${overview?.approvals ?? 0} approved, ${pendingReports} pending`} value={(overview?.reports ?? 0).toString()} />
      </section>

      <section className="system-workspace intelliaudit-workspace" aria-label="IntelliAudit workspace">
        <aside className="system-list-panel">
          <div className="system-list" aria-label="IntelliAudit views">
            {views.map((view) => (
              <button
                className={`system-list-item ${activeView === view.id ? "active" : ""}`}
                key={view.id}
                onClick={() => setActiveView(view.id)}
                type="button"
              >
                <span>
                  <strong>{view.label}</strong>
                  <small>{view.id === "chat" ? "Assistant" : humanizeEnum(view.id)}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="data-card intelliaudit-panel">
          <header>
            <div>
              <h3>{views.find((view) => view.id === activeView)?.label}</h3>
              <span>{humanizeEnum(defaultScope.scopeType)} scope</span>
            </div>
            <span className={`pill ${overview?.llmConfigured ? "" : "gold"}`}>
              {overview?.llmConfigured ? "LLM ready" : "Rules mode"}
            </span>
          </header>
          {activeView === "chat" ? (
            <div className="intelliaudit-chat">
              <div className="chat-thread" aria-label="IntelliAudit chat messages">
                {chatMessages.length === 0 ? (
                  <div className="empty-state">No messages</div>
                ) : (
                  chatMessages.map((chat, index) => (
                    <article className={`chat-bubble ${chat.role.toLowerCase()}`} key={`${chat.role}-${index}`}>
                      <strong>{chat.role === "USER" ? "User" : "IntelliAudit"}</strong>
                      <pre>{chat.content}</pre>
                    </article>
                  ))
                )}
              </div>
              <form className="assistant-compose" onSubmit={sendChat}>
                <label className="wide-field">
                  <span>Prompt</span>
                  <textarea onChange={(event) => setChatInput(event.target.value)} value={chatInput} />
                </label>
                <button className="button" disabled={saving} type="submit">
                  <Send size={16} />
                  Send
                </button>
              </form>
            </div>
          ) : null}

          {activeView === "evidence" ? (
            <div className="intelliaudit-section">
              <form className="intelliaudit-form" onSubmit={uploadEvidence}>
                <label>
                  <span>Source type</span>
                  <select onChange={(event) => setSourceType(event.target.value)} value={sourceType}>
                    {sourceTypes.map((type) => (
                      <option key={type} value={type}>
                        {humanizeEnum(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Title</span>
                  <input onChange={(event) => setEvidenceTitle(event.target.value)} value={evidenceTitle} />
                </label>
                <label className="wide-field">
                  <span>Records JSON</span>
                  <textarea onChange={(event) => setEvidenceRecords(event.target.value)} value={evidenceRecords} />
                </label>
                <button className="button" disabled={saving} type="submit">
                  <FileUp size={16} />
                  Stage evidence
                </button>
              </form>
              <DataTable
                columns={[
                  { key: "title", header: "Document", value: (row) => row.title },
                  { key: "source", header: "Source", value: (row) => row.source?.name ?? row.sourceId },
                  { key: "status", header: "Status", value: (row) => humanizeEnum(row.extractionStatus) },
                  { key: "records", header: "Records", value: (row) => row._count?.records ?? 0 },
                  { key: "hash", header: "Hash", value: (row) => row.contentHash, className: "hash-cell", cell: (row) => <code>{row.contentHash.slice(0, 16)}...</code> },
                  { key: "created", header: "Created", value: (row) => new Date(row.createdAt).getTime(), exportValue: (row) => toLocalDate(row.createdAt), cell: (row) => toLocalDate(row.createdAt) }
                ]}
                defaultSort={{ key: "created", direction: "desc" }}
                exportName="intelliaudit-evidence-documents"
                getRowKey={(row) => row.id}
                rows={evidence.documents}
                title="Evidence documents"
              />
            </div>
          ) : null}

          {activeView === "connectors" ? (
            <div className="intelliaudit-section">
              <form className="intelliaudit-form" onSubmit={syncConnector}>
                <label>
                  <span>Provider</span>
                  <select onChange={(event) => setConnectorProvider(event.target.value)} value={connectorProvider}>
                    {connectorProviders.map((provider) => (
                      <option key={provider} value={provider}>
                        {humanizeEnum(provider)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Endpoint</span>
                  <input onChange={(event) => setConnectorEndpoint(event.target.value)} placeholder="https://api.example.com/records" value={connectorEndpoint} />
                </label>
                <label className="wide-field">
                  <span>Fallback records JSON</span>
                  <textarea onChange={(event) => setConnectorRecords(event.target.value)} value={connectorRecords} />
                </label>
                <button className="button" disabled={saving} type="submit">
                  <PlugZap size={16} />
                  Sync connector
                </button>
              </form>
              <DataTable
                columns={[
                  { key: "name", header: "Source", value: (row) => row.name },
                  { key: "type", header: "Type", value: (row) => humanizeEnum(row.sourceType) },
                  { key: "provider", header: "Provider", value: (row) => row.provider ?? "Generic" },
                  { key: "documents", header: "Documents", value: (row) => row._count?.documents ?? 0 },
                  { key: "records", header: "Records", value: (row) => row._count?.records ?? 0 },
                  { key: "syncs", header: "Syncs", value: (row) => row._count?.syncRuns ?? 0 },
                  { key: "latest", header: "Last Sync", value: (row) => row.lastSyncedAt ? new Date(row.lastSyncedAt).getTime() : 0, exportValue: (row) => toLocalDate(row.lastSyncedAt), cell: (row) => toLocalDate(row.lastSyncedAt) }
                ]}
                defaultSort={{ key: "latest", direction: "desc" }}
                exportName="intelliaudit-evidence-sources"
                getRowKey={(row) => row.id}
                rows={evidence.sources}
                title="Evidence sources"
              />
            </div>
          ) : null}

          {activeView === "reconciliations" ? (
            <DataTable
              columns={[
                { key: "title", header: "Batch", value: (row) => row.title },
                { key: "status", header: "Status", value: (row) => humanizeEnum(row.status) },
                { key: "records", header: "Records", value: (row) => row.recordCount },
                { key: "exceptions", header: "Exceptions", value: (row) => row.exceptionCount },
                { key: "debit", header: "Debit", value: (row) => row.totalDebitCents, exportValue: (row) => formatKes(row.totalDebitCents), cell: (row) => formatKes(row.totalDebitCents) },
                { key: "credit", header: "Credit", value: (row) => row.totalCreditCents, exportValue: (row) => formatKes(row.totalCreditCents), cell: (row) => formatKes(row.totalCreditCents) },
                { key: "created", header: "Created", value: (row) => new Date(row.createdAt).getTime(), exportValue: (row) => toLocalDate(row.createdAt), cell: (row) => toLocalDate(row.createdAt) },
                { key: "action", header: "Action", value: (row) => row.status, exportable: false, sortable: false, cell: (row) => row.status === "APPROVED" ? <span className="pill">Approved</span> : <button className="button secondary" disabled={saving} onClick={() => approveReconciliation(row)} type="button"><CheckCircle2 size={15} />Approve</button> }
              ]}
              defaultSort={{ key: "created", direction: "desc" }}
              exportName="intelliaudit-reconciliations"
              getRowKey={(row) => row.id}
              rows={reconciliations}
              title="Reconciliation batches"
            />
          ) : null}

          {activeView === "findings" ? (
            <DataTable
              columns={[
                { key: "severity", header: "Severity", value: (row: IntelliAuditFinding) => row.severity },
                { key: "category", header: "Category", value: (row) => humanizeEnum(row.category) },
                { key: "title", header: "Finding", value: (row) => row.title },
                { key: "observation", header: "Observation", value: (row) => row.observation },
                { key: "recommendation", header: "Recommendation", value: (row) => row.recommendation },
                { key: "status", header: "Status", value: (row) => humanizeEnum(row.status) }
              ]}
              exportName="intelliaudit-findings"
              filters={[
                { key: "severity", label: "Severity", allLabel: "All severities", getValue: (row) => row.severity },
                { key: "status", label: "Status", allLabel: "All statuses", getValue: (row) => row.status }
              ]}
              getRowKey={(row) => row.id}
              rows={evidence.findings}
              title="Findings"
            />
          ) : null}

          {activeView === "reports" ? (
            <div className="intelliaudit-section">
              <form className="intelliaudit-form compact" onSubmit={createReport}>
                <label>
                  <span>Title</span>
                  <input onChange={(event) => setReportTitle(event.target.value)} value={reportTitle} />
                </label>
                <label>
                  <span>Standard</span>
                  <select onChange={(event) => setReportStandard(event.target.value)} value={reportStandard}>
                    {standards.map((standard) => (
                      <option key={standard} value={standard}>
                        {humanizeEnum(standard)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button" disabled={saving} type="submit">
                  <Bot size={16} />
                  Generate draft
                </button>
              </form>
              <DataTable
                columns={[
                  { key: "title", header: "Report", value: (row) => row.title },
                  { key: "standard", header: "Standard", value: (row) => humanizeEnum(row.standard) },
                  { key: "status", header: "Status", value: (row) => humanizeEnum(row.status) },
                  { key: "refs", header: "Refs", value: (row) => row.auditReferences?.length ?? 0 },
                  { key: "created", header: "Created", value: (row) => new Date(row.createdAt).getTime(), exportValue: (row) => toLocalDate(row.createdAt), cell: (row) => toLocalDate(row.createdAt) },
                  { key: "action", header: "Action", value: (row) => row.status, exportable: false, sortable: false, cell: (row) => (
                    <span className="table-action-group">
                      {row.status === "APPROVED" ? <span className="pill">Approved</span> : <button className="button secondary" disabled={saving} onClick={() => approveReport(row)} type="button"><CheckCircle2 size={15} />Approve</button>}
                      <button className="button secondary" disabled={saving} onClick={() => exportReport(row)} type="button">Export</button>
                    </span>
                  ) }
                ]}
                defaultSort={{ key: "created", direction: "desc" }}
                exportName="intelliaudit-reports"
                filters={[
                  { key: "standard", label: "Standard", allLabel: "All standards", getValue: (row) => row.standard },
                  { key: "status", label: "Status", allLabel: "All statuses", getValue: (row) => row.status }
                ]}
                getRowKey={(row) => row.id}
                rows={reports}
                title="Report drafts"
              />
            </div>
          ) : null}

          {activeView === "standards" ? (
            <DataTable
              columns={[
                { key: "name", header: "Reference", value: (row) => row.name },
                { key: "category", header: "Category", value: (row) => humanizeEnum(row.category) },
                { key: "jurisdiction", header: "Jurisdiction", value: (row) => row.jurisdiction ?? "International" },
                { key: "summary", header: "Use", value: (row) => row.summary },
                { key: "source", header: "Source", value: (row) => row.sourceUrl, cell: (row) => <a className="inline-link" href={row.sourceUrl} rel="noopener noreferrer" target="_blank">Open</a> }
              ]}
              exportName="intelliaudit-standards-registry"
              filters={[
                { key: "category", label: "Category", allLabel: "All categories", getValue: (row) => row.category },
                { key: "jurisdiction", label: "Jurisdiction", allLabel: "All jurisdictions", getValue: (row) => row.jurisdiction ?? "International" }
              ]}
              getRowKey={(row) => row.id}
              rows={standardRefs}
              title="Standards registry"
            />
          ) : null}
        </section>
      </section>
    </>
  );
}
