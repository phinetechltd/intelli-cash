"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpenText, CalendarDays, ChevronLeft, ChevronRight, Pencil, X } from "@/lib/theme-icons";
import { formatKes, humanizeEnum } from "../../lib/api";
import type { LedgerEntry } from "../../types/dashboard";
import {
  addDays,
  buildMeetingMapPins,
  calendarDateKey,
  calendarPeriodLabel,
  escapeHtml,
  formatMeetingDate,
  formatMeetingTime,
  formatShares,
  googleMapStyles,
  loadGoogleMaps,
  markerColor,
  markerTextColor,
  meetingStatusClass,
  shiftCalendarDate,
  startOfMonth,
  startOfWeek
} from "./model";
import type {
  CalendarMode,
  GoogleMarkerInstance,
  MapPin,
  MeetingPassbookSummary,
  MeetingWithGroup
} from "./model";

function MapPinOverlay({ pins }: { pins: MapPin[] }) {
  return (
    <div className="google-map-overlay" aria-label="Intellicash group markers">
      {pins.map((pin) => (
        <button
          aria-label={`${pin.label}: ${pin.detail}`}
          className={`map-marker ${pin.status} ${pin.exact ? "exact" : "cluster"}`}
          key={pin.id}
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          title={`${pin.label}\n${pin.detail}`}
          type="button"
        >
          <span>{pin.count > 1 ? pin.count : ""}</span>
        </button>
      ))}
    </div>
  );
}

function GoogleMapsEmbedFallback({ error, pins }: { error?: string | null; pins: MapPin[] }) {
  return (
    <div className="google-map-shell">
      <iframe
        className="google-map-embed"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        src="https://www.google.com/maps?q=Kenya&z=6&output=embed"
        title="Google Map of Intellicash group locations in Kenya"
      />
      <MapPinOverlay pins={pins} />
      <div className="map-provider-note">
        Google Maps embed. Add a browser API key for native map markers.
      </div>
      {error ? (
        <div className="map-status-overlay">
          {error} Showing the Google embed fallback.
        </div>
      ) : null}
    </div>
  );
}

export function GoogleGroupMap({ apiKey, pins }: { apiKey: string; pins: MapPin[] }) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<GoogleMarkerInstance[]>([]);
  const effectiveApiKey = apiKey.trim();
  const [status, setStatus] = useState<"embed" | "loading" | "ready" | "error">(
    effectiveApiKey ? "loading" : "embed"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveApiKey) {
      setStatus("embed");
      return;
    }

    let cancelled = false;

    async function renderGoogleMap() {
      setStatus("loading");
      setError(null);

      try {
        await loadGoogleMaps(effectiveApiKey);
        const maps = window.google?.maps;
        const mapElement = mapElementRef.current;

        if (cancelled || !maps || !mapElement) return;

        markersRef.current.forEach((marker) => marker.setMap(null));
        markersRef.current = [];

        const map = new maps.Map(mapElement, {
          center: { lat: -0.4, lng: 37.2 },
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          styles: googleMapStyles,
          zoom: 6,
          zoomControl: true
        });
        const bounds = new maps.LatLngBounds();

        pins.forEach((pin) => {
          const position = { lat: pin.latitude, lng: pin.longitude };
          const marker = new maps.Marker({
            icon: {
              anchor: new maps.Point(12, 22),
              fillColor: markerColor(pin.status),
              fillOpacity: 1,
              labelOrigin: new maps.Point(12, 9),
              path: "M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7z",
              scale: pin.exact ? 1.35 : 1.7,
              strokeColor: "#ffffff",
              strokeWeight: 2
            },
            label:
              pin.count > 1
                ? {
                    color: markerTextColor(pin.status),
                    fontSize: "11px",
                    fontWeight: "900",
                    text: String(pin.count)
                  }
                : undefined,
            map,
            position,
            title: `${pin.label} - ${pin.detail}`,
            zIndex: pin.status === "live" ? 30 : pin.status === "meeting" ? 20 : 10
          });
          const statusLabel =
            pin.status === "live"
              ? "Live session"
              : pin.status === "meeting"
                ? "Has meeting"
                : "Group cluster";
          const infoWindow = new maps.InfoWindow({
            content: `
              <div class="google-map-info">
                <strong>${escapeHtml(pin.label)}</strong>
                <span>${escapeHtml(pin.detail)}</span>
                <em>${escapeHtml(statusLabel)}${pin.liveCount > 0 ? `, ${pin.liveCount} live` : ""}</em>
              </div>
            `
          });

          marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
          markersRef.current.push(marker);
          bounds.extend(position);
        });

        if (pins.length > 0) map.fitBounds(bounds, 56);
        setStatus("ready");
      } catch (mapError) {
        if (!cancelled) {
          setStatus("error");
          setError(mapError instanceof Error ? mapError.message : "Google Maps failed to load.");
        }
      }
    }

    renderGoogleMap();

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
    };
  }, [effectiveApiKey, pins]);

  if (!effectiveApiKey || status === "embed" || status === "error") {
    return <GoogleMapsEmbedFallback error={status === "error" ? error : null} pins={pins} />;
  }

  return (
    <div className="google-map-shell">
      <div className="google-group-map" ref={mapElementRef} />
      {status === "loading" ? (
        <div className="map-status-overlay">Loading map...</div>
      ) : null}
    </div>
  );
}

