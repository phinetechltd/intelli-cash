"use client";

import type { ReactNode } from "react";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Search,
  SlidersHorizontal
} from "@/lib/theme-icons";

type SortDirection = "asc" | "desc";
type Primitive = boolean | Date | number | string | null | undefined;

export interface DataTableColumn<T> {
  key: string;
  header: string;
  value: (row: T) => Primitive;
  cell?: (row: T) => ReactNode;
  exportValue?: (row: T) => Primitive;
  filterValue?: (row: T) => Primitive;
  searchable?: boolean;
  sortable?: boolean;
  exportable?: boolean;
  className?: string;
}

export interface DataTableFilter<T> {
  key: string;
  label: string;
  allLabel?: string;
  getValue: (row: T) => Primitive;
  options?: Array<{ label: string; value: string }>;
}

interface DataTableProps<T> {
  title: string;
  rows: T[];
  columns: Array<DataTableColumn<T>>;
  exportName: string;
  filters?: Array<DataTableFilter<T>>;
  initialPageSize?: number;
  defaultSort?: { key: string; direction: SortDirection };
  getRowKey: (row: T) => string;
}

function toText(value: Primitive) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function toComparable(value: Primitive) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = toText(value).trim();
  const numeric = Number(text.replace(/,/g, ""));
  return text !== "" && Number.isFinite(numeric) ? numeric : text.toLowerCase();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DataTable<T>({
  title,
  rows,
  columns,
  exportName,
  filters = [],
  initialPageSize = 10,
  defaultSort,
  getRowKey
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(
    defaultSort ?? null
  );
  const [filterState, setFilterState] = useState<Record<string, string>>(() =>
    Object.fromEntries(filters.map((filter) => [filter.key, "ALL"]))
  );

  const filterSignature = JSON.stringify(filterState);

  useEffect(() => {
    setFilterState((current) => {
      const next = Object.fromEntries(filters.map((filter) => [filter.key, current[filter.key] ?? "ALL"]));
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [filters]);

  const filterOptions = useMemo(
    () =>
      filters.map((filter) => {
        const options =
          filter.options ??
          Array.from(new Set(rows.map((row) => toText(filter.getValue(row))).filter(Boolean)))
            .sort((a, b) => a.localeCompare(b))
            .map((value) => ({ label: value, value }));

        return {
          ...filter,
          options: [{ label: filter.allLabel ?? "All", value: "ALL" }, ...options]
        };
      }),
    [filters, rows]
  );

  const searchableColumns = useMemo(
    () => columns.filter((column) => column.searchable !== false),
    [columns]
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesQuery =
        normalizedQuery === "" ||
        searchableColumns
          .map((column) => toText(column.exportValue?.(row) ?? column.value(row)))
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesFilters = filters.every((filter) => {
        const selected = filterState[filter.key] ?? "ALL";
        return selected === "ALL" || toText(filter.getValue(row)) === selected;
      });

      return matchesQuery && matchesFilters;
    });
  }, [filterSignature, filters, filterState, query, rows, searchableColumns]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;

    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column || column.sortable === false) return filteredRows;

    return [...filteredRows].sort((left, right) => {
      const leftValue = toComparable(column.value(left));
      const rightValue = toComparable(column.value(right));
      const direction = sort.direction === "asc" ? 1 : -1;

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue)) * direction;
    });
  }, [columns, filteredRows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);
  const exportableColumns = columns.filter((column) => column.exportable !== false);
  const start = sortedRows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, sortedRows.length);
  const activeFilterCount = Object.values(filterState).filter((value) => value !== "ALL").length;
  const activeControlCount = activeFilterCount + (query.trim() ? 1 : 0);
  const resultLabel =
    activeControlCount > 0
      ? `${sortedRows.length}/${rows.length}`
      : `${rows.length}`;

  useEffect(() => {
    setPage(1);
  }, [filterSignature, pageSize, query, rows.length, sort?.direction, sort?.key]);

  function toggleSort(column: DataTableColumn<T>) {
    if (column.sortable === false) return;

    setSort((current) => {
      if (current?.key !== column.key) return { key: column.key, direction: "asc" };
      if (current.direction === "asc") return { key: column.key, direction: "desc" };
      return null;
    });
  }

  async function exportExcel() {
    const headers = exportableColumns.map((column) => column.header);
    const body = sortedRows.map((row) =>
      exportableColumns.map((column) => toText(column.exportValue?.(row) ?? column.value(row)))
    );
    const tableHtml = [
      "<html><head><meta charset=\"utf-8\" /></head><body><table>",
      `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`,
      `<tbody>${body
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`,
      "</table></body></html>"
    ].join("");

    downloadBlob(
      new Blob([tableHtml], { type: "application/vnd.ms-excel;charset=utf-8" }),
      `${slugify(exportName)}.xls`
    );
  }

  async function exportPdf() {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable")
    ]);
    const doc = new jsPDF({ orientation: exportableColumns.length > 5 ? "landscape" : "portrait" });
    const autoTable = autoTableModule.default;

    doc.setFontSize(14);
    doc.text(title, 14, 16);
    autoTable(doc, {
      body: sortedRows.map((row) =>
        exportableColumns.map((column) => toText(column.exportValue?.(row) ?? column.value(row)))
      ),
      head: [exportableColumns.map((column) => column.header)],
      margin: { top: 24 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [0, 138, 58], textColor: [255, 255, 255] }
    });
    doc.save(`${slugify(exportName)}.pdf`);
  }

  function clearFilters() {
    setFilterState(Object.fromEntries(filters.map((filter) => [filter.key, "ALL"])));
  }

  return (
    <div className="data-table">
      <div className={`data-table-toolbar ${filterOptions.length === 0 ? "without-filters" : ""}`}>
        <label className="search-box data-table-search" aria-label={`Search ${title}`}>
          <Search size={16} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            value={query}
          />
        </label>

        {filterOptions.length > 0 ? (
          <div className="data-table-filters" aria-label={`${title} filters`}>
            {filterOptions.map((filter) => (
              <label className="table-filter compact-filter" key={filter.key} title={filter.label}>
                <SlidersHorizontal aria-hidden="true" size={15} />
                <span className="sr-only">{filter.label}</span>
                <select
                  aria-label={filter.label}
                  onChange={(event) =>
                    setFilterState((current) => ({ ...current, [filter.key]: event.target.value }))
                  }
                  value={filterState[filter.key] ?? "ALL"}
                >
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {activeFilterCount > 0 ? (
              <button
                aria-label="Clear filters"
                className="icon-button table-toolbar-icon"
                onClick={clearFilters}
                title="Clear filters"
                type="button"
              >
                <RotateCcw size={15} />
              </button>
            ) : null}
          </div>
        ) : null}

        <span className="table-control-meta" aria-live="polite">
          {resultLabel}
          {activeControlCount > 0 ? ` +${activeControlCount}` : ""}
        </span>

        <div className="export-actions" aria-label={`${title} exports`}>
          <button
            aria-label={`Export ${title} to XLS`}
            className="icon-button table-toolbar-icon"
            onClick={exportExcel}
            title="XLS"
            type="button"
          >
            <FileSpreadsheet size={16} />
            <span className="sr-only">XLS</span>
          </button>
          <button
            aria-label={`Export ${title} to PDF`}
            className="icon-button table-toolbar-icon"
            onClick={exportPdf}
            title="PDF"
            type="button"
          >
            <FileText size={16} />
            <span className="sr-only">PDF</span>
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th className={column.className} key={column.key}>
                    <button
                      className="sortable-header"
                      disabled={column.sortable === false}
                      onClick={() => toggleSort(column)}
                      type="button"
                    >
                      <span>{column.header}</span>
                      {active && sort?.direction === "asc" ? <ArrowUp size={14} /> : null}
                      {active && sort?.direction === "desc" ? <ArrowDown size={14} /> : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td className={column.className} data-label={column.header} key={column.key}>
                    {column.cell?.(row) ?? toText(column.value(row))}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 ? (
              <tr>
                <td className="table-empty" colSpan={columns.length}>
                  No records
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="table-pagination">
        <span>
          {start}-{end} / {sortedRows.length}
        </span>
        <label className="page-size">
          Rows
          <select
            onChange={(event) => setPageSize(Number(event.target.value))}
            value={pageSize}
          >
            {[5, 10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="page-buttons">
          <button
            className="button secondary table-page-button"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            className="button secondary table-page-button"
            disabled={page === totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            type="button"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
