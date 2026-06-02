"use client";

import type { ReactNode } from "react";
import React from "react";
import { LayoutGrid, List } from "@/lib/theme-icons";
import { useState } from "react";

type CollectionViewMode = "cards" | "list";

interface CollectionViewProps {
  cards: ReactNode;
  list: ReactNode;
  count?: number;
  label: string;
}

export function CollectionView({ cards, count, label, list }: CollectionViewProps) {
  const [mode, setMode] = useState<CollectionViewMode>("cards");

  return (
    <div className="collection-view">
      <div className="collection-toolbar">
        <span className="collection-count">{count === undefined ? label : `${count} ${label}`}</span>
        <div className="segmented view-toggle" role="group" aria-label={`${label} view`}>
          <button
            aria-pressed={mode === "cards"}
            className={mode === "cards" ? "active" : ""}
            onClick={() => setMode("cards")}
            type="button"
          >
            <LayoutGrid size={15} />
            Cards
          </button>
          <button
            aria-pressed={mode === "list"}
            className={mode === "list" ? "active" : ""}
            onClick={() => setMode("list")}
            type="button"
          >
            <List size={15} />
            List
          </button>
        </div>
      </div>
      {mode === "cards" ? cards : list}
    </div>
  );
}
