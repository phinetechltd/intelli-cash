"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, FileText, TrendingUp } from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../../../../../lib/api";
import { DataTable } from "../../../../../components/dashboard/data-table";
import type { LedgerEntry } from "../../../../../components/dashboard/types";

interface GroupSummary {
  id: string;
  name: string;
  code: string;
  fundAccounts: Array<{ id: string; type: string; balanceCents: number; currency: string }>;
}

interface LedgerBreakdownRow {
  key: string;
  label: string;
  amountCents: number;
  count: number;
  percent: number;
}

function sumLedger(entries: LedgerEntry[], direction?: string) {
  return entries
    .filter((entry) => !direction || entry.direction === direction)
    .reduce((total, entry) => total + entry.amountCents, 0);
}

function buildBreakdown(
  entries: LedgerEntry[],
  keyFor: (entry: LedgerEntry) => string,
  labelFor: (key: string) => string
): LedgerBreakdownRow[] {
  const buckets = new Map<string, { amountCents: number; count: number }>();

  entries.forEach((entry) => {
    const key = keyFor(entry);
    const bucket = buckets.get(key) ?? { amountCents: 0, count: 0 };
    bucket.amountCents += entry.amountCents;
    bucket.count += 1;
    buckets.set(key, bucket);
  });

  const maxAmount = Math.max(...Array.from(buckets.values()).map((bucket) => bucket.amountCents), 1);

  return Array.from(buckets.entries())
    .map(([key, bucket]) => ({
      key,
      label: labelFor(key),
      amountCents: bucket.amountCents,
      count: bucket.count,
      percent: Math.max(4, Math.round((bucket.amountCents / maxAmount) * 100))
    }))
    .sort((first, second) => second.amountCents - first.amountCents)
    .slice(0, 6);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-KE", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export default function GroupLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      const [groupResponse, ledgerResponse] = await Promise.all([
        apiFetch<GroupSummary>(`/groups/${id}`),
        apiFetch<LedgerEntry[]>(`/groups/${id}/ledger`)
      ]);

      if (!mounted) return;
      setGroup(groupResponse);
      setLedger(ledgerResponse);
    }

    loadPage()
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Ledger failed to load");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  const totalBalanceCents = useMemo(
    () => group?.fundAccounts.reduce((total, account) => total + account.balanceCents, 0) ?? 0,
    [group]
  );
  const totalCreditCents = useMemo(() => sumLedger(ledger, "CREDIT"), [ledger]);
  const totalDebitCents = useMemo(() => sumLedger(ledger, "DEBIT"), [ledger]);
  const netMovementCents = totalCreditCents - totalDebitCents;
  const latestEntry = useMemo(
    () => [...ledger].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())[0],
    [ledger]
  );
  const transactionTypes = useMemo(
    () => buildBreakdown(ledger, (entry) => entry.type, humanizeEnum),
    [ledger]
  );
  const fundBreakdown = useMemo(
    () =>
      buildBreakdown(
        ledger,
        (entry) => entry.fundAccount?.type ?? "UNASSIGNED",
        (key) => (key === "UNASSIGNED" ? "Unassigned" : humanizeEnum(key))
      ),
    [ledger]
  );

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading compact-group-heading">
        <div>
          <Link className="inline-back" href={`/dashboard/groups/${id}`}>
            <ArrowLeft size={17} />
            {group?.name ?? "Group"}
          </Link>
          <p className="eyebrow">Group Ledger</p>
          <h2>{group?.code ?? "Ledger"}</h2>
          <p>Read-only view of fund balances, movement, and append-only ledger records.</p>
        </div>
        <span className="pill">{ledger.length} entries</span>
      </section>

      <section className="stat-grid compact-ledger-stats">
        <article className="stat-card">
          <header>
            <span>Total balance</span>
            <FileText size={18} />
          </header>
          <strong>{formatKes(totalBalanceCents)}</strong>
        </article>
        <article className="stat-card">
          <header>
            <span>Credits</span>
            <TrendingUp size={18} />
          </header>
          <strong>{formatKes(totalCreditCents)}</strong>
        </article>
        <article className="stat-card">
          <header>
            <span>Debits</span>
            <BarChart3 size={18} />
          </header>
          <strong>{formatKes(totalDebitCents)}</strong>
        </article>
        <article className="stat-card stat-card-long-value">
          <header>
            <span>Net movement</span>
            <FileText size={18} />
          </header>
          <strong>{formatKes(netMovementCents)}</strong>
          <p className="stat-card-note">
            Latest: {latestEntry ? formatDateTime(latestEntry.createdAt) : "No records yet"}
          </p>
        </article>
      </section>

      <section className="ledger-dashboard-grid" aria-label="Ledger charts">
        <article className="data-card ledger-chart-card">
          <header>
            <div>
              <h3>Transaction mix</h3>
              <span>Grouped by ledger type.</span>
            </div>
            <BarChart3 size={18} />
          </header>
          <div className="ledger-bar-list">
            {transactionTypes.length > 0 ? (
              transactionTypes.map((row) => (
                <div className="ledger-bar-row" key={row.key}>
                  <div>
                    <strong>{row.label}</strong>
                    <span>{row.count} entries</span>
                  </div>
                  <div className="ledger-bar-track" aria-hidden="true">
                    <span style={{ width: `${row.percent}%` }} />
                  </div>
                  <em>{formatKes(row.amountCents)}</em>
                </div>
              ))
            ) : (
              <div className="empty-state">No ledger records</div>
            )}
          </div>
        </article>

        <article className="data-card ledger-chart-card">
          <header>
            <div>
              <h3>Fund movement</h3>
              <span>Activity by fund account.</span>
            </div>
            <FileText size={18} />
          </header>
          <div className="ledger-bar-list">
            {fundBreakdown.length > 0 ? (
              fundBreakdown.map((row) => (
                <div className="ledger-bar-row" key={row.key}>
                  <div>
                    <strong>{row.label}</strong>
                    <span>{row.count} entries</span>
                  </div>
                  <div className="ledger-bar-track green" aria-hidden="true">
                    <span style={{ width: `${row.percent}%` }} />
                  </div>
                  <em>{formatKes(row.amountCents)}</em>
                </div>
              ))
            ) : (
              <div className="empty-state">No fund movement</div>
            )}
          </div>
        </article>
      </section>

      <section className="data-card organized-ledger-card">
        <header>
          <div>
            <h3>Organized ledger</h3>
            <span>Filter by type, direction, or fund. Data entry is handled from meeting workflows.</span>
          </div>
          <span className="pill">{ledger.length} records</span>
        </header>
        <DataTable
          columns={[
            {
              key: "date",
              header: "Date",
              value: (entry) => new Date(entry.createdAt).getTime(),
              exportValue: (entry) => formatDateTime(entry.createdAt),
              cell: (entry) => formatDateTime(entry.createdAt)
            },
            {
              key: "entry",
              header: "Entry",
              value: (entry) => `${humanizeEnum(entry.type)} ${entry.description}`,
              exportValue: (entry) => humanizeEnum(entry.type),
              cell: (entry) => (
                <>
                  <strong>{humanizeEnum(entry.type)}</strong>
                  <br />
                  <span>{entry.description}</span>
                </>
              )
            },
            {
              key: "member",
              header: "Member",
              value: (entry) => entry.member?.fullName ?? "Group record"
            },
            {
              key: "meeting",
              header: "Meeting",
              value: (entry) => entry.meeting?.title ?? "No meeting"
            },
            {
              key: "fund",
              header: "Fund",
              value: (entry) => (entry.fundAccount?.type ? humanizeEnum(entry.fundAccount.type) : "Unassigned")
            },
            {
              key: "direction",
              header: "Direction",
              value: (entry) => entry.direction,
              cell: (entry) => <span className={entry.direction === "CREDIT" ? "pill blue" : "pill gold"}>{entry.direction}</span>
            },
            {
              key: "amount",
              header: "Amount",
              value: (entry) => entry.amountCents,
              exportValue: (entry) => formatKes(entry.amountCents),
              cell: (entry) => (
                <strong className={entry.direction === "CREDIT" ? "ledger-credit" : "ledger-debit"}>
                  {formatKes(entry.amountCents)}
                </strong>
              )
            }
          ]}
          defaultSort={{ key: "date", direction: "desc" }}
          exportName={`${group?.code ?? "group"}-ledger`}
          filters={[
            {
              key: "type",
              label: "Type",
              allLabel: "All types",
              getValue: (entry) => entry.type,
              options: Array.from(new Set(ledger.map((entry) => entry.type))).map((value) => ({
                label: humanizeEnum(value),
                value
              }))
            },
            {
              key: "direction",
              label: "Direction",
              allLabel: "All directions",
              getValue: (entry) => entry.direction
            },
            {
              key: "fund",
              label: "Fund",
              allLabel: "All funds",
              getValue: (entry) => entry.fundAccount?.type ?? "UNASSIGNED",
              options: Array.from(new Set(ledger.map((entry) => entry.fundAccount?.type ?? "UNASSIGNED"))).map((value) => ({
                label: value === "UNASSIGNED" ? "Unassigned" : humanizeEnum(value),
                value
              }))
            }
          ]}
          getRowKey={(entry) => entry.id}
          initialPageSize={10}
          rows={ledger}
          title="Ledger"
        />
      </section>
    </>
  );
}
