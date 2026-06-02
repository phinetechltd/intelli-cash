"use client";

import type { FormEvent } from "react";
import React from "react";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, BookOpenText, CheckCircle2, KeyRound, LockKeyhole, Timer, UserCheck, X } from "@/lib/theme-icons";
import { apiFetch, formatKes, humanizeEnum } from "../../../../../lib/api";
import type { GroupRow, LedgerEntry, Member, User } from "../../../../../components/dashboard/types";
import {
  amountToCents,
  clientRequestId,
  defaultUnlockRows,
  emptyAmounts,
  entryAmountFields,
  totalLedgerCents,
  typedEntriesFromAmounts,
  type EntryAmounts,
  type GroupDetail,
  type MeetingWithGroup,
  type ShareOutPreview,
  type SyncConflict,
  type UnlockRow
} from "../../../../../features/meeting-entry/model";
import {
  clearMeetingDraft,
  getMeetingDeviceId,
  loadOfflineVerifiers,
  loadMeetingDraft,
  queueMeetingDraft,
  verifyOfflinePin,
  type OfflineMeetingDraft,
  type OfflineMeetingLedgerEntry
} from "../../../../../lib/meeting-offline-store";
import { refreshOfflinePinCache } from "../../../../../lib/offline-pin-cache";

type MeetingEntryPanel = "unlock" | "attendance" | "transactions" | "shareOut" | "sync" | "records" | null;
type PendingSyncSummary = {
  keys: number;
  attendance: number;
  ledgerEntries: number;
  total: number;
};

const emptyPendingSyncSummary: PendingSyncSummary = {
  keys: 0,
  attendance: 0,
  ledgerEntries: 0,
  total: 0
};

function pendingSummaryFromDraft(draft: OfflineMeetingDraft | null | undefined): PendingSyncSummary {
  const keys = draft?.keySubmissions.length ?? 0;
  const attendance = draft?.attendance.length ?? 0;
  const ledgerEntries = draft?.ledgerEntries.length ?? 0;
  return {
    keys,
    attendance,
    ledgerEntries,
    total: keys + attendance + ledgerEntries
  };
}

