import type { LedgerEntry, MeetingRow } from "../../types/dashboard";

export interface MeetingWithGroup extends MeetingRow {
  group: {
    id: string;
    name: string;
    code: string;
    county: string;
    gpsLatitude?: number | null;
    gpsLongitude?: number | null;
  };
}

export interface MapPin {
  id: string;
  label: string;
  detail: string;
  county: string;
  count: number;
  liveCount: number;
  status: "live" | "meeting" | "group";
  latitude: number;
  longitude: number;
  x: number;
  y: number;
  exact: boolean;
}

export interface GoogleMapInstance {
  fitBounds(bounds: GoogleLatLngBoundsInstance, padding?: number): void;
}

export interface GoogleMarkerInstance {
  addListener(eventName: string, handler: () => void): void;
  setMap(map: GoogleMapInstance | null): void;
}

export interface GoogleInfoWindowInstance {
  open(options: { anchor: GoogleMarkerInstance; map: GoogleMapInstance }): void;
}

export interface GoogleLatLngBoundsInstance {
  extend(position: { lat: number; lng: number }): void;
}

export interface GoogleMapsApi {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
  InfoWindow: new (options: { content: string }) => GoogleInfoWindowInstance;
  LatLngBounds: new () => GoogleLatLngBoundsInstance;
  Point: new (x: number, y: number) => object;
}

declare global {
  interface Window {
    google?: { maps: GoogleMapsApi };
    __intellicashGoogleMapsPromise?: Promise<void>;
  }
}

export interface GoogleMapsPublicConfig {
  provider: "GOOGLE_MAPS";
  displayName: string;
  configured: boolean;
  apiKey: string | null;
  source: "stored" | "env" | "none";
}

export type CalendarMode = "month" | "week" | "day";
export type MemberMeetingsView = "meetings" | "passbook";

export interface MeetingPassbookSummary {
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

export const countyCoordinates: Record<string, { lat: number; lng: number }> = {
  Bungoma: { lat: 0.57, lng: 34.56 },
  Busia: { lat: 0.46, lng: 34.11 },
  "Elgeyo Marakwet": { lat: 0.82, lng: 35.55 },
  Homabay: { lat: -0.53, lng: 34.46 },
  Kakamega: { lat: 0.28, lng: 34.75 },
  Kiambu: { lat: -1.03, lng: 36.87 },
  Kisumu: { lat: -0.09, lng: 34.76 },
  Meru: { lat: 0.05, lng: 37.65 },
  Migori: { lat: -1.06, lng: 34.47 },
  Nairobi: { lat: -1.29, lng: 36.82 },
  Nakuru: { lat: -0.3, lng: 36.08 },
  Narok: { lat: -1.09, lng: 35.87 },
  Nyandarua: { lat: -0.39, lng: 36.54 },
  Siaya: { lat: 0.06, lng: 34.29 },
  "Tharaka Nithi": { lat: -0.3, lng: 37.91 }
};

export const fallbackGoogleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export const googleMapStyles: Array<Record<string, unknown>> = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "transit",
    stylers: [{ visibility: "off" }]
  },
  {
    featureType: "administrative",
    elementType: "geometry",
    stylers: [{ color: "#b7c6bb" }]
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#d9ecf3" }]
  },
  {
    featureType: "landscape",
    elementType: "geometry",
    stylers: [{ color: "#f3f8f1" }]
  }
];

export function dateTimeLocalInput(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return start;
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + amount);
  return next;
}

export function calendarDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMeetingDate(value: string) {
  return new Date(value).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function formatMeetingTime(value: string) {
  return new Date(value).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function meetingStatusClass(status: string) {
  if (status === "IN_PROGRESS") return "pill";
  if (status === "SEALED" || status === "CLOSED") return "pill blue";
  return "pill gold";
}

function shareCountFromDescription(description: string) {
  const match = description.match(/\b(\d+(?:\.\d+)?)\s+shares?\b/i);
  return match?.[1] ? Number(match[1]) : null;
}

function emptyMeetingPassbookSummary(entry: LedgerEntry): MeetingPassbookSummary {
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

export function buildMeetingPassbookRows(ledger: LedgerEntry[]) {
  const summaries = new Map<string, MeetingPassbookSummary>();

  for (const entry of ledger) {
    const key = entry.meeting?.id ?? entry.meetingId ?? entry.id;
    const summary = summaries.get(key) ?? emptyMeetingPassbookSummary(entry);
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

export function formatShares(sharesBought: number | null, sharePurchaseCents: number) {
  if (sharesBought && sharesBought > 0) {
    return `${sharesBought.toLocaleString("en-KE")} shares`;
  }

  return sharePurchaseCents > 0 ? "Recorded" : "0";
}

export function calendarPeriodLabel(mode: CalendarMode, focusedDate: Date) {
  if (mode === "month") {
    return focusedDate.toLocaleDateString("en-KE", {
      month: "long",
      year: "numeric"
    });
  }

  if (mode === "week") {
    const start = startOfWeek(focusedDate);
    const end = addDays(start, 6);
    return `${formatMeetingDate(start.toISOString())} - ${formatMeetingDate(end.toISOString())}`;
  }

  return focusedDate.toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function shiftCalendarDate(date: Date, mode: CalendarMode, direction: -1 | 1) {
  if (mode === "month") return addMonths(date, direction);
  if (mode === "week") return addDays(date, direction * 7);
  return addDays(date, direction);
}

export function projectKenyaPoint(latitude: number, longitude: number) {
  const minLng = 33.6;
  const maxLng = 42.1;
  const minLat = -4.9;
  const maxLat = 4.8;
  const x = ((longitude - minLng) / (maxLng - minLng)) * 100;
  const y = ((maxLat - latitude) / (maxLat - minLat)) * 100;

  return {
    x: Math.min(95, Math.max(5, x)),
    y: Math.min(92, Math.max(8, y))
  };
}

export function markerColor(status: MapPin["status"]) {
  if (status === "live") return "#00c853";
  if (status === "meeting") return "#f5b700";
  return "#1f7ae0";
}

export function markerTextColor(status: MapPin["status"]) {
  return status === "live" ? "#03210f" : "#ffffff";
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();
  if (window.__intellicashGoogleMapsPromise) return window.__intellicashGoogleMapsPromise;

  window.__intellicashGoogleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[data-intellicash-google-maps]"
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Google Maps could not be loaded.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    const params = new URLSearchParams({ key: apiKey, v: "weekly" });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.dataset.intellicashGoogleMaps = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Google Maps could not be loaded.")),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return window.__intellicashGoogleMapsPromise;
}

export function buildMeetingMapPins(meeting: MeetingWithGroup): MapPin[] {
  const exact =
    typeof meeting.group.gpsLatitude === "number" &&
    typeof meeting.group.gpsLongitude === "number";
  const coordinate = exact
    ? { lat: meeting.group.gpsLatitude as number, lng: meeting.group.gpsLongitude as number }
    : countyCoordinates[meeting.group.county];

  if (!coordinate) return [];

  const point = projectKenyaPoint(coordinate.lat, coordinate.lng);

  return [
    {
      id: meeting.id,
      label: meeting.title,
      detail: `${meeting.group.name} - ${formatMeetingDate(meeting.scheduledAt)}`,
      county: meeting.group.county,
      count: 1,
      liveCount: meeting.status === "IN_PROGRESS" ? 1 : 0,
      status: meeting.status === "IN_PROGRESS" ? "live" : "meeting",
      latitude: coordinate.lat,
      longitude: coordinate.lng,
      exact,
      ...point
    }
  ];
}
