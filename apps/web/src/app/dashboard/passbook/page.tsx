"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, formatKes, humanizeEnum } from "../../../lib/api";
import type { GroupRow, LedgerEntry, User } from "../../../components/dashboard/types";

interface PassbookMeetingSummary {
  key: string;
  meetingTitle: string;
  scheduledAt?: string;
  latestEntryAt: string;
  sharesBought: number | null;
  sharePurchaseCents: number;
  socialFundCents: number;
  loanRepaymentCents: number;
  loanDisbursementCents: number;
  transactions: LedgerEntry[];
}

function shareCountFromDescription(description: string) {
  const match = description.match(/\b(\d+(?:\.\d+)?)\s+shares?\b/i);
  return match?.[1] ? Number(match[1]) : null;
}

function emptyPassbookMeetingSummary(entry: LedgerEntry): PassbookMeetingSummary {
  return {
    key: entry.meeting?.id ?? entry.meetingId ?? entry.id,
    meetingTitle: entry.meeting?.title ?? "No meeting",
    scheduledAt: entry.meeting?.scheduledAt ?? undefined,
    latestEntryAt: entry.createdAt,
    sharesBought: null,
    sharePurchaseCents: 0,
    socialFundCents: 0,
    loanRepaymentCents: 0,
    loanDisbursementCents: 0,
    transactions: []
  };
}

function buildPassbookByMeeting(ledger: LedgerEntry[]) {
  const passbookTypes = new Set([
    "SHARE_PURCHASE",
    "SOCIAL_CONTRIBUTION",
    "LOAN_REPAYMENT",
    "INTERNAL_LOAN_DISBURSEMENT"
  ]);
  const summaries = new Map<string, PassbookMeetingSummary>();

  for (const entry of ledger) {
    if (!passbookTypes.has(entry.type)) continue;

    const key = entry.meeting?.id ?? entry.meetingId ?? entry.id;
    const summary = summaries.get(key) ?? emptyPassbookMeetingSummary(entry);
    summary.transactions.push(entry);

    if (new Date(entry.createdAt).getTime() > new Date(summary.latestEntryAt).getTime()) {
      summary.latestEntryAt = entry.createdAt;
    }

    if (entry.type === "SHARE_PURCHASE") {
      const shares = shareCountFromDescription(entry.description);
      summary.sharesBought = (summary.sharesBought ?? 0) + (shares ?? 0);
      summary.sharePurchaseCents += entry.amountCents;
    } else if (entry.type === "SOCIAL_CONTRIBUTION") {
      summary.socialFundCents += entry.amountCents;
    } else if (entry.type === "LOAN_REPAYMENT") {
      summary.loanRepaymentCents += entry.amountCents;
    } else if (entry.type === "INTERNAL_LOAN_DISBURSEMENT") {
      summary.loanDisbursementCents += entry.amountCents;
    }

    summaries.set(key, summary);
  }

  return Array.from(summaries.values()).sort(
    (left, right) => new Date(right.latestEntryAt).getTime() - new Date(left.latestEntryAt).getTime()
  );
}

function formatShares(sharesBought: number | null, sharePurchaseCents: number) {
  if (sharesBought && sharesBought > 0) {
    return `${sharesBought.toLocaleString("en-KE")} shares`;
  }

  return sharePurchaseCents > 0 ? "Recorded" : "0";
}

