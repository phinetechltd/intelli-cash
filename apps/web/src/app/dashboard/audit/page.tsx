"use client";

import { useEffect, useState } from "react";
import { FileText, Fingerprint, Hash, UserCheck } from "@/lib/theme-icons";
import { apiFetch, humanizeEnum } from "../../../lib/api";
import { DataTable } from "../../../components/dashboard/data-table";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { AuditEvent } from "../../../components/dashboard/types";

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAudit() {
      try {
        const response = await apiFetch<AuditEvent[]>("/audit/events");
        if (mounted) setEvents(response);
      } catch (auditError) {
        if (mounted) setError(auditError instanceof Error ? auditError.message : "Audit failed");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAudit();
    return () => {
      mounted = false;
    };
  }, []);

  const actorCount = new Set(events.map((event) => event.actor?.id).filter(Boolean)).size;
  const hashedEvents = events.filter((event) => event.hash).length;
  const eventTypeCount = new Set(events.map((event) => event.type)).size;

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Security & Audit Log</p>
          <h2
            aria-label="Audit"
            className="has-hint"
            data-hint="Review signed event records across authentication, integrations, group operations, configuration, and seeded system setup."
            tabIndex={0}
          >
            Audit
          </h2>
        </div>
        <span className="pill">{events.length} events</span>
      </section>

      <section className="stat-grid">
        <StatCard icon={<FileText size={20} />} label="Events" note="Recent audit records" value={events.length.toString()} />
        <StatCard icon={<Fingerprint size={20} />} label="Event types" note="Distinct platform actions" value={eventTypeCount.toString()} />
        <StatCard icon={<Hash size={20} />} label="Signed" note="Records with hashes" value={hashedEvents.toString()} />
        <StatCard icon={<UserCheck size={20} />} label="Actors" note="Users represented" value={actorCount.toString()} />
      </section>

      <section className="data-card">
        <header>
          <h3>Audit Events</h3>
          <span className="pill">{events.length}</span>
        </header>
        <DataTable
          columns={[
            {
              key: "event",
              header: "Event",
              value: (event) => humanizeEnum(event.type)
            },
            {
              key: "entity",
              header: "Entity",
              value: (event) => `${event.entityType} ${event.entityId}`,
              exportValue: (event) => `${event.entityType}: ${event.entityId}`,
              cell: (event) => (
                <>
                  <strong>{event.entityType}</strong>
                  <br />
                  <span>{event.entityId}</span>
                </>
              )
            },
            {
              key: "actor",
              header: "Actor",
              value: (event) => event.actor?.name ?? "System"
            },
            {
              key: "hash",
              header: "Hash",
              value: (event) => event.hash,
              cell: (event) => <code className="hash-cell">{event.hash.slice(0, 16)}...</code>
            },
            {
              key: "time",
              header: "Time",
              value: (event) => new Date(event.createdAt).getTime(),
              exportValue: (event) => new Date(event.createdAt).toLocaleString("en-KE"),
              cell: (event) => new Date(event.createdAt).toLocaleString("en-KE")
            }
          ]}
          defaultSort={{ key: "time", direction: "desc" }}
          exportName="intelli-cash-audit-events"
          filters={[
            {
              key: "entity",
              label: "Entity",
              allLabel: "All entities",
              getValue: (event) => event.entityType,
              options: Array.from(new Set(events.map((event) => event.entityType))).map((value) => ({
                label: humanizeEnum(value),
                value
              }))
            },
            {
              key: "actor",
              label: "Actor",
              allLabel: "All actors",
              getValue: (event) => event.actor?.name ?? "System"
            }
          ]}
          getRowKey={(event) => event.id}
          initialPageSize={20}
          rows={events}
          title="Audit events"
        />
      </section>
    </>
  );
}
