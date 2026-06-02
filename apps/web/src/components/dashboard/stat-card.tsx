import React, { type ReactNode } from "react";

export function StatCard({
  icon,
  label,
  value,
  note
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  const cardClassName = value.length > 14 ? "stat-card stat-card-long-value" : "stat-card";

  return (
    <article className={cardClassName} aria-label={note ? `${label}. ${note}` : label}>
      <header>
        <span>{label}</span>
        {icon}
      </header>
      <strong title={value}>{value}</strong>
      {note ? <span className="stat-card-note">{note}</span> : null}
    </article>
  );
}