export default function MeetingEntryPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = use(params);
  const [user, setUser] = useState<User | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [meeting, setMeeting] = useState<MeetingWithGroup | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [unlockRows, setUnlockRows] = useState<UnlockRow[]>(defaultUnlockRows);
  const [attendance, setAttendance] = useState<Record<string, "PRESENT" | "ABSENT" | "LATE" | "EXCUSED">>({});
  const [amounts, setAmounts] = useState<Record<string, EntryAmounts>>({});
  const [shareOutPool, setShareOutPool] = useState("");
  const [shareOutPreview, setShareOutPreview] = useState<ShareOutPreview | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [pendingSyncSummary, setPendingSyncSummary] = useState<PendingSyncSummary>(emptyPendingSyncSummary);
  const [offlinePinCacheCount, setOfflinePinCacheCount] = useState(0);
  const [offlinePinCacheUpdatedAt, setOfflinePinCacheUpdatedAt] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [activeEntryMemberId, setActiveEntryMemberId] = useState("");
  const [showAllFastEntry, setShowAllFastEntry] = useState(false);
  const [activePanel, setActivePanel] = useState<MeetingEntryPanel>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const sharePurchase = ledger
      .filter((entry) => entry.type === "SHARE_PURCHASE")
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    const socialFund = ledger
      .filter((entry) => entry.type === "SOCIAL_CONTRIBUTION")
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    const loanRepayment = ledger
      .filter((entry) => entry.type === "LOAN_REPAYMENT")
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    const loanDisbursement = ledger
      .filter((entry) => entry.type === "INTERNAL_LOAN_DISBURSEMENT")
      .reduce((sum, entry) => sum + entry.amountCents, 0);

    return { sharePurchase, socialFund, loanRepayment, loanDisbursement };
  }, [ledger]);

  async function refresh(groupId?: string) {
    const resolvedGroupId = groupId ?? group?.id;
    if (!resolvedGroupId) return;
    const [meetingResponse, memberResponse, ledgerResponse] = await Promise.all([
      apiFetch<MeetingWithGroup>(`/groups/${resolvedGroupId}/meetings/${meetingId}`),
      apiFetch<Member[]>(`/groups/${resolvedGroupId}/members`),
      apiFetch<LedgerEntry[]>(`/groups/${resolvedGroupId}/ledger?meetingId=${encodeURIComponent(meetingId)}`)
    ]);
    setMeeting(meetingResponse);
    setMembers(memberResponse);
    setLedger(ledgerResponse);
    setAttendance(
      Object.fromEntries(
        memberResponse.map((member) => {
          const existing = meetingResponse.attendance.find((row) => row.member.fullName === member.fullName);
          return [member.id, (existing?.status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED") ?? "PRESENT"];
        })
      )
    );
    setAmounts(Object.fromEntries(memberResponse.map((member) => [member.id, amounts[member.id] ?? emptyAmounts()])));
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const currentDeviceId = getMeetingDeviceId();
        const [meResponse, groupRows] = await Promise.all([apiFetch<User>("/auth/me"), apiFetch<GroupRow[]>("/groups")]);
        const primaryGroup = groupRows.find((row) => row.id === meResponse.groupId) ?? groupRows[0];
        if (!primaryGroup) throw new Error("No group account scope found.");
        const groupResponse = await apiFetch<GroupDetail>(`/groups/${primaryGroup.id}`);
        const [meetingResponse, memberResponse, ledgerResponse, draft, cachedVerifiers] = await Promise.all([
          apiFetch<MeetingWithGroup>(`/groups/${primaryGroup.id}/meetings/${meetingId}`),
          apiFetch<Member[]>(`/groups/${primaryGroup.id}/members`),
          apiFetch<LedgerEntry[]>(`/groups/${primaryGroup.id}/ledger?meetingId=${encodeURIComponent(meetingId)}`),
          loadMeetingDraft(primaryGroup.id, meetingId, currentDeviceId),
          loadOfflineVerifiers(currentDeviceId)
        ]);

        if (!mounted) return;
        setUser(meResponse);
        setGroup(groupResponse);
        setMeeting(meetingResponse);
        setMembers(memberResponse);
        setLedger(ledgerResponse);
        setDeviceId(currentDeviceId);
        setOfflinePinCacheCount(cachedVerifiers.length);
        const pendingSummary = pendingSummaryFromDraft(draft);
        setPendingSyncSummary(pendingSummary);
        setPendingDraftCount(pendingSummary.total);
        setAttendance(
          Object.fromEntries(
            memberResponse.map((member) => {
              const existing = meetingResponse.attendance.find((row) => row.member.fullName === member.fullName);
              return [member.id, (existing?.status as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED") ?? "PRESENT"];
            })
          )
        );
        setAmounts(Object.fromEntries(memberResponse.map((member) => [member.id, emptyAmounts()])));
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Meeting entry failed to load");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [meetingId]);

  useEffect(() => {
    function updateOnlineState() {
      setIsOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    }

    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  const isGroupAccount = user?.role === "GROUP_ACCOUNT";
  const canWrite = Boolean(isGroupAccount && user?.permissions?.includes("meetings:write"));
  const isOffline = !isOnline;
  const unlockCredentialType: UnlockRow["credentialType"] = isOffline ? "DEFAULT_PIN" : "CURRENT_OTP";
  const unlockCredentialLabel = isOffline ? "Offline PIN" : "Online OTP";
  const unlockCredentialPlaceholder = isOffline ? "Default PIN" : "OTP";
  const syncState = isOffline ? "Offline" : pendingDraftCount > 0 ? "Pending sync" : "Synced";
  const syncDetailText =
    pendingDraftCount > 0
      ? `${pendingSyncSummary.keys} unlock keys, ${pendingSyncSummary.attendance} attendance rows, ${pendingSyncSummary.ledgerEntries} transaction rows`
      : "No offline data waiting to sync.";
  const syncHelpText =
    syncState === "Offline"
      ? "Connect to internet before syncing to the online database."
      : pendingDraftCount > 0
        ? "Click to sync queued data to the online database."
        : "This meeting is already synced.";
  const recentLedger = ledger.slice(0, 10);
  const activeEntryMember = members.find((member) => member.id === activeEntryMemberId) ?? members[0] ?? null;
  const visibleEntryMembers = showAllFastEntry ? members : activeEntryMember ? [activeEntryMember] : [];
  const shareValueCents = group?.shareValueCents ?? meeting?.group.shareValueCents ?? 50000;
  const shareLimit = Math.max(
    1,
    Math.min(group?.maxSharesPerMemberPerMeeting ?? meeting?.group.maxSharesPerMemberPerMeeting ?? 10, 100)
  );
  const shareNumbers = Array.from({ length: shareLimit }, (_item, index) => index + 1);
  const completedUnlockRows = unlockRows.filter((row) => row.memberId && row.pin).length;
  const savedAttendanceCount = meeting?.attendance.length ?? 0;
  const presentMembers = Object.values(attendance).filter((status) => status === "PRESENT" || status === "LATE").length;
  const draftLedgerRows = Object.values(amounts).reduce(
    (count, row) =>
      count +
      (amountToCents(row.sharePurchase) > 0 ? 1 : 0) +
      (amountToCents(row.loanRepayment) > 0 ? 1 : 0) +
      (amountToCents(row.loanDisbursement) > 0 ? 1 : 0) +
      (amountToCents(row.socialFund) > 0 ? 1 : 0),
    0
  );
  const meetingIsActive = meeting?.status === "IN_PROGRESS";
  const meetingIsSealed = meeting?.status === "SEALED";
  const transactionRows = ledger.filter((entry) => entry.meetingId === meetingId).length;
  const actionCards = [
    {
      panel: "unlock" as const,
      number: 1,
      icon: <KeyRound size={20} />,
      title: "Unlock",
      note: "3 officials or 5 members",
      detail: `${completedUnlockRows} credentials ready`,
      state: meetingIsActive || meetingIsSealed ? "done" : "current"
    },
    {
      panel: "attendance" as const,
      number: 2,
      icon: <UserCheck size={20} />,
      title: "Attendance",
      note: `${members.length} members`,
      detail: `${presentMembers} present or late`,
      state: !meetingIsActive && !meetingIsSealed ? "locked" : savedAttendanceCount > 0 ? "done" : "current"
    },
    {
      panel: "transactions" as const,
      number: 3,
      icon: <BookOpenText size={20} />,
      title: "Share purchase & transactions",
      note: activeEntryMember?.fullName ?? "Select member",
      detail: `${draftLedgerRows} unsaved entry rows`,
      state: !meetingIsActive && !meetingIsSealed ? "locked" : transactionRows > 0 ? "done" : "current",
      primary: true
    },
    {
      panel: "shareOut" as const,
      number: 4,
      icon: <Timer size={20} />,
      title: "Share-Out",
      note: "Current cycle",
      detail: shareOutPreview ? `${shareOutPreview.rows.length} payouts ready` : "Preview payouts",
      state: totals.sharePurchase > 0 ? "ready" : "locked"
    },
    {
      panel: "sync" as const,
      number: 5,
      icon: <Activity size={20} />,
      title: "Review & Sync",
      note: `${pendingDraftCount} offline items`,
      detail: conflicts.length > 0 ? `${conflicts.length} conflicts` : "No conflict rows",
      state: conflicts.length > 0 || pendingDraftCount > 0 ? "current" : "ready"
    },
    {
      panel: "records" as const,
      number: 6,
      icon: <CheckCircle2 size={20} />,
      title: "Transactions",
      note: `${ledger.length} records`,
      detail: formatKes(totalLedgerCents(ledger)),
      state: ledger.length > 0 ? "ready" : "locked"
    }
  ];

  useEffect(() => {
    if (!activeEntryMemberId && members[0]) {
      setActiveEntryMemberId(members[0].id);
    }
  }, [activeEntryMemberId, members]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(activePanel));
    return () => document.body.classList.remove("modal-open");
  }, [activePanel]);

  useEffect(() => {
    if (!group || !deviceId || !isOnline) return;
    void refreshOfflinePins();
  }, [group?.id, deviceId, isOnline]);

  function isNetworkFailure(error: unknown) {
    return error instanceof Error && "code" in error && (error as { code?: string }).code === "NETWORK_ERROR";
  }

  async function refreshOfflinePins(options: { showMessage?: boolean } = {}) {
    if (!group || !deviceId || !isOnline) return null;
    try {
      const refreshed = await refreshOfflinePinCache(group.id, deviceId);
      if (!refreshed) return null;
      setOfflinePinCacheCount(refreshed.verifiers.length);
      setOfflinePinCacheUpdatedAt(new Date().toISOString());
      if (options.showMessage) {
        setMessage({
          ok: true,
          text: `${refreshed.verifiers.length} offline PIN verifiers refreshed on this device.`
        });
      }
      return refreshed;
    } catch (cacheError) {
      if (options.showMessage) {
        setMessage({ ok: false, text: cacheError instanceof Error ? cacheError.message : "Offline PIN cache refresh failed." });
      }
      return null;
    }
  }

  async function queueDraft(input: {
    keySubmissions?: OfflineMeetingDraftInput["keySubmissions"];
    attendance?: OfflineMeetingDraftInput["attendance"];
    ledgerEntries?: OfflineMeetingLedgerEntry[];
  }) {
    if (!group || !deviceId) return;
    const queued = await queueMeetingDraft({
      groupId: group.id,
      meetingId,
      deviceId,
      keySubmissions: input.keySubmissions ?? [],
      attendance: input.attendance ?? [],
      ledgerEntries: input.ledgerEntries ?? [],
      savedAt: new Date().toISOString()
    });
    const pendingSummary = pendingSummaryFromDraft(queued);
    setPendingSyncSummary(pendingSummary);
    setPendingDraftCount(pendingSummary.total);
    setMessage({ ok: true, text: "Saved offline. Sync when the connection is available." });
  }

  async function sendOtpBatch() {
    if (!group) return;
    if (isOffline) return setMessage({ ok: false, text: "OTPs are online only. Use default PINs while offline." });
    const memberIds = Array.from(new Set(unlockRows.map((row) => row.memberId).filter(Boolean)));
    if (memberIds.length === 0) return setMessage({ ok: false, text: "Select members before sending OTPs." });
    setSaving(true);
    try {
      await apiFetch(`/groups/${group.id}/meetings/${meetingId}/otp-batch`, {
        method: "POST",
        body: JSON.stringify({ memberIds })
      });
      setMessage({ ok: true, text: "Meeting OTPs queued." });
    } catch (otpError) {
      setMessage({ ok: false, text: otpError instanceof Error ? otpError.message : "OTP batch failed." });
    } finally {
      setSaving(false);
    }
  }

  async function prepareOfflineCache() {
    if (!group || !deviceId) return;
    if (isOffline) return setMessage({ ok: false, text: "Connect to internet before refreshing offline PINs." });
    setSaving(true);
    try {
      await refreshOfflinePins({ showMessage: true });
    } catch (cacheError) {
      setMessage({ ok: false, text: cacheError instanceof Error ? cacheError.message : "Offline PIN cache failed." });
    } finally {
      setSaving(false);
    }
  }

  async function startMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group || !deviceId) return;
    const keySubmissions = unlockRows
      .filter((row) => row.memberId && row.pin)
      .map((row) => ({
        memberId: row.memberId,
        pin: row.pin,
        credentialType: unlockCredentialType,
        deviceId,
        capturedOfflineAt: isOffline ? new Date().toISOString() : undefined
      }));
    if (keySubmissions.length === 0) return setMessage({ ok: false, text: `Enter meeting ${unlockCredentialLabel.toLowerCase()}s before starting.` });
    setSaving(true);
    try {
      if (isOffline) {
        if (offlinePinCacheCount === 0) {
          throw new Error("No offline PIN cache found. Connect once to refresh offline PINs before starting meetings offline.");
        }
        const verified = await Promise.all(
          keySubmissions.map((row) => verifyOfflinePin(deviceId, row.memberId ?? "", row.pin))
        );
        if (verified.some((row) => !row)) {
          throw new Error("Offline start requires cached default PINs. OTPs are online only.");
        }
        await queueDraft({
          keySubmissions: keySubmissions.map((row) => ({
            ...row,
            credentialType: "DEFAULT_PIN",
            capturedOfflineAt: new Date().toISOString()
          }))
        });
        return;
      }

      const opened = await apiFetch<MeetingWithGroup>(`/groups/${group.id}/meetings/${meetingId}/open`, {
        method: "POST",
        body: JSON.stringify({ gpsCompliant: true, keySubmissions })
      });
      setMeeting(opened);
      setMessage({ ok: true, text: "Meeting started." });
      await refresh(group.id);
    } catch (startError) {
      if (isNetworkFailure(startError)) {
        setIsOnline(false);
        setMessage({ ok: false, text: "Connection was lost. Use cached default PINs to start this meeting offline." });
      } else {
        setMessage({ ok: false, text: startError instanceof Error ? startError.message : "Meeting start failed." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveAttendance() {
    if (!group || !deviceId) return;
    const rows = Object.entries(attendance).map(([memberId, status]) => ({
      memberId,
      status,
      clientRequestId: clientRequestId(meetingId, memberId, "attendance")
    }));
    setSaving(true);
    try {
      if (isOffline) {
        await queueDraft({ attendance: rows });
        return;
      }
      await Promise.all(
        rows.map((row) =>
          apiFetch(`/groups/${group.id}/meetings/${meetingId}/attendance`, {
            method: "POST",
            body: JSON.stringify({ memberId: row.memberId, status: row.status })
          })
        )
      );
      await refresh(group.id);
      setMessage({ ok: true, text: "Attendance saved." });
    } catch (attendanceError) {
      if (isNetworkFailure(attendanceError)) {
        setIsOnline(false);
        await queueDraft({ attendance: rows });
      } else {
        setMessage({ ok: false, text: attendanceError instanceof Error ? attendanceError.message : "Attendance failed." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveLedgerEntries() {
    if (!group || !deviceId) return;
    const entries = typedEntriesFromAmounts(meetingId, members, amounts, shareValueCents);
    if (entries.length === 0) return setMessage({ ok: false, text: "Enter at least one amount." });
    setSaving(true);
    try {
      if (isOffline) {
        await queueDraft({ ledgerEntries: entries });
        return;
      }
      await apiFetch(`/groups/${group.id}/meetings/${meetingId}/ledger/batch`, {
        method: "POST",
        body: JSON.stringify({ entries })
      });
      setAmounts(Object.fromEntries(members.map((member) => [member.id, emptyAmounts()])));
      await refresh(group.id);
      setMessage({ ok: true, text: `${entries.length} meeting entries saved.` });
    } catch (ledgerError) {
      if (isNetworkFailure(ledgerError)) {
        setIsOnline(false);
        await queueDraft({ ledgerEntries: entries });
      } else {
        setMessage({ ok: false, text: ledgerError instanceof Error ? ledgerError.message : "Meeting entries failed." });
      }
    } finally {
      setSaving(false);
    }
  }

  async function previewShareOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!group) return;
    setSaving(true);
    try {
      const preview = await apiFetch<ShareOutPreview>(`/groups/${group.id}/meetings/${meetingId}/share-out/preview`, {
        method: "POST",
        body: JSON.stringify({ poolAmountCents: amountToCents(shareOutPool) })
      });
      setShareOutPreview(preview);
      setMessage({ ok: true, text: "Share-out preview ready." });
    } catch (previewError) {
      setMessage({ ok: false, text: previewError instanceof Error ? previewError.message : "Share-out preview failed." });
    } finally {
      setSaving(false);
    }
  }

  async function postShareOut() {
    if (!group) return;
    setSaving(true);
    try {
      await apiFetch(`/groups/${group.id}/meetings/${meetingId}/share-out/post`, {
        method: "POST",
        body: JSON.stringify({
          poolAmountCents: amountToCents(shareOutPool),
          clientRequestPrefix: `shareout-${meetingId}-${Date.now()}`
        })
      });
      await refresh(group.id);
      setMessage({ ok: true, text: "Share-out payouts posted for review." });
    } catch (postError) {
      setMessage({ ok: false, text: postError instanceof Error ? postError.message : "Share-out post failed." });
    } finally {
      setSaving(false);
    }
  }

  async function syncQueuedDraft() {
    if (!group || !deviceId) return;
    const draft = await loadMeetingDraft(group.id, meetingId, deviceId);
    if (!draft) {
      setPendingSyncSummary(emptyPendingSyncSummary);
      setPendingDraftCount(0);
      return setMessage({ ok: true, text: "No offline data waiting to sync." });
    }
    const pendingSummary = pendingSummaryFromDraft(draft);
    setPendingSyncSummary(pendingSummary);
    setPendingDraftCount(pendingSummary.total);
    setSyncing(true);
    setSaving(true);
    try {
      const response = await apiFetch<{ synced: unknown[]; conflicts: SyncConflict[] }>(
        `/groups/${group.id}/meetings/${meetingId}/offline-sync`,
        {
          method: "POST",
          body: JSON.stringify(draft)
        }
      );
      setConflicts(response.conflicts);
      if (response.conflicts.length === 0) {
        await clearMeetingDraft(group.id, meetingId, deviceId);
        setPendingSyncSummary(emptyPendingSyncSummary);
        setPendingDraftCount(0);
        await refreshOfflinePins();
        setMessage({ ok: true, text: `${response.synced.length} offline items synced.` });
      } else {
        setMessage({ ok: false, text: `${response.conflicts.length} items need conflict review.` });
      }
      await refresh(group.id);
    } catch (syncError) {
      setMessage({ ok: false, text: syncError instanceof Error ? syncError.message : "Offline sync failed." });
    } finally {
      setSyncing(false);
      setSaving(false);
    }
  }

  function updateAmount(memberId: string, key: keyof EntryAmounts, value: string) {
    setAmounts((current) => ({
      ...current,
      [memberId]: {
        ...(current[memberId] ?? emptyAmounts()),
        [key]: value
      }
    }));
  }

  function selectedShareCount(memberId: string) {
    const amountCents = amountToCents(amounts[memberId]?.sharePurchase ?? "");
    if (shareValueCents <= 0 || amountCents <= 0 || amountCents % shareValueCents !== 0) return 0;
    return amountCents / shareValueCents;
  }

  function updateShareCount(memberId: string, count: number) {
    updateAmount(memberId, "sharePurchase", String((shareValueCents * count) / 100));
  }

  function applyPreset(memberId: string, key: keyof EntryAmounts, amount: number) {
    setAmounts((current) => {
      const row = current[memberId] ?? emptyAmounts();
      const existing = Number(row[key]) || 0;
      return {
        ...current,
        [memberId]: {
          ...row,
          [key]: String(existing + amount)
        }
      };
    });
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!group || !meeting) return <div className="error">Meeting entry not available.</div>;
  if (!canWrite) return <div className="error">Meeting entry is only available to the group account.</div>;

  return (
    <>
      <div className="meeting-entry-console">
        <section className="page-heading meeting-entry-heading">
          <div className="meeting-entry-heading-copy">
            <Link className="inline-back" href="/dashboard/meetings">
              <ArrowLeft size={17} />
              <span>Meeting</span>
            </Link>
            <h2>{meeting.title}</h2>
          </div>
          <div className="meeting-entry-heading-actions">
            <span className="pill">{humanizeEnum(meeting.status)}</span>
            <div className="meeting-entry-sync-control">
              <button
                aria-describedby="meeting-entry-sync-details"
                className={`button meeting-entry-sync-button ${pendingDraftCount > 0 ? "attention" : "secondary"}`}
                disabled={saving || syncing || syncState === "Offline" || pendingDraftCount === 0}
                onClick={syncQueuedDraft}
                title={syncDetailText}
                type="button"
              >
                <Activity size={16} />
                {syncing ? "Syncing" : pendingDraftCount > 0 ? `Sync ${pendingDraftCount}` : "Synced"}
              </button>
              <div className="meeting-entry-sync-details" id="meeting-entry-sync-details" role="tooltip">
                <strong>{syncState}</strong>
                <span>{syncDetailText}</span>
                <span>{syncHelpText}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="meeting-entry-status">
          <div>
            <span>Group</span>
            <strong>{group.name}</strong>
            <em>{group.code}</em>
          </div>
          <div>
            <span>Share purchase</span>
            <strong>{formatKes(totals.sharePurchase)}</strong>
            <em>{ledger.filter((entry) => entry.type === "SHARE_PURCHASE").length} rows</em>
          </div>
          <div>
            <span>Social fund</span>
            <strong>{formatKes(totals.socialFund)}</strong>
            <em>{ledger.filter((entry) => entry.type === "SOCIAL_CONTRIBUTION").length} rows</em>
          </div>
          <div>
            <span>Loan repayment / loan disbursement</span>
            <strong>{formatKes(totals.loanRepayment - totals.loanDisbursement)}</strong>
            <em>Loan repayment minus loan disbursement</em>
          </div>
        </section>

        {message ? <div className={message.ok ? "notice success" : "notice warning"}>{message.text}</div> : null}

        <section className="meeting-entry-card-grid" aria-label="Meeting entry actions">
          {actionCards.map((card) => (
            <button
              aria-label={`${card.number}. ${card.title}. ${humanizeEnum(card.state)}`}
              className={`meeting-entry-action-card ${card.primary ? "primary" : ""} state-${card.state}`}
              key={card.panel}
              onClick={() => setActivePanel(card.panel)}
              type="button"
            >
              <span className="meeting-entry-card-number">{card.number}</span>
              <span className="meeting-entry-action-icon">{card.icon}</span>
              <span className={`meeting-entry-card-state ${card.state}`}>{humanizeEnum(card.state)}</span>
              <strong>{card.title}</strong>
              <em>{card.note}</em>
              <span>{card.detail}</span>
            </button>
          ))}
        </section>
      </div>

      <div className="meeting-entry-bottom-bar">
        <button className="button secondary" disabled={saving} onClick={() => setActivePanel("attendance")} type="button">
          Attendance
        </button>
        <button className="button" disabled={saving} onClick={() => setActivePanel("transactions")} type="button">
          Entries
        </button>
        <button className="button secondary" disabled={saving} onClick={() => setActivePanel("sync")} type="button">
          Review
        </button>
      </div>

      {activePanel ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Meeting data entry">
          <button className="modal-backdrop" onClick={() => setActivePanel(null)} type="button" aria-label="Close meeting form" />
          <section className="data-card credential-modal meeting-entry-modal">
            <header>
              <div>
                <span>Meeting data entry</span>
                <h3>
                  {activePanel === "unlock"
                    ? "Unlock"
                    : activePanel === "attendance"
                      ? "Attendance"
                    : activePanel === "transactions"
                        ? "Share purchase & transactions"
                        : activePanel === "shareOut"
                          ? "Share-Out"
                          : activePanel === "sync"
                            ? "Review & Sync"
                            : "Transactions"}
                </h3>
              </div>
              <div className="modal-header-actions meeting-entry-modal-actions">
                <span className={syncState === "Offline" ? "pill gold" : "pill blue"}>{syncState}</span>
                <button className="icon-button meeting-entry-modal-close" onClick={() => setActivePanel(null)} type="button" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
            </header>

            <div className="meeting-entry-modal-body">
              {activePanel === "unlock" ? (
                <form className="meeting-entry-unlock" onSubmit={startMeeting}>
                  {unlockRows.map((row, index) => (
                    <div className="meeting-entry-unlock-row" key={index}>
                      <select
                        aria-label={`Unlock member ${index + 1}`}
                        onChange={(event) =>
                          setUnlockRows((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, memberId: event.target.value } : item
                            )
                          )
                        }
                        value={row.memberId}
                      >
                        <option value="">Member</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.fullName} - {humanizeEnum(member.role)}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`${unlockCredentialPlaceholder} ${index + 1}`}
                        inputMode="numeric"
                        maxLength={6}
                        onChange={(event) =>
                          setUnlockRows((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, pin: event.target.value } : item
                            )
                          )
                        }
                        pattern="[0-9]{6}"
                        placeholder={unlockCredentialPlaceholder}
                        type="password"
                        value={row.pin}
                      />
                    </div>
                  ))}
                  <div className="meeting-entry-offline-cache-note">
                    <strong>{offlinePinCacheCount} offline PINs cached</strong>
                    <span>
                      {isOffline
                        ? "Use saved default PINs to start offline."
                        : "Use OTPs online. Offline PINs refresh after sync."}
                    </span>
                    {offlinePinCacheUpdatedAt ? <em>Updated {new Date(offlinePinCacheUpdatedAt).toLocaleTimeString()}</em> : null}
                  </div>
                  <div className="meeting-entry-actions">
                    <button className="button" disabled={saving} type="submit">
                      <LockKeyhole size={16} />
                      Start
                    </button>
                    <button className="button secondary" disabled={saving || isOffline} onClick={sendOtpBatch} type="button">
                      OTPs
                    </button>
                    <button className="button secondary" disabled={saving || isOffline} onClick={prepareOfflineCache} type="button">
                      Refresh PINs
                    </button>
                  </div>
                </form>
              ) : null}

              {activePanel === "attendance" ? (
                <>
                  <div className="meeting-entry-attendance">
                    {members.map((member) => (
                      <label key={member.id}>
                        <span>{member.fullName}</span>
                        <select
                          onChange={(event) =>
                            setAttendance((current) => ({
                              ...current,
                              [member.id]: event.target.value as "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"
                            }))
                          }
                          value={attendance[member.id] ?? "PRESENT"}
                        >
                          <option value="PRESENT">Present</option>
                          <option value="LATE">Late</option>
                          <option value="ABSENT">Absent</option>
                          <option value="EXCUSED">Excused</option>
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="meeting-entry-actions">
                    <button className="button" disabled={saving} onClick={saveAttendance} type="button">
                      <CheckCircle2 size={16} />
                      Save attendance
                    </button>
                  </div>
                </>
              ) : null}

              {activePanel === "transactions" ? (
                <>
                  <div className="meeting-entry-member-picker">
                    <label className="credential-field compact">
                      <span>Member</span>
                      <select
                        aria-label="Fast entry member"
                        onChange={(event) => setActiveEntryMemberId(event.target.value)}
                        value={activeEntryMember?.id ?? ""}
                      >
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.fullName} - {humanizeEnum(member.role)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="credential-field compact">
                      <span>Entry view</span>
                      <select
                        aria-label="Entry view"
                        onChange={(event) => setShowAllFastEntry(event.target.value === "all")}
                        value={showAllFastEntry ? "all" : "single"}
                      >
                        <option value="single">Single member</option>
                        <option value="all">All members</option>
                      </select>
                    </label>
                  </div>
                  {!showAllFastEntry && activeEntryMember ? (
                    <div className="meeting-entry-single-card">
                      <header>
                        <div>
                          <strong>{activeEntryMember.fullName}</strong>
                          <span>{humanizeEnum(activeEntryMember.role)}</span>
                        </div>
                        <em>1 share = {formatKes(shareValueCents)}</em>
                      </header>
                      <div className="meeting-entry-single-grid">
                        <section className="meeting-entry-single-field share">
                          <div className="meeting-entry-single-label">
                            <strong>Share purchase</strong>
                            <span>Max {shareLimit}</span>
                          </div>
                          <div
                            aria-label={`${activeEntryMember.fullName} share purchase`}
                            className="meeting-entry-share-boxes"
                            role="radiogroup"
                          >
                            {shareNumbers.map((count) => {
                              const selected = selectedShareCount(activeEntryMember.id) === count;
                              return (
                                <button
                                  aria-checked={selected}
                                  className={selected ? "selected" : ""}
                                  key={count}
                                  onClick={() => updateShareCount(activeEntryMember.id, count)}
                                  role="radio"
                                  type="button"
                                >
                                  {count}
                                </button>
                              );
                            })}
                          </div>
                          <div className="meeting-entry-share-summary">
                            <span>
                              {selectedShareCount(activeEntryMember.id) > 0
                                ? `${selectedShareCount(activeEntryMember.id)} shares = ${formatKes(
                                    amountToCents(amounts[activeEntryMember.id]?.sharePurchase ?? "")
                                  )}`
                                : "No share purchase selected"}
                            </span>
                            <button
                              className="meeting-entry-clear-share"
                              onClick={() => updateAmount(activeEntryMember.id, "sharePurchase", "")}
                              type="button"
                            >
                              Clear
                            </button>
                          </div>
                        </section>
                        {entryAmountFields
                          .filter((field) => field.key !== "sharePurchase")
                          .map((field) => (
                            <label className="meeting-entry-single-field" key={field.key}>
                              <span>{field.label}</span>
                              <input
                                aria-label={`${activeEntryMember.fullName} ${field.label}`}
                                inputMode="decimal"
                                onChange={(event) => updateAmount(activeEntryMember.id, field.key, event.target.value)}
                                placeholder="0"
                                value={amounts[activeEntryMember.id]?.[field.key] ?? ""}
                              />
                              <div className="meeting-entry-presets">
                                {field.presets.map((preset) => (
                                  <button
                                    key={preset}
                                    onClick={() => applyPreset(activeEntryMember.id, field.key, preset)}
                                    type="button"
                                  >
                                    +{preset}
                                  </button>
                                ))}
                              </div>
                            </label>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <div aria-label="All member meeting entry" className="meeting-entry-all-member-list">
                      {visibleEntryMembers.map((member) => (
                        <section className="meeting-entry-member-entry-card" key={member.id}>
                          <header>
                            <div>
                              <strong>{member.fullName}</strong>
                              <span>{humanizeEnum(member.role)}</span>
                            </div>
                            <em>1 share = {formatKes(shareValueCents)}</em>
                          </header>
                          <div className="meeting-entry-member-entry-grid">
                            <section className="meeting-entry-single-field share">
                              <div className="meeting-entry-single-label">
                                <strong>Share purchase</strong>
                                <span>Max {shareLimit}</span>
                              </div>
                              <div
                                aria-label={`${member.fullName} share purchase`}
                                className="meeting-entry-share-boxes"
                                role="radiogroup"
                              >
                                {shareNumbers.map((count) => {
                                  const selected = selectedShareCount(member.id) === count;
                                  return (
                                    <button
                                      aria-checked={selected}
                                      className={selected ? "selected" : ""}
                                      key={count}
                                      onClick={() => updateShareCount(member.id, count)}
                                      role="radio"
                                      type="button"
                                    >
                                      {count}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="meeting-entry-share-summary">
                                <span>
                                  {selectedShareCount(member.id) > 0
                                    ? `${selectedShareCount(member.id)} shares = ${formatKes(
                                        amountToCents(amounts[member.id]?.sharePurchase ?? "")
                                      )}`
                                    : "No share purchase selected"}
                                </span>
                                <button
                                  className="meeting-entry-clear-share"
                                  onClick={() => updateAmount(member.id, "sharePurchase", "")}
                                  type="button"
                                >
                                  Clear
                                </button>
                              </div>
                            </section>
                            {entryAmountFields
                              .filter((field) => field.key !== "sharePurchase")
                              .map((field) => (
                                <label className="meeting-entry-single-field" key={field.key}>
                                  <span>{field.label}</span>
                                  <input
                                    aria-label={`${member.fullName} ${field.label}`}
                                    inputMode="decimal"
                                    onChange={(event) => updateAmount(member.id, field.key, event.target.value)}
                                    placeholder="0"
                                    value={amounts[member.id]?.[field.key] ?? ""}
                                  />
                                  <div className="meeting-entry-presets">
                                    {field.presets.map((preset) => (
                                      <button
                                        key={preset}
                                        onClick={() => applyPreset(member.id, field.key, preset)}
                                        type="button"
                                      >
                                        +{preset}
                                      </button>
                                    ))}
                                  </div>
                                </label>
                              ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                  <div className="meeting-entry-actions sticky">
                    <button className="button" disabled={saving} onClick={saveLedgerEntries} type="button">
                      <CheckCircle2 size={16} />
                      Save entries
                    </button>
                  </div>
                </>
              ) : null}

              {activePanel === "shareOut" ? (
                <>
                  <form className="credential-form" onSubmit={previewShareOut}>
                    <label className="credential-field">
                      <span>Pool amount</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) => setShareOutPool(event.target.value)}
                        placeholder="0"
                        required
                        value={shareOutPool}
                      />
                    </label>
                    <div className="meeting-entry-actions">
                      <button className="button secondary" disabled={saving} type="submit">
                        Preview
                      </button>
                      <button className="button" disabled={saving || !shareOutPreview} onClick={postShareOut} type="button">
                        Post payouts
                      </button>
                    </div>
                  </form>
                  {shareOutPreview ? (
                    <div className="meeting-entry-preview">
                      <strong>{shareOutPreview.rows.length} payouts</strong>
                      <span>Total share purchase {formatKes(shareOutPreview.totalShareCents)}</span>
                      <span>Rounding {formatKes(shareOutPreview.roundingDifferenceCents)}</span>
                      {shareOutPreview.rows.slice(0, 6).map((row) => (
                        <div key={row.memberId}>
                          <span>{row.member?.fullName ?? row.memberId}</span>
                          <strong>{formatKes(row.payoutCents)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}

              {activePanel === "sync" ? (
                <>
                  <div className="meeting-entry-review">
                    <div>
                      <span>Awaiting sync</span>
                      <strong>{pendingDraftCount}</strong>
                    </div>
                    <div>
                      <span>Queue details</span>
                      <strong>{syncDetailText}</strong>
                    </div>
                    <div>
                      <span>Meeting total</span>
                      <strong>{formatKes(totalLedgerCents(ledger))}</strong>
                    </div>
                    <div>
                      <span>Rows</span>
                      <strong>{ledger.length}</strong>
                    </div>
                    <div>
                      <span>Conflicts</span>
                      <strong>{conflicts.length}</strong>
                    </div>
                  </div>
                  {conflicts.length > 0 ? (
                    <div className="meeting-entry-conflicts">
                      {conflicts.map((conflict, index) => (
                        <div key={`${conflict.code}-${index}`}>
                          <strong>{conflict.code}</strong>
                          <span>{conflict.message}</span>
                          {conflict.clientRequestId ? <em>{conflict.clientRequestId}</em> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state compact">No conflict rows</div>
                  )}
                  <div className="meeting-entry-actions">
                    <button className="button" disabled={saving} onClick={syncQueuedDraft} type="button">
                      Sync queued data
                    </button>
                  </div>
                </>
              ) : null}

              {activePanel === "records" ? (
                <div className="meeting-entry-table-wrap">
                  <table className="meeting-entry-table compact">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Type</th>
                        <th>Direction</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLedger.map((entry) => (
                        <tr key={entry.id}>
                          <td data-label="Member">{entry.member?.fullName ?? "Group"}</td>
                          <td data-label="Type">{humanizeEnum(entry.type)}</td>
                          <td data-label="Direction">{humanizeEnum(entry.direction)}</td>
                          <td data-label="Amount">{formatKes(entry.amountCents)}</td>
                        </tr>
                      ))}
                      {recentLedger.length === 0 ? (
                        <tr>
                          <td colSpan={4}>No transactions yet</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

type OfflineMeetingDraftInput = {
  keySubmissions: Parameters<typeof queueMeetingDraft>[0]["keySubmissions"];
  attendance: Parameters<typeof queueMeetingDraft>[0]["attendance"];
};
