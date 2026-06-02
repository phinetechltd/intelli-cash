import React from "react";
import type { ReactNode } from "react";

interface CollapsibleSectionProps {
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
  summary?: ReactNode;
  title: string;
}

export function CollapsibleSection({
  actions,
  children,
  defaultOpen = false,
  icon,
  summary,
  title
}: CollapsibleSectionProps) {
  return (
    <details className="collapsible-section data-card" open={defaultOpen}>
      <summary>
        <span className="collapsible-section-title">
          {icon}
          <span>
            <strong>{title}</strong>
            {summary ? <em>{summary}</em> : null}
          </span>
        </span>
        {actions ? <span className="collapsible-section-actions">{actions}</span> : null}
      </summary>
      <div className="collapsible-section-body">{children}</div>
    </details>
  );
}