function PassbookTransactionsTable({
  label,
  transactions
}: {
  label: string;
  transactions: LedgerEntry[];
}) {
  return (
    <div className="table-wrap passbook-transaction-table-wrap">
      <table className="passbook-transactions-table" aria-label={label}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th>Direction</th>
            <th className="amount-cell">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((entry) => (
            <tr key={entry.id}>
              <td>{new Date(entry.createdAt).toLocaleDateString("en-KE")}</td>
              <td>{humanizeEnum(entry.type)}</td>
              <td>{entry.description}</td>
              <td>
                <span className={entry.direction === "CREDIT" ? "pill blue" : "pill gold"}>
                  {humanizeEnum(entry.direction)}
                </span>
              </td>
              <td className="amount-cell">{formatKes(entry.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MemberPassbookPage() {
  const [user, setUser] = useState<User | null>(null);
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [openMeetingKey, setOpenMeetingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPassbook() {
      try {
        const me = await apiFetch<User>("/auth/me");
        if (me.role !== "MEMBER") {
          setError("Passbook is available for member accounts only.");
          return;
        }

        const groups = await apiFetch<GroupRow[]>("/groups");
        const primaryGroup = groups.find((row) => row.id === me.groupId) ?? groups[0] ?? null;
        const ledgerResponse = primaryGroup
          ? await apiFetch<LedgerEntry[]>(`/groups/${primaryGroup.id}/ledger`)
          : [];

        if (!mounted) return;
        setUser(me);
        setGroup(primaryGroup);
        setLedger(ledgerResponse);
      } catch (passbookError) {
        if (mounted) setError(passbookError instanceof Error ? passbookError.message : "Passbook failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPassbook();
    return () => {
      mounted = false;
    };
  }, []);

  const passbookRows = useMemo(() => buildPassbookByMeeting(ledger), [ledger]);
  const totals = useMemo(
    () =>
      passbookRows.reduce(
        (summary, row) => ({
          shares: summary.shares + row.sharePurchaseCents,
          social: summary.social + row.socialFundCents,
          repayment: summary.repayment + row.loanRepaymentCents,
          disbursement: summary.disbursement + row.loanDisbursementCents
        }),
        { shares: 0, social: 0, repayment: 0, disbursement: 0 }
      ),
    [passbookRows]
  );

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Member Passbook</p>
          <h2
            aria-label="Passbook"
            className="has-hint"
            data-hint="Meeting-level record of shares, social fund payments, loan repayments, and loan disbursements for the signed-in member."
            tabIndex={0}
          >
            Passbook
          </h2>
        </div>
        <Link className="button secondary" href="/dashboard/meetings">
          Meetings
        </Link>
      </section>

      <section className="data-card">
        <header>
          <div>
            <h3>Passbook</h3>
            <span>{group?.code ?? user?.group?.code ?? "Member account"} meeting records</span>
          </div>
          <div className="passbook-summary-line">
            <span>{passbookRows.length} meetings</span>
            <span>{formatKes(totals.shares)} shares</span>
            <span>{formatKes(totals.social)} social</span>
            <span>{formatKes(totals.repayment)} repaid</span>
            <span>{formatKes(totals.disbursement)} disbursed</span>
          </div>
        </header>
        <div className="table-wrap passbook-table-wrap">
          <table className="passbook-table" aria-label="Passbook meeting summary">
            <thead>
              <tr>
                <th>Meeting</th>
                <th>Date</th>
                <th>Shares</th>
                <th className="amount-cell">Share amount</th>
                <th className="amount-cell">Social fund</th>
                <th className="amount-cell">Loan repayment</th>
                <th className="amount-cell">Disbursement</th>
                <th>Transactions</th>
              </tr>
            </thead>
            <tbody>
              {passbookRows.map((row) => {
                const isOpen = openMeetingKey === row.key;
                const date = row.scheduledAt ?? row.latestEntryAt;

                return (
                  <React.Fragment key={row.key}>
                    <tr className={isOpen ? "selected" : ""}>
                      <td>
                        <button
                          aria-expanded={isOpen}
                          className="passbook-meeting-button"
                          onClick={() => setOpenMeetingKey((current) => (current === row.key ? null : row.key))}
                          type="button"
                        >
                          {row.meetingTitle}
                        </button>
                      </td>
                      <td>{new Date(date).toLocaleDateString("en-KE")}</td>
                      <td>{formatShares(row.sharesBought, row.sharePurchaseCents)}</td>
                      <td className="amount-cell">{formatKes(row.sharePurchaseCents)}</td>
                      <td className="amount-cell">{formatKes(row.socialFundCents)}</td>
                      <td className="amount-cell">{formatKes(row.loanRepaymentCents)}</td>
                      <td className="amount-cell">{formatKes(row.loanDisbursementCents)}</td>
                      <td>{row.transactions.length}</td>
                    </tr>
                    {isOpen ? (
                      <tr className="passbook-detail-row">
                        <td colSpan={8}>
                          <PassbookTransactionsTable
                            label={`${row.meetingTitle} transactions`}
                            transactions={row.transactions}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {passbookRows.length === 0 ? (
                <tr className="passbook-empty-row">
                  <td colSpan={8}>No passbook activity</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
