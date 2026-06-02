"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ShieldCheck, UserPlus, WalletCards, XCircle } from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../../../lib/api";
import { DataTable } from "../../../components/dashboard/data-table";
import { StatCard } from "../../../components/dashboard/stat-card";
import type {
  AgentRow,
  PartnerSignupRequest,
  PartnerWalletTransaction
} from "../../../components/dashboard/types";

export default function PaymentsAdminPage() {
  const [requests, setRequests] = useState<PartnerSignupRequest[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [transactions, setTransactions] = useState<PartnerWalletTransaction[]>([]);
  const [activeView, setActiveView] = useState<"signups" | "payments">("signups");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [visitNotes, setVisitNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    const [signupResponse, paymentResponse, agentResponse] = await Promise.all([
      apiFetch<PartnerSignupRequest[]>("/partner-signup-requests"),
      apiFetch<PartnerWalletTransaction[]>("/payment-requests"),
      apiFetch<AgentRow[]>("/village-agents").catch(() => [])
    ]);
    setRequests(signupResponse);
    setTransactions(paymentResponse);
    setAgents(agentResponse);
    setAssignmentDrafts(
      signupResponse.reduce<Record<string, string>>((drafts, request) => {
        if (request.assignedVillageAgentId) drafts[request.id] = request.assignedVillageAgentId;
        return drafts;
      }, {})
    );
  }

  useEffect(() => {
    let mounted = true;

    loadPage()
      .catch((pageError) => {
        if (mounted) setError(pageError instanceof Error ? pageError.message : "Payments failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const pendingSignups = requests.filter((request) => request.status === "PENDING").length;
  const pendingWithdrawals = transactions.filter(
    (transaction) => transaction.type === "WITHDRAWAL" && transaction.status === "PENDING"
  ).length;
  const completedMoney = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.status === "COMPLETED")
        .reduce((sum, transaction) => sum + transaction.amountCents, 0),
    [transactions]
  );

  async function approveSignup(request: PartnerSignupRequest) {
    setBusyId(request.id);
    setMessage(null);
    try {
      await apiFetch(`/partner-signup-requests/${request.id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          password: "IntellicashDemo#2026",
          reviewNotes: "Approved from admin payments dashboard."
        })
      });
      setMessage({ ok: true, text: `${request.organizationName} account created.` });
      await loadPage();
    } catch (approveError) {
      setMessage({ ok: false, text: approveError instanceof Error ? approveError.message : "Approval failed" });
    } finally {
      setBusyId(null);
    }
  }

  async function assignFieldAgent(request: PartnerSignupRequest) {
    const villageAgentId = assignmentDrafts[request.id] || request.assignedVillageAgentId;
    if (!villageAgentId) {
      setMessage({ ok: false, text: "Select a VA / CBT before assignment." });
      return;
    }

    setBusyId(request.id);
    setMessage(null);
    try {
      await apiFetch(`/partner-signup-requests/${request.id}/assign-agent`, {
        method: "PATCH",
        body: JSON.stringify({
          villageAgentId,
          notes: visitNotes[request.id] || undefined
        })
      });
      setMessage({ ok: true, text: `${request.organizationName} assigned for field visit.` });
      await loadPage();
    } catch (assignError) {
      setMessage({ ok: false, text: assignError instanceof Error ? assignError.message : "Agent assignment failed" });
    } finally {
      setBusyId(null);
    }
  }

  async function recordFieldVisit(request: PartnerSignupRequest, status: "APPROVED" | "REJECTED") {
    setBusyId(request.id);
    setMessage(null);
    try {
      await apiFetch(`/partner-signup-requests/${request.id}/field-visit`, {
        method: "POST",
        body: JSON.stringify({
          status,
          notes: visitNotes[request.id] || undefined
        })
      });
      setMessage({
        ok: true,
        text:
          status === "APPROVED"
            ? `${request.organizationName} field visit approved.`
            : `${request.organizationName} field visit rejected.`
      });
      await loadPage();
    } catch (visitError) {
      setMessage({ ok: false, text: visitError instanceof Error ? visitError.message : "Field visit update failed" });
    } finally {
      setBusyId(null);
    }
  }

  async function rejectSignup(request: PartnerSignupRequest) {
    setBusyId(request.id);
    setMessage(null);
    try {
      await apiFetch(`/partner-signup-requests/${request.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reviewNotes: "Rejected from admin payments dashboard." })
      });
      setMessage({ ok: true, text: `${request.organizationName} request rejected.` });
      await loadPage();
    } catch (rejectError) {
      setMessage({ ok: false, text: rejectError instanceof Error ? rejectError.message : "Rejection failed" });
    } finally {
      setBusyId(null);
    }
  }

  async function approveWithdrawal(transaction: PartnerWalletTransaction) {
    setBusyId(transaction.id);
    setMessage(null);
    try {
      await apiFetch(`/payment-requests/${transaction.id}/approve-withdrawal`, { method: "POST" });
      setMessage({ ok: true, text: "Withdrawal approved and payout queued." });
      await loadPage();
    } catch (approveError) {
      setMessage({
        ok: false,
        text: approveError instanceof Error ? approveError.message : "Withdrawal approval failed"
      });
    } finally {
      setBusyId(null);
    }
  }

  async function rejectWithdrawal(transaction: PartnerWalletTransaction) {
    setBusyId(transaction.id);
    setMessage(null);
    try {
      await apiFetch(`/payment-requests/${transaction.id}/reject-withdrawal`, {
        method: "POST",
        body: JSON.stringify({ reason: "Rejected from admin payments dashboard." })
      });
      setMessage({ ok: true, text: "Withdrawal rejected and held funds released." });
      await loadPage();
    } catch (rejectError) {
      setMessage({
        ok: false,
        text: rejectError instanceof Error ? rejectError.message : "Withdrawal rejection failed"
      });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Payment Operations</p>
          <h2
            aria-label="Payments"
            className="has-hint"
            data-hint="Approve partner, lender, and group-account access requests, review wallet flows, and control payout requests before provider disbursement."
            tabIndex={0}
          >
            Payments
          </h2>
        </div>
      </section>

      {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

      <section className="stat-grid">
        <StatCard icon={<UserPlus size={20} />} label="Pending signups" note="Awaiting admin review" value={pendingSignups.toString()} />
        <StatCard icon={<WalletCards size={20} />} label="Pending withdrawals" note="Funds currently held" value={pendingWithdrawals.toString()} />
        <StatCard icon={<CheckCircle2 size={20} />} label="Completed value" note="Confirmed payment flows" value={formatKes(completedMoney)} />
        <StatCard icon={<ShieldCheck size={20} />} label="Transactions" note="Wallet and project activity" value={transactions.length.toString()} />
      </section>

      <section className="system-workspace" aria-label="Payment administration workspace">
        <aside className="system-list-panel">
          <nav className="system-list" aria-label="Payment administration menu">
            <button
              className={`system-list-item ${activeView === "signups" ? "active" : ""}`}
              onClick={() => setActiveView("signups")}
              type="button"
            >
              <span>
                <strong>Signup Requests</strong>
                <small>Partner, lender, and group account reviews</small>
              </span>
              <span className={`pill ${pendingSignups > 0 ? "gold" : ""}`}>
                {pendingSignups} pending
              </span>
              <span className="system-list-meta">
                <small>{requests.length} requests</small>
                <small>Accounts</small>
              </span>
            </button>
            <button
              className={`system-list-item ${activeView === "payments" ? "active" : ""}`}
              onClick={() => setActiveView("payments")}
              type="button"
            >
              <span>
                <strong>Wallet Transactions</strong>
                <small>Wallet flows</small>
              </span>
              <span className={`pill ${pendingWithdrawals > 0 ? "gold" : ""}`}>
                {pendingWithdrawals} pending
              </span>
              <span className="system-list-meta">
                <small>{transactions.length} transactions</small>
                <small>{formatKes(completedMoney)} completed</small>
              </span>
            </button>
          </nav>
        </aside>

        {activeView === "signups" ? (
        <section className="data-card system-view">
          <header>
            <div>
              <h3>Signup Requests</h3>
              <span>{pendingSignups} pending</span>
            </div>
          </header>
          <DataTable
            columns={[
              {
                key: "organization",
                header: "Organization",
                value: (request) => `${request.organizationName} ${request.contactEmail}`,
                cell: (request) => (
                  <>
                    <strong>{request.organizationName}</strong>
                    <br />
                    <span>
                      {request.requestedRole === "GROUP_ACCOUNT" ? "Champion owner: " : ""}
                      {request.contactName} - {request.contactEmail}
                    </span>
                    <br />
                    <span>{request.organizationType}</span>
                  </>
                )
              },
              {
                key: "role",
                header: "Type",
                value: (request) => humanizeEnum(request.requestedRole),
                cell: (request) => <span className="pill blue">{humanizeEnum(request.requestedRole)}</span>
              },
              {
                key: "county",
                header: "County",
                value: (request) => request.county ?? "Unassigned"
              },
              {
                key: "details",
                header: "Details",
                value: (request) =>
                  [
                    request.groupSubCounty,
                    request.groupLocation,
                    request.groupMeetingDay,
                    request.estimatedMembers ? `${request.estimatedMembers} members` : null,
                    request.championRole,
                    request.groupObjective ?? request.valueProposition
                  ]
                    .filter(Boolean)
                    .join(" "),
                cell: (request) =>
                  request.requestedRole === "GROUP_ACCOUNT" ? (
                    <span>
                      {[request.groupSubCounty, request.groupLocation, request.groupMeetingDay]
                        .filter(Boolean)
                        .join(" - ") || "Group details pending"}
                      {request.estimatedMembers ? ` - ${request.estimatedMembers} members` : ""}
                      {request.championRole ? ` - ${request.championRole}` : ""}
                    </span>
                  ) : (
                    request.valueProposition ?? request.requestedPartnerType
                  )
              },
              {
                key: "fieldVisit",
                header: "Field visit",
                value: (request) =>
                  request.requestedRole === "GROUP_ACCOUNT"
                    ? [
                        request.assignedVillageAgent?.name ?? "Unassigned",
                        request.fieldVisitStatus ?? "PENDING_ASSIGNMENT",
                        request.fieldVisitNotes ?? ""
                      ].join(" ")
                    : "Not required",
                cell: (request) =>
                  request.requestedRole === "GROUP_ACCOUNT" && request.status === "PENDING" ? (
                    <div className="field-visit-review">
                      <span className="pill">{humanizeEnum(request.fieldVisitStatus ?? "PENDING_ASSIGNMENT")}</span>
                      <select
                        aria-label={`Assign VA / CBT for ${request.organizationName}`}
                        className="table-inline-select"
                        disabled={busyId === request.id}
                        onChange={(event) =>
                          setAssignmentDrafts((current) => ({
                            ...current,
                            [request.id]: event.target.value
                          }))
                        }
                        value={assignmentDrafts[request.id] ?? request.assignedVillageAgentId ?? ""}
                      >
                        <option value="">Select VA / CBT</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`Field visit notes for ${request.organizationName}`}
                        className="table-inline-input"
                        disabled={busyId === request.id}
                        onChange={(event) =>
                          setVisitNotes((current) => ({
                            ...current,
                            [request.id]: event.target.value
                          }))
                        }
                        placeholder="Visit notes"
                        value={visitNotes[request.id] ?? request.fieldVisitNotes ?? ""}
                      />
                      <div className="table-action-group">
                        <button
                          className="button secondary table-action-button"
                          disabled={busyId === request.id}
                          onClick={() => assignFieldAgent(request)}
                          type="button"
                        >
                          Assign
                        </button>
                        <button
                          className="button secondary table-action-button"
                          disabled={busyId === request.id || !request.assignedVillageAgentId}
                          onClick={() => recordFieldVisit(request, "APPROVED")}
                          type="button"
                        >
                          Visit ok
                        </button>
                        <button
                          className="button secondary table-action-button"
                          disabled={busyId === request.id || !request.assignedVillageAgentId}
                          onClick={() => recordFieldVisit(request, "REJECTED")}
                          type="button"
                        >
                          Reject visit
                        </button>
                      </div>
                    </div>
                  ) : request.requestedRole === "GROUP_ACCOUNT" ? (
                    <span>
                      {request.assignedVillageAgent?.name ?? "Unassigned"} - {humanizeEnum(request.fieldVisitStatus ?? "PENDING_ASSIGNMENT")}
                    </span>
                  ) : (
                    "Not required"
                  )
              },
              {
                key: "status",
                header: "Status",
                value: (request) => humanizeEnum(request.status),
                cell: (request) => <span className="pill">{humanizeEnum(request.status)}</span>
              },
              {
                key: "actions",
                header: "Actions",
                value: () => "",
                exportable: false,
                searchable: false,
                sortable: false,
                cell: (request) =>
                  request.status === "PENDING" ? (
                    <div className="table-action-group">
                      <button
                        className="button secondary table-action-button"
                        disabled={
                          busyId === request.id ||
                          (request.requestedRole === "GROUP_ACCOUNT" && request.fieldVisitStatus !== "APPROVED")
                        }
                        onClick={() => approveSignup(request)}
                        type="button"
                      >
                        <CheckCircle2 size={15} />
                        {request.requestedRole === "GROUP_ACCOUNT" ? "Create account" : "Approve"}
                      </button>
                      <button
                        className="button secondary table-action-button"
                        disabled={busyId === request.id}
                        onClick={() => rejectSignup(request)}
                        type="button"
                      >
                        <XCircle size={15} />
                        Reject
                      </button>
                    </div>
                  ) : (
                    request.reviewNotes ?? "Reviewed"
                  )
              }
            ]}
            exportName="intelli-cash-signup-requests"
            filters={[
              {
                key: "status",
                label: "Status",
                allLabel: "All statuses",
                getValue: (request) => request.status
              },
              {
                key: "role",
                label: "Role",
                allLabel: "All roles",
                getValue: (request) => request.requestedRole
              }
            ]}
            getRowKey={(request) => request.id}
            rows={requests}
            title="Signup requests"
          />
        </section>
      ) : (
        <section className="data-card system-view">
          <header>
            <div>
              <h3>Transactions</h3>
              <span>{transactions.length} transactions</span>
            </div>
          </header>
          <DataTable
            columns={[
              {
                key: "partner",
                header: "Partner",
                value: (transaction) => transaction.partner?.name ?? transaction.customerName ?? "Public"
              },
              {
                key: "type",
                header: "Type",
                value: (transaction) => humanizeEnum(transaction.type),
                cell: (transaction) => <span className="pill blue">{humanizeEnum(transaction.type)}</span>
              },
              {
                key: "amount",
                header: "Amount",
                value: (transaction) => transaction.amountCents,
                cell: (transaction) => formatKes(transaction.amountCents)
              },
              {
                key: "project",
                header: "Project",
                value: (transaction) => transaction.programme?.name ?? "Wallet"
              },
              {
                key: "provider",
                header: "Provider",
                value: (transaction) => humanizeEnum(transaction.provider)
              },
              {
                key: "status",
                header: "Status",
                value: (transaction) => humanizeEnum(transaction.status),
                cell: (transaction) => <span className="pill">{humanizeEnum(transaction.status)}</span>
              },
              {
                key: "actions",
                header: "Actions",
                value: () => "",
                exportable: false,
                searchable: false,
                sortable: false,
                cell: (transaction) =>
                  transaction.type === "WITHDRAWAL" && transaction.status === "PENDING" ? (
                    <div className="table-action-group">
                      <button
                        className="button secondary table-action-button"
                        disabled={busyId === transaction.id}
                        onClick={() => approveWithdrawal(transaction)}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="button secondary table-action-button"
                        disabled={busyId === transaction.id}
                        onClick={() => rejectWithdrawal(transaction)}
                        type="button"
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    transaction.failureReason ?? transaction.providerReference ?? "No action"
                  )
              }
            ]}
            exportName="intelli-cash-payment-requests"
            filters={[
              {
                key: "status",
                label: "Status",
                allLabel: "All statuses",
                getValue: (transaction) => transaction.status
              },
              {
                key: "type",
                label: "Type",
                allLabel: "All types",
                getValue: (transaction) => transaction.type
              }
            ]}
            getRowKey={(transaction) => transaction.id}
            rows={transactions}
            title="Payment requests"
          />
        </section>
      )}
      </section>
    </>
  );
}
