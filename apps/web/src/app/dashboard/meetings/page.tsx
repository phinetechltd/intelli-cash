"use client";

import type { FormEvent } from "react";
import React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, BookOpenText, CalendarDays, CheckCircle2, Eye, MapPinned, Pencil, Timer, X } from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../../../lib/api";
import { CollectionView } from "../../../components/dashboard/collection-view";
import { DataTable } from "../../../components/dashboard/data-table";
import { StatCard } from "../../../components/dashboard/stat-card";
import type { GroupRow, LedgerEntry, User } from "../../../components/dashboard/types";
import {
  GoogleGroupMap,
  MeetingCalendar,
  MeetingDetailDialog,
  MeetingPassbookView
} from "../../../features/meetings/components";
import {
  buildMeetingPassbookRows,
  countyCoordinates,
  dateTimeLocalInput,
  fallbackGoogleMapsApiKey,
  meetingStatusClass,
  projectKenyaPoint
} from "../../../features/meetings/model";
import type {
  GoogleMapsPublicConfig,
  MapPin,
  MeetingWithGroup,
  MemberMeetingsView
} from "../../../features/meetings/model";

export default function MeetingsPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingWithGroup[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(fallbackGoogleMapsApiKey);
  const [googleMapsConfig, setGoogleMapsConfig] = useState<GoogleMapsPublicConfig | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<MeetingWithGroup | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingWithGroup | null>(null);
  const [memberView, setMemberView] = useState<MemberMeetingsView>("meetings");
  const [selectedMeetingTransactions, setSelectedMeetingTransactions] = useState<LedgerEntry[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [meetingForm, setMeetingForm] = useState({ title: "", scheduledAt: "", gpsCompliant: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMeetingsWorkspace() {
    const [meResponse, groupResponse, meetingResponse, mapConfigResponse] = await Promise.all([
      apiFetch<User>("/auth/me"),
      apiFetch<GroupRow[]>("/groups"),
      apiFetch<MeetingWithGroup[]>("/meetings"),
      apiFetch<GoogleMapsPublicConfig>("/integrations/GOOGLE_MAPS/public-config").catch(
        () => null
      )
    ]);
    const primaryGroup = groupResponse.find((group) => group.id === meResponse.groupId) ?? groupResponse[0] ?? null;
    const ledgerResponse =
      meResponse.role === "MEMBER" && primaryGroup
        ? await apiFetch<LedgerEntry[]>(`/groups/${primaryGroup.id}/ledger`).catch(() => [])
        : [];

    setUser(meResponse);
    setGroups(groupResponse);
    setMeetings(meetingResponse);
    setLedger(ledgerResponse);
    setGoogleMapsConfig(mapConfigResponse);
    setGoogleMapsApiKey(mapConfigResponse?.apiKey?.trim() || fallbackGoogleMapsApiKey);
  }

  useEffect(() => {
    let mounted = true;

    async function loadMeetings() {
      try {
        if (mounted) await loadMeetingsWorkspace();
      } catch (meetingsError) {
        if (mounted) {
          setError(meetingsError instanceof Error ? meetingsError.message : "Meetings failed");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadMeetings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(editingMeeting || selectedMeeting));
    return () => document.body.classList.remove("modal-open");
  }, [editingMeeting, selectedMeeting]);

  useEffect(() => {
    let mounted = true;

    async function loadMeetingTransactions() {
      if (!selectedMeeting) {
        setSelectedMeetingTransactions([]);
        setTransactionsError(null);
        setTransactionsLoading(false);
        return;
      }

      setTransactionsLoading(true);
      setTransactionsError(null);

      try {
        const rows = await apiFetch<LedgerEntry[]>(
          `/groups/${selectedMeeting.group.id}/ledger?meetingId=${encodeURIComponent(selectedMeeting.id)}`
        );
        if (mounted) {
          setSelectedMeetingTransactions(rows.filter((entry) => Boolean(entry.memberId)));
        }
      } catch (transactionError) {
        if (mounted) {
          setSelectedMeetingTransactions([]);
          setTransactionsError(
            transactionError instanceof Error
              ? transactionError.message
              : "Meeting transactions failed to load"
          );
        }
      } finally {
        if (mounted) setTransactionsLoading(false);
      }
    }

    loadMeetingTransactions();
    return () => {
      mounted = false;
    };
  }, [selectedMeeting]);

  const liveMeetings = meetings.filter((meeting) => meeting.status === "IN_PROGRESS").length;
  const gpsCompliant = meetings.filter((meeting) => meeting.gpsCompliant).length;
  const liveGroupIds = useMemo(
    () =>
      new Set(
        meetings
          .filter((meeting) => meeting.status === "IN_PROGRESS")
          .map((meeting) => meeting.group.id)
      ),
    [meetings]
  );
  const meetingGroupIds = useMemo(
    () => new Set(meetings.map((meeting) => meeting.group.id)),
    [meetings]
  );

  const attendanceTotal = useMemo(
    () => meetings.reduce((sum, meeting) => sum + meeting.attendance.length, 0),
    [meetings]
  );
  const passbookRows = useMemo(() => buildMeetingPassbookRows(ledger), [ledger]);

  const mapPins = useMemo<MapPin[]>(() => {
    const pins: MapPin[] = [];
    const countyGroups = new Map<string, GroupRow[]>();

    groups.forEach((group) => {
      if (typeof group.gpsLatitude === "number" && typeof group.gpsLongitude === "number") {
        const live = liveGroupIds.has(group.id);
        const hasMeeting = meetingGroupIds.has(group.id);
        const point = projectKenyaPoint(group.gpsLatitude, group.gpsLongitude);
        pins.push({
          id: group.id,
          label: group.name,
          detail: `${group.code} - ${group.county}`,
          county: group.county,
          count: 1,
          liveCount: live ? 1 : 0,
          status: live ? "live" : hasMeeting ? "meeting" : "group",
          latitude: group.gpsLatitude,
          longitude: group.gpsLongitude,
          exact: true,
          ...point
        });
        return;
      }

      const county = group.county || "Unassigned";
      countyGroups.set(county, [...(countyGroups.get(county) ?? []), group]);
    });

    countyGroups.forEach((countyGroupRows, county) => {
      const coordinate = countyCoordinates[county];
      if (!coordinate) return;

      const liveCount = countyGroupRows.filter((group) => liveGroupIds.has(group.id)).length;
      const meetingCount = countyGroupRows.filter((group) => meetingGroupIds.has(group.id)).length;
      const point = projectKenyaPoint(coordinate.lat, coordinate.lng);
      pins.push({
        id: `county-${county}`,
        label: county,
        detail: `${countyGroupRows.length} groups${meetingCount > 0 ? `, ${meetingCount} with sessions` : ""}`,
        county,
        count: countyGroupRows.length,
        liveCount,
        status: liveCount > 0 ? "live" : meetingCount > 0 ? "meeting" : "group",
        latitude: coordinate.lat,
        longitude: coordinate.lng,
        exact: false,
        ...point
      });
    });

    return pins.sort((left, right) => {
      if (left.status === "live" && right.status !== "live") return -1;
      if (right.status === "live" && left.status !== "live") return 1;
      return right.count - left.count;
    });
  }, [groups, liveGroupIds, meetingGroupIds]);

  const exactPinCount = mapPins.filter((pin) => pin.exact).length;
  const livePinCount = mapPins.filter((pin) => pin.status === "live").length;
  const canManageMeetings = user?.permissions?.includes("meetings:write") ?? false;
  const isMember = user?.role === "MEMBER";
  const canUseMeetingEntry = user?.role === "GROUP_ACCOUNT" && canManageMeetings;

  function canEditMeeting(meeting: MeetingWithGroup) {
    return canManageMeetings && meeting.status !== "IN_PROGRESS" && meeting.status !== "SEALED";
  }

  function openEditMeeting(meeting: MeetingWithGroup) {
    setSelectedMeeting(null);
    setEditingMeeting(meeting);
    setMeetingForm({
      title: meeting.title,
      scheduledAt: dateTimeLocalInput(meeting.scheduledAt),
      gpsCompliant: meeting.gpsCompliant
    });
    setMessage(null);
  }

  async function submitMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMeeting) return;

    setSaving(true);
    setMessage(null);

    try {
      const updated = await apiFetch<MeetingWithGroup>(`/groups/${editingMeeting.group.id}/meetings/${editingMeeting.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: meetingForm.title,
          scheduledAt: new Date(meetingForm.scheduledAt).toISOString(),
          gpsCompliant: meetingForm.gpsCompliant
        })
      });
      await loadMeetingsWorkspace();
      setEditingMeeting(null);
      setMessage({ ok: true, text: `${updated.title} meeting updated.` });
    } catch (meetingError) {
      setMessage({ ok: false, text: meetingError instanceof Error ? meetingError.message : "Meeting failed to save" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Live Meeting Monitor</p>
          <h2
            aria-label="Meetings"
            className="has-hint"
            data-hint="Monitor session state, GPS compliance, three-key unlock status, and current workflow progress across programme groups."
            tabIndex={0}
          >
            Meetings
          </h2>
        </div>
        <div className="page-heading-actions">
          {isMember ? (
            <div className="segmented view-toggle" role="group" aria-label="Meetings page view">
              <button
                aria-pressed={memberView === "meetings"}
                className={memberView === "meetings" ? "active" : ""}
                onClick={() => setMemberView("meetings")}
                type="button"
              >
                <CalendarDays size={15} />
                Meetings
              </button>
              <button
                aria-pressed={memberView === "passbook"}
                className={memberView === "passbook" ? "active" : ""}
                onClick={() => setMemberView("passbook")}
                type="button"
              >
                <BookOpenText size={15} />
                Passbook
              </button>
            </div>
          ) : null}
          <span className="pill">{meetings.length} sessions</span>
        </div>
      </section>

      {!editingMeeting && message ? (
        <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div>
      ) : null}

      {editingMeeting && canEditMeeting(editingMeeting) ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={`Edit ${editingMeeting.title}`}>
          <button className="modal-backdrop" onClick={() => setEditingMeeting(null)} type="button" aria-label="Close meeting editor" />
          <section className="data-card credential-modal">
            <header>
              <div>
                <h3>Edit Meeting</h3>
                <span>{editingMeeting.group.name}</span>
              </div>
              <button className="icon-button" onClick={() => setEditingMeeting(null)} type="button" aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <form className="credential-form" onSubmit={submitMeeting}>
              <div className="credential-grid">
                <label className="credential-field">
                  <span>Title</span>
                  <input
                    onChange={(event) => setMeetingForm((current) => ({ ...current, title: event.target.value }))}
                    required
                    value={meetingForm.title}
                  />
                </label>
                <label className="credential-field">
                  <span>Scheduled time</span>
                  <input
                    onChange={(event) => setMeetingForm((current) => ({ ...current, scheduledAt: event.target.value }))}
                    required
                    type="datetime-local"
                    value={meetingForm.scheduledAt}
                  />
                </label>
                <label className="checkbox-card">
                  <input
                    checked={meetingForm.gpsCompliant}
                    onChange={(event) => setMeetingForm((current) => ({ ...current, gpsCompliant: event.target.checked }))}
                    type="checkbox"
                  />
                  <span>GPS compliant</span>
                </label>
              </div>
              {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}
              <div className="credential-actions">
                <button className="button" disabled={saving} type="submit">
                  <Pencil size={16} />
                  {saving ? "Saving" : "Save meeting"}
                </button>
                <button className="button secondary" onClick={() => setEditingMeeting(null)} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedMeeting && !editingMeeting ? (
        <MeetingDetailDialog
          canEdit={canEditMeeting(selectedMeeting)}
          canUseMeetingEntry={canUseMeetingEntry}
          googleMapsApiKey={googleMapsApiKey}
          isMember={isMember}
          meeting={selectedMeeting}
          transactions={selectedMeetingTransactions}
          transactionsError={transactionsError}
          transactionsLoading={transactionsLoading}
          onClose={() => setSelectedMeeting(null)}
          onEdit={() => openEditMeeting(selectedMeeting)}
        />
      ) : null}

      <section className="stat-grid">
        <StatCard icon={<Activity size={20} />} label="Meetings" note="Loaded from group records" value={meetings.length.toString()} />
        <StatCard icon={<Timer size={20} />} label="Live now" note="Currently in progress" value={liveMeetings.toString()} />
        <StatCard icon={<MapPinned size={20} />} label="GPS compliant" note="Meetings with location pass" value={gpsCompliant.toString()} />
        <StatCard icon={<CheckCircle2 size={20} />} label="Attendance records" note="Member attendance entries" value={attendanceTotal.toString()} />
      </section>

      {isMember && memberView === "meetings" ? (
        <MeetingCalendar meetings={meetings} onSelectMeeting={setSelectedMeeting} />
      ) : null}

      {isMember && memberView === "passbook" ? (
        <MeetingPassbookView rows={passbookRows} />
      ) : null}

      {!isMember ? (
      <section className="data-card meeting-map-card">
        <header>
          <div>
            <h3>Group Meeting Map</h3>
            <span>
              Google Maps view with exact GPS pins where captured; other groups
              are clustered by county.
              {googleMapsConfig?.source === "stored"
                ? " Using the saved integration key."
                : null}
            </span>
          </div>
          <div className="map-legend" aria-label="Map marker legend">
            <span><i className="marker-dot live" /> Live session</span>
            <span><i className="marker-dot meeting" /> Has meeting</span>
            <span><i className="marker-dot group" /> Group cluster</span>
          </div>
        </header>
        <div className="meeting-map-layout">
          <GoogleGroupMap apiKey={googleMapsApiKey} pins={mapPins} />
          <div className="map-summary">
            <div>
              <span>Groups</span>
              <strong>{groups.length}</strong>
              <em>{exactPinCount} GPS, {mapPins.length - exactPinCount} clusters</em>
            </div>
            <div>
              <span>Live</span>
              <strong>{livePinCount}</strong>
              <em>In progress</em>
            </div>
            <div>
              <span>Coverage</span>
              <strong>{mapPins.length}</strong>
              <em>Map pins</em>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {(!isMember || memberView === "meetings") ? (
      <section className="data-card">
        <header>
          <h3>Sessions</h3>
          <span className="pill">{meetings.length} records</span>
        </header>
        <CollectionView
          count={meetings.length}
          label="sessions"
          cards={
            <div className="card-grid">
              {meetings.map((meeting) => {
                const completedSteps = meeting.steps.filter((step) => step.status === "COMPLETED").length;
                return (
                  <article
                    className="record-card meeting-session-card"
                    key={meeting.id}
                    onClick={() => setSelectedMeeting(meeting)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedMeeting(meeting);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <header>
                      <div>
                        <h4>{meeting.title}</h4>
                        <small>{new Date(meeting.scheduledAt).toLocaleString("en-KE")}</small>
                      </div>
                      <span className={meetingStatusClass(meeting.status)}>{humanizeEnum(meeting.status)}</span>
                    </header>
                    <div className="record-card-meta">
                      <div>
                        <span>Group</span>
                        <strong>{meeting.group.name}</strong>
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
                        <span>Progress</span>
                        <strong>{completedSteps}/{meeting.steps.length}</strong>
                      </div>
                    </div>
                    <small>{meeting.group.code} - {meeting.group.county}</small>
                    <div className="record-card-actions" onClick={(event) => event.stopPropagation()}>
                      <button className="button secondary" onClick={() => setSelectedMeeting(meeting)} type="button">
                        <Eye size={16} />
                        View
                      </button>
                      {canEditMeeting(meeting) ? (
                        <button className="button secondary" onClick={() => openEditMeeting(meeting)} type="button">
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
                  </article>
                );
              })}
              {meetings.length === 0 ? <div className="empty-state">No sessions</div> : null}
            </div>
          }
          list={
            <DataTable
              columns={[
            {
              key: "meeting",
              header: "Meeting",
              value: (meeting) => new Date(meeting.scheduledAt).getTime(),
              exportValue: (meeting) => meeting.title,
              cell: (meeting) => (
                <>
                  <strong>{meeting.title}</strong>
                  <br />
                  <span>{new Date(meeting.scheduledAt).toLocaleString("en-KE")}</span>
                </>
              )
            },
            {
              key: "group",
              header: "Group",
              value: (meeting) => `${meeting.group.name} ${meeting.group.code} ${meeting.group.county}`,
              exportValue: (meeting) => `${meeting.group.name} (${meeting.group.code})`,
              cell: (meeting) => (
                <>
                  <strong>{meeting.group.name}</strong>
                  <br />
                  <span>{meeting.group.code} - {meeting.group.county}</span>
                </>
              )
            },
            {
              key: "status",
              header: "Status",
              value: (meeting) => humanizeEnum(meeting.status),
              cell: (meeting) => <span className={meetingStatusClass(meeting.status)}>{humanizeEnum(meeting.status)}</span>
            },
            {
              key: "unlock",
              header: "Unlock",
              value: (meeting) => humanizeEnum(meeting.unlockStatus)
            },
            {
              key: "gps",
              header: "GPS",
              value: (meeting) => (meeting.gpsCompliant ? "Compliant" : "Pending"),
              cell: (meeting) => (
                <span className={meeting.gpsCompliant ? "pill" : "pill gold"}>
                  {meeting.gpsCompliant ? "Compliant" : "Pending"}
                </span>
              )
            },
            {
              key: "progress",
              header: "Progress",
              value: (meeting) =>
                `${meeting.steps.filter((step) => step.status === "COMPLETED").length}/${meeting.steps.length}`
            },
            {
              key: "action",
              header: "",
              value: () => "",
              searchable: false,
              sortable: false,
              exportable: false,
              cell: (meeting) => (
                <div className="table-action-group">
                  <button className="button secondary table-action-button" onClick={() => setSelectedMeeting(meeting)} type="button">
                    <Eye size={16} />
                    View
                  </button>
                  {canEditMeeting(meeting) ? (
                    <button className="button secondary table-action-button" onClick={() => openEditMeeting(meeting)} type="button">
                      <Pencil size={16} />
                      Edit
                    </button>
                  ) : null}
                  {canUseMeetingEntry ? (
                    <Link className="button table-action-button" href={`/dashboard/meetings/${meeting.id}/entry`}>
                      <BookOpenText size={16} />
                      Entry
                    </Link>
                  ) : null}
                  <Link className="button secondary" href={isMember ? `/dashboard/groups/${meeting.group.id}/meetings` : `/dashboard/groups/${meeting.group.id}`}>
                    {isMember ? "Keys" : "Group"}
                  </Link>
                </div>
              )
            }
          ]}
          defaultSort={{ key: "meeting", direction: "desc" }}
          exportName="intelli-cash-meetings"
          filters={[
            {
              key: "status",
              label: "Status",
              allLabel: "All statuses",
              getValue: (meeting) => meeting.status,
              options: Array.from(new Set(meetings.map((meeting) => meeting.status))).map((value) => ({
                label: humanizeEnum(value),
                value
              }))
            },
            {
              key: "gps",
              label: "GPS",
              allLabel: "All GPS",
              getValue: (meeting) => (meeting.gpsCompliant ? "Compliant" : "Pending")
            },
            {
              key: "group",
              label: "Group",
              allLabel: "All groups",
              getValue: (meeting) => meeting.group.name
            }
          ]}
          getRowKey={(meeting) => meeting.id}
          rows={meetings}
          title="Meeting sessions"
            />
          }
        />
      </section>
      ) : null}
    </>
  );
}