export function MeetingCalendar({
  meetings,
  onSelectMeeting
}: {
  meetings: MeetingWithGroup[];
  onSelectMeeting: (meeting: MeetingWithGroup) => void;
}) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [focusedDate, setFocusedDate] = useState(() => {
    const today = new Date();
    const nextMeeting = [...meetings]
      .filter((meeting) => new Date(meeting.scheduledAt).getTime() >= today.getTime())
      .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime())[0];

    return nextMeeting ? new Date(nextMeeting.scheduledAt) : today;
  });

  const meetingsByDay = useMemo(() => {
    const grouped = new Map<string, MeetingWithGroup[]>();

    meetings.forEach((meeting) => {
      const key = calendarDateKey(new Date(meeting.scheduledAt));
      grouped.set(key, [...(grouped.get(key) ?? []), meeting]);
    });

    grouped.forEach((dayMeetings, key) => {
      grouped.set(
        key,
        [...dayMeetings].sort(
          (left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
        )
      );
    });

    return grouped;
  }, [meetings]);

  const monthDays = useMemo(() => {
    const firstDay = startOfMonth(focusedDate);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [focusedDate]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(focusedDate);

    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [focusedDate]);

  const periodLabel = calendarPeriodLabel(mode, focusedDate);
  const todayKey = calendarDateKey(new Date());
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const focusedKey = calendarDateKey(focusedDate);
  const focusedMeetings = meetingsByDay.get(focusedKey) ?? [];
  const gridDays = mode === "month" ? monthDays : weekDays;

  return (
    <section className="data-card member-meeting-calendar-card">
      <header>
        <div>
          <h3>Calendar</h3>
          <span>Meeting dates for your group.</span>
        </div>
        <div className="calendar-toolbar">
          <div className="segmented view-toggle" role="group" aria-label="Calendar view">
            {(["month", "week", "day"] as const).map((option) => (
              <button
                aria-pressed={mode === option}
                className={mode === option ? "active" : ""}
                key={option}
                onClick={() => setMode(option)}
                type="button"
              >
                <CalendarDays size={15} />
                {option === "month" ? "Month" : option === "week" ? "Week" : "Day"}
              </button>
            ))}
          </div>
          <div className="calendar-controls" aria-label="Meeting calendar controls">
            <button className="icon-button" onClick={() => setFocusedDate((current) => shiftCalendarDate(current, mode, -1))} type="button" aria-label={`Previous ${mode}`}>
              <ChevronLeft size={17} />
            </button>
            <strong>{periodLabel}</strong>
            <button className="icon-button" onClick={() => setFocusedDate((current) => shiftCalendarDate(current, mode, 1))} type="button" aria-label={`Next ${mode}`}>
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </header>
      {mode === "day" ? (
        <div className="meeting-calendar-day-view" aria-label={`${periodLabel} meetings`}>
          <div className={`meeting-calendar-day large ${focusedKey === todayKey ? "today" : ""}`}>
            <div className="meeting-calendar-day-header">
              <div>
                <span className="meeting-calendar-date day-date">{focusedDate.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}</span>
                <strong>{focusedMeetings.length === 1 ? "1 meeting" : `${focusedMeetings.length} meetings`}</strong>
              </div>
              {focusedKey === todayKey ? <span className="calendar-today-badge">Today</span> : null}
            </div>
            <div className="meeting-calendar-events expanded">
              {focusedMeetings.map((meeting) => (
                <button
                  className={`meeting-calendar-event ${meeting.status === "IN_PROGRESS" ? "live" : ""}`}
                  key={meeting.id}
                  onClick={() => onSelectMeeting(meeting)}
                  type="button"
                >
                  <strong>{meeting.title}</strong>
                  <span>{formatMeetingTime(meeting.scheduledAt)} - {humanizeEnum(meeting.status)}</span>
                </button>
              ))}
              {focusedMeetings.length === 0 ? <div className="empty-state">No meetings this day</div> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className={`meeting-calendar-grid ${mode === "week" ? "week-view" : ""}`} role="grid" aria-label={`${periodLabel} meetings`}>
          {weekdayLabels.map((label) => (
            <div className="meeting-calendar-weekday" key={label}>
              {label}
            </div>
          ))}
          {gridDays.map((day) => {
            const key = calendarDateKey(day);
            const dayMeetings = meetingsByDay.get(key) ?? [];
            const inMonth = mode === "week" || day.getMonth() === focusedDate.getMonth();
            const isToday = key === todayKey;

            return (
              <div
                className={`meeting-calendar-day ${inMonth ? "" : "muted"} ${isToday ? "today" : ""}`}
                key={key}
                role="gridcell"
              >
                {mode === "week" ? (
                  <div className="meeting-calendar-date-row">
                    <span className="meeting-calendar-date week-date">{day.toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</span>
                    {isToday ? <span className="calendar-today-badge">Today</span> : null}
                  </div>
                ) : (
                  <span className="meeting-calendar-date">{day.getDate()}</span>
                )}
                <div className="meeting-calendar-events">
                  {dayMeetings.slice(0, mode === "week" ? 5 : 3).map((meeting) => (
                    <button
                      className={`meeting-calendar-event ${meeting.status === "IN_PROGRESS" ? "live" : ""}`}
                      key={meeting.id}
                      onClick={() => onSelectMeeting(meeting)}
                      type="button"
                    >
                      <strong>{meeting.title}</strong>
                      <span>{formatMeetingTime(meeting.scheduledAt)}</span>
                    </button>
                  ))}
                  {dayMeetings.length > (mode === "week" ? 5 : 3) ? <em>+{dayMeetings.length - (mode === "week" ? 5 : 3)} more</em> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MeetingPassbookTransactionsTable({
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

export function MeetingPassbookView({ rows }: { rows: MeetingPassbookSummary[] }) {
  const [openMeetingKey, setOpenMeetingKey] = useState<string | null>(null);
  const totals = useMemo(
    () =>
      rows.reduce(
        (summary, row) => ({
          shares: summary.shares + row.sharePurchaseCents,
          social: summary.social + row.socialFundCents,
          repayment: summary.repayment + row.loanRepaymentCents,
          disbursement: summary.disbursement + row.loanDisbursementCents
        }),
        { shares: 0, social: 0, repayment: 0, disbursement: 0 }
      ),
    [rows]
  );

  return (
    <section className="data-card meeting-passbook-card">
      <header>
        <div>
          <h3>Passbook</h3>
          <span>Simple meeting-level member ledger.</span>
        </div>
        <div className="passbook-summary-line">
          <span>{rows.length} meetings</span>
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
            {rows.map((row) => {
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
                        <MeetingPassbookTransactionsTable
                          label={`${row.meetingTitle} transactions`}
                          transactions={row.transactions}
                        />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
            {rows.length === 0 ? (
              <tr className="passbook-empty-row">
                <td colSpan={8}>No passbook activity for meetings</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MeetingDetailDialog({
  canEdit,
  canUseMeetingEntry,
  googleMapsApiKey,
  isMember,
  meeting,
  transactions,
  transactionsError,
  transactionsLoading,
  onClose,
  onEdit
}: {
  canEdit: boolean;
  canUseMeetingEntry: boolean;
  googleMapsApiKey: string;
  isMember: boolean;
  meeting: MeetingWithGroup;
  transactions: LedgerEntry[];
  transactionsError: string | null;
  transactionsLoading: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const completedSteps = meeting.steps.filter((step) => step.status === "COMPLETED").length;
  const mapPins = buildMeetingMapPins(meeting);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`${meeting.title} details`}>
      <button className="modal-backdrop" onClick={onClose} type="button" aria-label="Close meeting details" />
      <section className="data-card credential-modal meeting-detail-modal">
        <header>
          <div>
            <h3>{meeting.title}</h3>
            <span>{meeting.group.name} - {meeting.group.county}</span>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="meeting-detail-body">
          <div className="meeting-detail-summary">
            <span className={meetingStatusClass(meeting.status)}>{humanizeEnum(meeting.status)}</span>
            <div>
              <span>Scheduled</span>
              <strong>{formatMeetingDate(meeting.scheduledAt)} at {formatMeetingTime(meeting.scheduledAt)}</strong>
            </div>
            <div>
              <span>Unlock</span>
              <strong>{humanizeEnum(meeting.unlockStatus)}</strong>
            </div>
            <div>
              <span>GPS</span>
              <strong>{meeting.gpsCompliant ? "Compliant" : "Pending"}</strong>
            </div>
            <div>
              <span>Attendance</span>
              <strong>{meeting.attendance.length} members</strong>
            </div>
            <div>
              <span>Transactions</span>
              <strong>{formatKes(meeting.transactionTotal)}</strong>
            </div>
            <div>
              <span>Keys</span>
              <strong>{meeting.keySubmissions?.length ?? 0} verified</strong>
            </div>
          </div>

          {isMember ? (
            <div className="member-meeting-detail-map">
              {mapPins.length > 0 ? (
                <GoogleGroupMap apiKey={googleMapsApiKey} pins={mapPins} />
              ) : (
                <div className="empty-state">No meeting location available</div>
              )}
            </div>
          ) : null}

          <div className="meeting-detail-sections">
            <section>
              <h4>Workflow</h4>
              <div className="meeting-step-list">
                {meeting.steps.map((step) => (
                  <div className="meeting-step-item" key={step.id}>
                    <span className={step.status === "COMPLETED" ? "pill" : "pill gold"}>{humanizeEnum(step.status)}</span>
                    <div>
                      <strong>{step.name}</strong>
                      <small>{step.completedAt ? `Completed ${formatMeetingDate(step.completedAt)}` : "Pending"}</small>
                    </div>
                  </div>
                ))}
                {meeting.steps.length === 0 ? <div className="empty-state">No workflow steps</div> : null}
              </div>
            </section>
            <section>
              <h4>Notes</h4>
              <p>{meeting.minutes?.trim() || "No minutes recorded yet."}</p>
              <small>{completedSteps}/{meeting.steps.length} steps completed</small>
            </section>
          </div>

          <section className="meeting-transaction-section">
            <header>
              <div>
                <h4>{isMember ? "My Transactions" : "Member Transactions"}</h4>
                <span>{transactions.length} records for this meeting</span>
              </div>
              <span className="pill blue">{formatKes(transactions.reduce((sum, entry) => sum + entry.amountCents, 0))}</span>
            </header>
            {transactionsLoading ? <div className="empty-state">Loading transactions...</div> : null}
            {!transactionsLoading && transactionsError ? (
              <div className="notice warning">{transactionsError}</div>
            ) : null}
            {!transactionsLoading && !transactionsError ? (
              <div className="meeting-transaction-list">
                {transactions.map((entry) => (
                  <div className="meeting-transaction-row" key={entry.id}>
                    <div>
                      <strong>{humanizeEnum(entry.type)}</strong>
                      <span>{entry.description}</span>
                      <em>{entry.member?.fullName ?? "Member transaction"}</em>
                    </div>
                    <div>
                      <span className={entry.direction === "CREDIT" ? "pill blue" : "pill gold"}>
                        {humanizeEnum(entry.direction)}
                      </span>
                      <strong>{formatKes(entry.amountCents)}</strong>
                    </div>
                  </div>
                ))}
                {transactions.length === 0 ? <div className="empty-state">No member transactions for this meeting</div> : null}
              </div>
            ) : null}
          </section>

          <div className="credential-actions">
            {canEdit ? (
              <button className="button secondary" onClick={onEdit} type="button">
                <Pencil size={16} />
                Edit
              </button>
            ) : null}
            {canUseMeetingEntry ? (
              <Link className="button" href={`/dashboard/meetings/${meeting.id}/entry`}>
                <BookOpenText size={16} />
                Entry
              </Link>
            ) : null}
            <Link className="button secondary" href={isMember ? `/dashboard/groups/${meeting.group.id}/meetings` : `/dashboard/groups/${meeting.group.id}`}>
              {isMember ? "Keys" : "Group"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
