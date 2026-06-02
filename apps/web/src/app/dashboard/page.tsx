"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CircleDollarSign,
  KeyRound,
  ShieldCheck,
  ShoppingBag,
  UsersRound
} from "@/lib/theme-icons";
import type { PortfolioSummary } from "@intellicash/shared";
import { apiFetch, formatKes, humanizeEnum } from "../../lib/api";
import { StatCard } from "../../components/dashboard/stat-card";
import { navigationItems } from "../../lib/navigation";
import type {
  AuditEvent,
  GroupRow,
  IntegrationHealth,
  LedgerEntry,
  MeetingRow,
  Member,
  StoreCreditRequest,
  User
} from "../../components/dashboard/types";

interface MeetingWithGroup extends MeetingRow {
  group?: {
    id: string;
    name: string;
    code: string;
    county: string;
  };
}

function canReadAudit(role: string) {
  return ["IWL_ADMIN", "PARTNER_OFFICER", "LENDER", "READ_ONLY"].includes(role);
}

function canReadIntegrations(role: string) {
  return ["IWL_ADMIN", "PARTNER_OFFICER", "LENDER", "READ_ONLY"].includes(role);
}

function canReadMeetings(role: string) {
  return role !== "LENDER";
}

function canReadStoreRequests(user: User) {
  if (user.permissions) return user.permissions.includes("store:read");

  return navigationItems.some(
    (item) => item.href === "/dashboard/intelli-store" && item.roles.includes(user.role)
  );
}

function requestOutstandingCents(request: StoreCreditRequest) {
  if (request.installments && request.installments.length > 0) {
    return request.installments.reduce(
      (sum, installment) => sum + Math.max(0, installment.totalDueCents - installment.paidCents),
      0
    );
  }

  const repaidCents = request.repayments?.reduce((sum, repayment) => sum + repayment.amountCents, 0) ?? 0;
  return Math.max(0, (request.financedAmountCents ?? 0) - repaidCents);
}

interface MemberCycleSummary {
  cycleNumber: number;
  entries: number;
  sharePurchaseCents: number;
  shareOutPayoutCents: number;
  otherTransactionCents: number;
  startAt?: string;
  endAt?: string;
  closedAt?: string;
}

function emptyMemberCycleSummary(cycleNumber: number): MemberCycleSummary {
  return {
    cycleNumber,
    entries: 0,
    sharePurchaseCents: 0,
    shareOutPayoutCents: 0,
    otherTransactionCents: 0
  };
}

function addEntryToCycle(summary: MemberCycleSummary, entry: LedgerEntry) {
  summary.entries += 1;
  if (!summary.startAt || new Date(entry.createdAt).getTime() < new Date(summary.startAt).getTime()) {
    summary.startAt = entry.createdAt;
  }
  if (!summary.endAt || new Date(entry.createdAt).getTime() > new Date(summary.endAt).getTime()) {
    summary.endAt = entry.createdAt;
  }

  if (entry.type === "SHARE_PURCHASE") {
    summary.sharePurchaseCents += entry.amountCents;
  } else if (entry.type === "SHARE_OUT_PAYOUT") {
    summary.shareOutPayoutCents += entry.amountCents;
    summary.closedAt = entry.createdAt;
  } else {
    summary.otherTransactionCents += entry.amountCents;
  }
}

function buildMemberCycleHistory(ledger: LedgerEntry[], currentCycleNumber: number) {
  const currentCycle = Math.max(1, currentCycleNumber || 1);
  const sortedLedger = [...ledger].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
  const shareOutCount = sortedLedger.filter((entry) => entry.type === "SHARE_OUT_PAYOUT").length;
  let cycleNumber = Math.max(1, currentCycle - shareOutCount);
  const summaries = new Map<number, MemberCycleSummary>();
  const entryCycleMap = new Map<string, number>();

  for (const entry of sortedLedger) {
    const summary = summaries.get(cycleNumber) ?? emptyMemberCycleSummary(cycleNumber);
    addEntryToCycle(summary, entry);
    summaries.set(cycleNumber, summary);
    entryCycleMap.set(entry.id, cycleNumber);

    if (entry.type === "SHARE_OUT_PAYOUT" && cycleNumber < currentCycle) {
      cycleNumber += 1;
    }
  }

  const current = summaries.get(currentCycle) ?? emptyMemberCycleSummary(currentCycle);
  const previous = Array.from(summaries.values())
    .filter((summary) => summary.cycleNumber < currentCycle && summary.entries > 0)
    .sort((left, right) => right.cycleNumber - left.cycleNumber);

  return { current, previous, entryCycleMap };
}

interface MemberPassbookMeetingSummary {
  key: string;
  meetingTitle: string;
  scheduledAt?: string;
  latestEntryAt: string;
  sharesBought: number | null;
  sharePurchaseCents: number;
  socialFundCents: number;
  loanRepaymentCents: number;
  loanDisbursementCents: number;
}

function shareCountFromDescription(description: string) {
  const match = description.match(/\b(\d+(?:\.\d+)?)\s+shares?\b/i);
  return match?.[1] ? Number(match[1]) : null;
}

function emptyPassbookMeetingSummary(entry: LedgerEntry): MemberPassbookMeetingSummary {
  return {
    key: entry.meeting?.id ?? entry.meetingId ?? entry.id,
    meetingTitle: entry.meeting?.title ?? "No meeting",
    scheduledAt: entry.meeting?.scheduledAt ?? undefined,
    latestEntryAt: entry.createdAt,
    sharesBought: null,
    sharePurchaseCents: 0,
    socialFundCents: 0,
    loanRepaymentCents: 0,
    loanDisbursementCents: 0
  };
}

function buildMemberPassbookByMeeting(ledger: LedgerEntry[]) {
  const passbookTypes = new Set([
    "SHARE_PURCHASE",
    "SOCIAL_CONTRIBUTION",
    "LOAN_REPAYMENT",
    "INTERNAL_LOAN_DISBURSEMENT"
  ]);
  const summaries = new Map<string, MemberPassbookMeetingSummary>();

  for (const entry of ledger) {
    if (!passbookTypes.has(entry.type)) continue;

    const key = entry.meeting?.id ?? entry.meetingId ?? entry.id;
    const summary = summaries.get(key) ?? emptyPassbookMeetingSummary(entry);

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

const moduleNotes: Record<string, string> = {
  "/dashboard/meetings": "Calendar, map, meeting transactions",
  "/dashboard/passbook": "Shares, social fund, loans",
  "/dashboard/users": "Accounts and access",
  "/dashboard/payments": "Partner wallet payments",
  "/dashboard/programmes": "Projects and public funding",
  "/dashboard/intelli-store": "Products and requests",
  "/dashboard/reports": "Exports and summaries",
  "/dashboard/intelliaudit": "Evidence and reports",
  "/dashboard/groups": "Groups, members, ledger",
  "/dashboard/partners": "Partner records",
  "/dashboard/agents": "VA / CBT assignments",
  "/dashboard/audit": "System events",
  "/dashboard/api-docs": "API keys and docs",
  "/dashboard/integrations": "Provider status",
  "/dashboard/settings": "Platform settings"
};

function formatShortDateTime(value: string) {
  return new Date(value).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function visibleModules(user: User) {
  return navigationItems.filter((item) => item.href !== "/dashboard" && item.roles.includes(user.role));
}

function DashboardIntro({
  actionHref,
  actionLabel,
  eyebrow,
  title,
  user
}: {
  actionHref: string;
  actionLabel: string;
  eyebrow: string;
  title: string;
  user: User;
}) {
  return (
    <section className="page-heading account-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <div className="account-scope-line">
          <span>{humanizeEnum(user.role)}</span>
          {user.partner ? <span>{user.partner.name}</span> : null}
          {user.group ? <span>{user.group.name}</span> : null}
          {user.member ? <span>{user.member.fullName}</span> : null}
        </div>
      </div>
      <Link className="button" href={actionHref}>
        {actionLabel}
        <ArrowRight size={17} />
      </Link>
    </section>
  );
}

function QuickAccessSection({ user }: { user: User }) {
  const modules = visibleModules(user);

  return (
    <section className="data-card dashboard-quick-card">
      <header>
        <div>
          <h3>Quick access</h3>
          <span>{modules.length} modules available</span>
        </div>
      </header>
      <div className="dashboard-module-grid">
        {modules.map((item) => {
          const Icon = item.icon;

          return (
            <Link className="dashboard-module-link" href={item.href} key={item.href}>
              <Icon size={18} />
              <span>
                <strong>{item.label}</strong>
                <em>{moduleNotes[item.href] ?? "Open module"}</em>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DashboardDataCard({
  actionHref,
  actionLabel = "Open",
  children,
  count,
  title
}: {
  actionHref: string;
  actionLabel?: string;
  children: React.ReactNode;
  count?: number;
  title: string;
}) {
  return (
    <section className="data-card dashboard-data-card">
      <header>
        <div>
          <h3>{title}</h3>
        </div>
        <div className="dashboard-data-actions">
          {typeof count === "number" ? <span className="pill">{count}</span> : null}
          <Link className="button secondary" href={actionHref}>
            {actionLabel}
          </Link>
        </div>
      </header>
      {children}
    </section>
  );
}

export default function DashboardOverviewPage() {
  const [user, setUser] = useState<User | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingWithGroup[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [storeRequests, setStoreRequests] = useState<StoreCreditRequest[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationHealth | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadOverview() {
      try {
        const me = await apiFetch<User>("/auth/me");
        const [
          portfolioResponse,
          groupsResponse,
          integrationResponse,
          auditResponse,
          storeRequestResponse
        ] =
          await Promise.all([
            apiFetch<PortfolioSummary>("/analytics/portfolio"),
            apiFetch<GroupRow[]>("/groups"),
            canReadIntegrations(me.role)
              ? apiFetch<IntegrationHealth>("/integrations/health")
              : Promise.resolve(null),
            canReadAudit(me.role) ? apiFetch<AuditEvent[]>("/audit/events") : Promise.resolve([]),
            canReadStoreRequests(me)
              ? apiFetch<StoreCreditRequest[]>("/intelli-store/credit-requests").catch(() => [])
              : Promise.resolve([])
          ]);

        const meetingResponse = canReadMeetings(me.role)
          ? await apiFetch<MeetingWithGroup[]>("/meetings")
          : [];
        const primaryGroupId = groupsResponse[0]?.id;
        const [memberResponse, ledgerResponse] = primaryGroupId
          ? await Promise.all([
              apiFetch<Member[]>(`/groups/${primaryGroupId}/members`),
              apiFetch<LedgerEntry[]>(`/groups/${primaryGroupId}/ledger`)
            ])
          : [[], []];

        if (!mounted) return;
        setUser(me);
        setPortfolio(portfolioResponse);
        setGroups(groupsResponse);
        setIntegrations(integrationResponse);
        setAuditEvents(auditResponse);
        setMeetings(meetingResponse);
        setMembers(memberResponse);
        setLedger(ledgerResponse);
        setStoreRequests(storeRequestResponse);
      } catch (overviewError) {
        if (mounted) {
          setError(overviewError instanceof Error ? overviewError.message : "Dashboard failed");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadOverview();
    return () => {
      mounted = false;
    };
  }, []);

  const activeGroups = useMemo(
    () => groups.filter((group) => group.phase !== "POST_GRADUATION").length,
    [groups]
  );
  const primaryGroup = groups[0] ?? null;
  const liveMeetings = meetings.filter((meeting) => meeting.status === "IN_PROGRESS").length;

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!user) return <div className="error">Account could not be loaded.</div>;

  if (user.role === "MEMBER") {
    return (
      <MemberDashboard
        ledger={ledger}
        members={members}
        meetings={meetings}
        primaryGroup={primaryGroup}
        storeRequests={storeRequests}
        user={user}
      />
    );
  }

  if (user.role === "GROUP_ACCOUNT") {
    return (
      <GroupAccountDashboard
        groups={groups}
        ledger={ledger}
        members={members}
        meetings={meetings}
        primaryGroup={primaryGroup}
        storeRequests={storeRequests}
        user={user}
      />
    );
  }

  if (user.role === "PARTNER_OFFICER") {
    return (
      <PartnerOfficerDashboard
        activeGroups={activeGroups}
        auditEvents={auditEvents}
        groups={groups}
        integrations={integrations}
        liveMeetings={liveMeetings}
        meetings={meetings}
        portfolio={portfolio}
        storeRequests={storeRequests}
        user={user}
      />
    );
  }

  if (user.role === "LENDER") {
    return (
      <LenderDashboard
        activeGroups={activeGroups}
        auditEvents={auditEvents}
        groups={groups}
        integrations={integrations}
        portfolio={portfolio}
        storeRequests={storeRequests}
        user={user}
      />
    );
  }

  if (user.role === "READ_ONLY") {
    return (
      <ReadOnlyDashboard
        activeGroups={activeGroups}
        auditEvents={auditEvents}
        groups={groups}
        integrations={integrations}
        portfolio={portfolio}
        storeRequests={storeRequests}
        user={user}
      />
    );
  }

  return (
    <AdminDashboard
      activeGroups={activeGroups}
      auditEvents={auditEvents}
      groups={groups}
      integrations={integrations}
      portfolio={portfolio}
      storeRequests={storeRequests}
      user={user}
    />
  );
}

function MemberDashboard({
  ledger,
  members,
  meetings,
  primaryGroup,
  storeRequests,
  user
}: {
  ledger: LedgerEntry[];
  members: Member[];
  meetings: MeetingWithGroup[];
  primaryGroup: GroupRow | null;
  storeRequests: StoreCreditRequest[];
  user: User;
}) {
  const currentCycleNumber = primaryGroup?.cycleNumber ?? 1;
  const cycleHistory = useMemo(
    () => buildMemberCycleHistory(ledger, currentCycleNumber),
    [currentCycleNumber, ledger]
  );
  const currentMember = members.find((member) => member.id === user.memberId) ?? null;
  const activeStoreRequests = storeRequests.filter(
    (request) => !["REJECTED", "CANCELLED"].includes(request.status) && request.repaymentStatus !== "PAID"
  );
  const outstandingCreditCents = storeRequests.reduce(
    (sum, request) => sum + requestOutstandingCents(request),
    0
  );
  const nextMeetings = [...meetings]
    .filter((meeting) => meeting.status !== "SEALED")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const passbookRows = useMemo(() => buildMemberPassbookByMeeting(ledger), [ledger]);
  const recentTransactions = [...ledger]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5);
  const [pinMessage, setPinMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  async function requestOwnPin() {
    setPinSaving(true);
    setPinMessage(null);

    try {
      await apiFetch("/members/me/pin", {
        method: "POST",
        body: JSON.stringify({})
      });
      setPinMessage({ ok: true, text: "PIN sent." });
    } catch (pinError) {
      setPinMessage({ ok: false, text: pinError instanceof Error ? pinError.message : "PIN request failed" });
    } finally {
      setPinSaving(false);
    }
  }

  return (
    <>
      <DashboardIntro
        actionHref="/dashboard/meetings"
        actionLabel="Open meetings"
        eyebrow="Member"
        title="My dashboard"
        user={user}
      />

      <QuickAccessSection user={user} />

      <section className="stat-grid dashboard-stat-grid">
        <StatCard icon={<CircleDollarSign size={20} />} label="Cycle shares" note={`Cycle ${currentCycleNumber}`} value={formatKes(cycleHistory.current.sharePurchaseCents)} />
        <StatCard icon={<Activity size={20} />} label="Meetings" note={`${nextMeetings.length} upcoming`} value={meetings.length.toString()} />
        <StatCard icon={<ShoppingBag size={20} />} label="Store credit" note={`${activeStoreRequests.length} active`} value={formatKes(outstandingCreditCents)} />
        <StatCard icon={<ShieldCheck size={20} />} label="Passbook" note="Meetings with records" value={passbookRows.length.toString()} />
      </section>

      <section className="dashboard-data-grid">
        <DashboardDataCard actionHref="/dashboard/meetings" count={nextMeetings.length} title="Meetings">
          <div className="list">
            {nextMeetings.slice(0, 4).map((meeting) => (
              <div className="list-row" key={meeting.id}>
                <div>
                  <strong>{meeting.title}</strong>
                  <span>{formatShortDateTime(meeting.scheduledAt)}</span>
                </div>
                <span className={`pill ${meeting.status === "IN_PROGRESS" ? "" : "blue"}`}>
                  {humanizeEnum(meeting.status)}
                </span>
              </div>
            ))}
            {nextMeetings.length === 0 ? <div className="empty-state">No meetings</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/passbook" actionLabel="Passbook" count={ledger.length} title="Transactions">
          <div className="list">
            {recentTransactions.map((entry) => (
              <div className="list-row" key={entry.id}>
                <div>
                  <strong>{entry.description}</strong>
                  <span>{humanizeEnum(entry.type)} - {formatShortDateTime(entry.createdAt)}</span>
                </div>
                <span className={entry.direction === "CREDIT" ? "pill blue" : "pill gold"}>
                  {formatKes(entry.amountCents)}
                </span>
              </div>
            ))}
            {recentTransactions.length === 0 ? <div className="empty-state">No transactions</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/intelli-store" count={storeRequests.length} title="Store requests">
          <div className="list">
            {storeRequests.slice(0, 4).map((request) => (
              <div className="list-row" key={request.id}>
                <div>
                  <strong>{request.product?.name ?? "Product request"}</strong>
                  <span>{formatKes(requestOutstandingCents(request))} due</span>
                </div>
                <span className="pill">{humanizeEnum(request.status)}</span>
              </div>
            ))}
            {storeRequests.length === 0 ? <div className="empty-state">No store requests</div> : null}
          </div>
        </DashboardDataCard>

        <section className="data-card dashboard-data-card member-summary-card">
          <header>
            <div>
              <h3>Member</h3>
            </div>
            <div className="member-summary-actions">
              <span className={`pill ${currentMember?.pinSet ? "blue" : "gold"}`}>
                {currentMember?.pinSet ? "PIN set" : "Needs PIN"}
              </span>
              <button className="button compact" disabled={pinSaving} onClick={requestOwnPin} type="button">
                <KeyRound size={16} />
                {pinSaving ? "Sending" : "Send PIN"}
              </button>
            </div>
          </header>
          {pinMessage ? <div className={pinMessage.ok ? "notice success" : "notice warning"}>{pinMessage.text}</div> : null}
          <div className="list">
            <div className="list-row">
              <div>
                <strong>{currentMember?.fullName ?? user.member?.fullName ?? user.name}</strong>
                <span>{currentMember?.phone ?? user.member?.phone ?? user.email}</span>
              </div>
              <span className="pill blue">{humanizeEnum(currentMember?.role ?? "MEMBER")}</span>
            </div>
            <div className="list-row">
              <div>
                <strong>KYC</strong>
                <span>{humanizeEnum(currentMember?.kycStatus ?? "PENDING")}</span>
              </div>
              <span className="pill">{humanizeEnum(currentMember?.status ?? "ACTIVE")}</span>
            </div>
          </div>
        </section>
      </section>
    </>
  );
}

const closedStoreRequestStatuses = new Set(["CANCELLED", "CANCELED", "REJECTED", "FULFILLED"]);

function activeStoreRequestList(storeRequests: StoreCreditRequest[]) {
  return storeRequests.filter(
    (request) => !closedStoreRequestStatuses.has(request.status) && request.repaymentStatus !== "PAID"
  );
}

function recentStoreRequestList(storeRequests: StoreCreditRequest[]) {
  return [...storeRequests].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function recentLedgerList(ledger: LedgerEntry[]) {
  return [...ledger].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

function latestGroupScore(group: GroupRow) {
  return group.creditScores[0]?.score;
}

function averageCreditScore(groups: GroupRow[], portfolio: PortfolioSummary | null) {
  if (portfolio?.averageCreditScore) return portfolio.averageCreditScore;

  const scores = groups
    .map((group) => latestGroupScore(group))
    .filter((score): score is number => typeof score === "number");
  if (scores.length === 0) return null;

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function integrationReadiness(integrations: IntegrationHealth | null) {
  return `${integrations?.configured ?? 0}/${integrations?.total ?? 0}`;
}

function GroupAccountDashboard({
  groups,
  ledger,
  members,
  meetings,
  primaryGroup,
  storeRequests,
  user
}: {
  groups: GroupRow[];
  ledger: LedgerEntry[];
  members: Member[];
  meetings: MeetingWithGroup[];
  primaryGroup: GroupRow | null;
  storeRequests: StoreCreditRequest[];
  user: User;
}) {
  const nextMeetings = [...meetings]
    .filter((meeting) => meeting.status !== "SEALED")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const liveMeetings = meetings.filter((meeting) => meeting.status === "IN_PROGRESS").length;
  const recentRecords = recentLedgerList(ledger);
  const activeRequests = activeStoreRequestList(storeRequests);
  const membersHref = primaryGroup ? `/dashboard/groups/${primaryGroup.id}/members` : "/dashboard";
  const ledgerHref = primaryGroup ? `/dashboard/groups/${primaryGroup.id}/ledger` : "/dashboard";

  return (
    <>
      <DashboardIntro
        actionHref="/dashboard/meetings"
        actionLabel="Open meetings"
        eyebrow="Group Account"
        title="Group dashboard"
        user={user}
      />

      <QuickAccessSection user={user} />

      <section className="stat-grid dashboard-stat-grid">
        <StatCard icon={<Activity size={20} />} label="Next meetings" note={`${liveMeetings} live now`} value={nextMeetings.length.toString()} />
        <StatCard icon={<UsersRound size={20} />} label="Members" note={primaryGroup?.phase ? humanizeEnum(primaryGroup.phase) : "Group scope"} value={members.length.toString()} />
        <StatCard icon={<CircleDollarSign size={20} />} label="Records" note="Ledger entries" value={ledger.length.toString()} />
        <StatCard icon={<ShoppingBag size={20} />} label="Requests" note={`${activeRequests.length} active`} value={storeRequests.length.toString()} />
      </section>

      <section className="dashboard-data-grid">
        <DashboardDataCard actionHref="/dashboard/meetings" count={nextMeetings.length} title="Next meetings">
          <div className="list">
            {nextMeetings.slice(0, 5).map((meeting) => (
              <div className="list-row" key={meeting.id}>
                <div>
                  <strong>{meeting.title}</strong>
                  <span>{formatShortDateTime(meeting.scheduledAt)}</span>
                </div>
                <span className={`pill ${meeting.status === "IN_PROGRESS" ? "" : "blue"}`}>
                  {humanizeEnum(meeting.status)}
                </span>
              </div>
            ))}
            {nextMeetings.length === 0 ? <div className="empty-state">No upcoming meetings</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref={membersHref} actionLabel="View members" count={members.length} title="Members">
          <div className="list">
            {members.slice(0, 5).map((member) => (
              <div className="list-row" key={member.id}>
                <div>
                  <strong>{member.fullName}</strong>
                  <span>{member.phone}</span>
                </div>
                <span className="pill blue">{humanizeEnum(member.role)}</span>
              </div>
            ))}
            {members.length === 0 ? <div className="empty-state">No members</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref={ledgerHref} actionLabel="View records" count={ledger.length} title="Records">
          <div className="list">
            {recentRecords.slice(0, 5).map((entry) => (
              <div className="list-row" key={entry.id}>
                <div>
                  <strong>{entry.description}</strong>
                  <span>{humanizeEnum(entry.type)} - {formatShortDateTime(entry.createdAt)}</span>
                </div>
                <span className={entry.direction === "CREDIT" ? "pill blue" : "pill gold"}>
                  {formatKes(entry.amountCents)}
                </span>
              </div>
            ))}
            {recentRecords.length === 0 ? <div className="empty-state">No ledger records</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/intelli-store" actionLabel="Open requests" count={activeRequests.length} title="Requests">
          <div className="list">
            {recentStoreRequestList(storeRequests).slice(0, 5).map((request) => (
              <div className="list-row" key={request.id}>
                <div>
                  <strong>{request.product?.name ?? "Product request"}</strong>
                  <span>{request.groupName ?? request.customerName} - {formatShortDateTime(request.createdAt)}</span>
                </div>
                <span className="pill">{humanizeEnum(request.status)}</span>
              </div>
            ))}
            {storeRequests.length === 0 ? <div className="empty-state">No store requests</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/reports" actionLabel="Open reports" title="Reports">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Group summaries</strong>
                <span>Meeting, member, request, and record exports</span>
              </div>
              <span className="pill blue">Ready</span>
            </div>
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/account" actionLabel="Open account" title="Account">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Champion profile</strong>
                <span>Avatar, language, password, and meeting settings</span>
              </div>
              <span className="pill">Manage</span>
            </div>
          </div>
        </DashboardDataCard>
      </section>
    </>
  );
}

function PartnerOfficerDashboard({
  activeGroups,
  auditEvents,
  groups,
  integrations,
  liveMeetings,
  meetings,
  portfolio,
  storeRequests,
  user
}: {
  activeGroups: number;
  auditEvents: AuditEvent[];
  groups: GroupRow[];
  integrations: IntegrationHealth | null;
  liveMeetings: number;
  meetings: MeetingWithGroup[];
  portfolio: PortfolioSummary | null;
  storeRequests: StoreCreditRequest[];
  user: User;
}) {
  const visibleProgrammes = portfolio?.groups ?? groups.length;
  const activeRequests = activeStoreRequestList(storeRequests);
  const serviceQuality = integrations?.total && integrations.configured === integrations.total ? "Ready" : "Check";
  const upcomingMeetings = [...meetings]
    .filter((meeting) => meeting.status !== "SEALED")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <>
      <DashboardIntro
        actionHref="/dashboard/programmes"
        actionLabel="Open programmes"
        eyebrow="Partner Officer"
        title="Partner service dashboard"
        user={user}
      />

      <QuickAccessSection user={user} />

      <section className="stat-grid dashboard-stat-grid">
        <StatCard icon={<ShoppingBag size={20} />} label="Programmes" note="Service delivery" value={visibleProgrammes.toString()} />
        <StatCard icon={<UsersRound size={20} />} label="Groups reached" note={`${portfolio?.members ?? 0} visible members`} value={activeGroups.toString()} />
        <StatCard icon={<Activity size={20} />} label="Live sessions" note="Programme meetings" value={liveMeetings.toString()} />
        <StatCard icon={<ShieldCheck size={20} />} label="Service quality" note={`${auditEvents.length} audit events`} value={serviceQuality} />
      </section>

      <section className="dashboard-data-grid">
        <DashboardDataCard actionHref="/dashboard/programmes" count={visibleProgrammes} title="Programmes">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Partner delivery</strong>
                <span>Projects, linked groups, public updates</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Requests in service</strong>
                <span>Store and field applications visible to this account</span>
              </div>
              <span className="pill">{activeRequests.length}</span>
            </div>
          </div>
        </DashboardDataCard>

        <GroupPrioritySection groups={groups} title="Groups reached" />

        <DashboardDataCard actionHref="/dashboard/meetings" count={upcomingMeetings.length} title="Live sessions">
          <div className="list">
            {upcomingMeetings.slice(0, 5).map((meeting) => (
              <div className="list-row" key={meeting.id}>
                <div>
                  <strong>{meeting.title}</strong>
                  <span>{meeting.group?.name ?? "Programme group"} - {formatShortDateTime(meeting.scheduledAt)}</span>
                </div>
                <span className={`pill ${meeting.status === "IN_PROGRESS" ? "" : "blue"}`}>
                  {humanizeEnum(meeting.status)}
                </span>
              </div>
            ))}
            {upcomingMeetings.length === 0 ? <div className="empty-state">No sessions</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/intelliaudit" count={auditEvents.length} title="Service quality">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Field evidence</strong>
                <span>Documents, approvals, and quality review</span>
              </div>
              <span className="pill blue">Tracked</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Provider readiness</strong>
                <span>{integrationReadiness(integrations)} integrations configured</span>
              </div>
              <span className="pill">{serviceQuality}</span>
            </div>
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/reports" title="Reports">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Partner reports</strong>
                <span>Group reach, meetings, service quality, impact evidence</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/agents" title="VA / CBT support">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Field support</strong>
                <span>Village agents, CBT assignments, caseload follow-up</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
          </div>
        </DashboardDataCard>
      </section>
    </>
  );
}

function LenderDashboard({
  activeGroups,
  auditEvents,
  groups,
  integrations,
  portfolio,
  storeRequests,
  user
}: {
  activeGroups: number;
  auditEvents: AuditEvent[];
  groups: GroupRow[];
  integrations: IntegrationHealth | null;
  portfolio: PortfolioSummary | null;
  storeRequests: StoreCreditRequest[];
  user: User;
}) {
  const reviewRequests = activeStoreRequestList(storeRequests);
  const score = averageCreditScore(groups, portfolio);

  return (
    <>
      <DashboardIntro
        actionHref="/dashboard/intelli-store"
        actionLabel="Review applications"
        eyebrow="Lender"
        title="Application review dashboard"
        user={user}
      />

      <QuickAccessSection user={user} />

      <section className="stat-grid dashboard-stat-grid">
        <StatCard icon={<ShoppingBag size={20} />} label="Applications" note={`${reviewRequests.length} active`} value={storeRequests.length.toString()} />
        <StatCard icon={<UsersRound size={20} />} label="Groups for review" note={`${portfolio?.members ?? 0} visible members`} value={activeGroups.toString()} />
        <StatCard icon={<ShieldCheck size={20} />} label="Credit signals" note="Average readiness score" value={score?.toString() ?? "Pending"} />
        <StatCard icon={<Activity size={20} />} label="Evidence" note={`${integrationReadiness(integrations)} integrations configured`} value={auditEvents.length.toString()} />
      </section>

      <section className="dashboard-data-grid">
        <DashboardDataCard actionHref="/dashboard/intelli-store" actionLabel="Review" count={reviewRequests.length} title="Applications">
          <div className="list">
            {recentStoreRequestList(storeRequests).slice(0, 5).map((request) => (
              <div className="list-row" key={request.id}>
                <div>
                  <strong>{request.customerName}</strong>
                  <span>{request.product?.name ?? "Product request"} - {request.groupName ?? "No group"} - {formatShortDateTime(request.createdAt)}</span>
                </div>
                <span className="pill">{humanizeEnum(request.status)}</span>
              </div>
            ))}
            {storeRequests.length === 0 ? <div className="empty-state">No applications</div> : null}
          </div>
        </DashboardDataCard>

        <GroupPrioritySection groups={groups} title="Groups for review" />

        <DashboardDataCard actionHref="/dashboard/reports" count={groups.length} title="Credit signals">
          <div className="list">
            {groups.slice(0, 5).map((group) => (
              <div className="list-row" key={group.id}>
                <div>
                  <strong>{group.name}</strong>
                  <span>{group.code} - {humanizeEnum(group.phase)}</span>
                </div>
                <span className="pill blue">{latestGroupScore(group)?.toString() ?? "Pending"}</span>
              </div>
            ))}
            {groups.length === 0 ? <div className="empty-state">No credit signals</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/intelliaudit" count={auditEvents.length} title="Evidence">
          <div className="list">
            {auditEvents.slice(0, 5).map((event) => (
              <div className="list-row" key={event.id}>
                <div>
                  <strong>{humanizeEnum(event.type)}</strong>
                  <span>{event.entityType} - {event.actor?.name ?? "System"}</span>
                </div>
                <span className="pill">{formatShortDateTime(event.createdAt)}</span>
              </div>
            ))}
            {auditEvents.length === 0 ? <div className="empty-state">No evidence events</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/reports" title="Reports">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Review reports</strong>
                <span>Applications, group readiness, evidence, and portfolio status</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
          </div>
        </DashboardDataCard>
      </section>
    </>
  );
}

function ReadOnlyDashboard({
  activeGroups,
  auditEvents,
  groups,
  integrations,
  portfolio,
  storeRequests,
  user
}: {
  activeGroups: number;
  auditEvents: AuditEvent[];
  groups: GroupRow[];
  integrations: IntegrationHealth | null;
  portfolio: PortfolioSummary | null;
  storeRequests: StoreCreditRequest[];
  user: User;
}) {
  return (
    <>
      <DashboardIntro
        actionHref="/dashboard/reports"
        actionLabel="Open reports"
        eyebrow="Read Only"
        title="Oversight dashboard"
        user={user}
      />

      <QuickAccessSection user={user} />

      <section className="stat-grid dashboard-stat-grid">
        <StatCard icon={<ShieldCheck size={20} />} label="Reports" note="Observation workspace" value="Open" />
        <StatCard icon={<Activity size={20} />} label="Audit events" note="System visibility" value={auditEvents.length.toString()} />
        <StatCard icon={<UsersRound size={20} />} label="Groups" note={`${portfolio?.members ?? 0} visible members`} value={activeGroups.toString()} />
        <StatCard icon={<ShoppingBag size={20} />} label="Integration status" note="Configured providers" value={integrationReadiness(integrations)} />
      </section>

      <section className="dashboard-data-grid">
        <DashboardDataCard actionHref="/dashboard/reports" title="Reports">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Observation reports</strong>
                <span>Groups, meetings, applications, and quality evidence</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/audit" count={auditEvents.length} title="Audit events">
          <div className="list">
            {auditEvents.slice(0, 5).map((event) => (
              <div className="list-row" key={event.id}>
                <div>
                  <strong>{humanizeEnum(event.type)}</strong>
                  <span>{event.entityType} - {event.actor?.name ?? "System"}</span>
                </div>
                <span className="pill">{formatShortDateTime(event.createdAt)}</span>
              </div>
            ))}
            {auditEvents.length === 0 ? <div className="empty-state">No audit events</div> : null}
          </div>
        </DashboardDataCard>

        <GroupPrioritySection groups={groups} title="Groups" />

        <DashboardDataCard actionHref="/dashboard/integrations" count={integrations?.total ?? 0} title="Integration status">
          <div className="list">
            {integrations?.statuses.slice(0, 5).map((status) => (
              <div className="list-row" key={status.provider}>
                <div>
                  <strong>{status.displayName}</strong>
                  <span>{status.configured ? "Available" : `${status.missingEnv.length} missing`}</span>
                </div>
                <span className={`pill ${status.configured ? "blue" : "gold"}`}>
                  {status.configured ? "Ready" : "Gated"}
                </span>
              </div>
            ))}
            {!integrations ? <div className="empty-state">No integration data</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/programmes" count={storeRequests.length} title="Public projects">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Programmes</strong>
                <span>Public project pages and partner updates</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Applications observed</strong>
                <span>Read-only Intelli-Store request visibility</span>
              </div>
              <span className="pill">{storeRequests.length}</span>
            </div>
          </div>
        </DashboardDataCard>
      </section>
    </>
  );
}

function AdminDashboard({
  activeGroups,
  auditEvents,
  groups,
  integrations,
  portfolio,
  storeRequests,
  user
}: {
  activeGroups: number;
  auditEvents: AuditEvent[];
  groups: GroupRow[];
  integrations: IntegrationHealth | null;
  portfolio: PortfolioSummary | null;
  storeRequests: StoreCreditRequest[];
  user: User;
}) {
  const activeRequests = activeStoreRequestList(storeRequests);

  return (
    <>
      <DashboardIntro
        actionHref="/dashboard/users"
        actionLabel="Review operations"
        eyebrow="IWL Admin"
        title="Operations control dashboard"
        user={user}
      />

      <QuickAccessSection user={user} />

      <section className="stat-grid dashboard-stat-grid">
        <StatCard icon={<ShieldCheck size={20} />} label="Access requests" note="Users and role scope" value="Open" />
        <StatCard icon={<UsersRound size={20} />} label="Groups" note={`${portfolio?.members ?? 0} members enrolled`} value={activeGroups.toString()} />
        <StatCard icon={<Activity size={20} />} label="Payments" note="Partner wallet operations" value="Queue" />
        <StatCard icon={<ShoppingBag size={20} />} label="Integrations" note="Provider readiness" value={integrationReadiness(integrations)} />
      </section>

      <section className="dashboard-data-grid">
        <DashboardDataCard actionHref="/dashboard/users" actionLabel="Users" count={activeRequests.length} title="Access requests">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>User access</strong>
                <span>Role permissions, account scopes, and recovery support</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Store applications</strong>
                <span>Applications waiting for platform operations</span>
              </div>
              <span className="pill">{activeRequests.length}</span>
            </div>
          </div>
        </DashboardDataCard>

        <GroupPrioritySection groups={groups} title="Groups" />

        <DashboardDataCard actionHref="/dashboard/partners" title="Partners">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Partner records</strong>
                <span>Off-takers, investors, lenders, and implementing partners</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/programmes" title="Programmes">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Programme operations</strong>
                <span>Projects, public pages, linked groups, and field delivery</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/payments" title="Payments">
          <div className="list">
            <div className="list-row">
              <div>
                <strong>Payments queue</strong>
                <span>Paystack, M-Pesa, KCB Buni, and wallet operations</span>
              </div>
              <span className="pill blue">Open</span>
            </div>
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/integrations" count={integrations?.total ?? 0} title="Integrations">
          <div className="list">
            {integrations?.statuses.slice(0, 6).map((status) => (
              <div className="list-row" key={status.provider}>
                <div>
                  <strong>{status.displayName}</strong>
                  <span>{status.missingEnv.length} missing env vars</span>
                </div>
                <span className={`pill ${status.configured ? "" : "gold"}`}>
                  {status.configured ? "Ready" : "Gated"}
                </span>
              </div>
            ))}
            {!integrations ? <div className="empty-state">No integration data</div> : null}
          </div>
        </DashboardDataCard>

        <DashboardDataCard actionHref="/dashboard/audit" actionLabel="Audit" count={auditEvents.length} title="Audit">
          <div className="list">
            {auditEvents.slice(0, 5).map((event) => (
              <div className="list-row" key={event.id}>
                <div>
                  <strong>{humanizeEnum(event.type)}</strong>
                  <span>{event.entityType} - {event.actor?.name ?? "System"}</span>
                </div>
                <span className="pill">{formatShortDateTime(event.createdAt)}</span>
              </div>
            ))}
            {auditEvents.length === 0 ? <div className="empty-state">No audit events</div> : null}
          </div>
        </DashboardDataCard>
      </section>
    </>
  );
}

function GroupPrioritySection({ groups, title }: { groups: GroupRow[]; title: string }) {
  return (
    <DashboardDataCard actionHref="/dashboard/groups" actionLabel="All groups" count={groups.length} title={title}>
      <div className="list">
        {groups.slice(0, 6).map((group) => (
          <div className="list-row" key={group.id}>
            <div>
              <strong>{group.name}</strong>
              <span>{group.code} - {group.county}</span>
            </div>
            <Link className="button secondary" href={`/dashboard/groups/${group.id}`}>
              Open
            </Link>
          </div>
        ))}
        {groups.length === 0 ? <div className="empty-state">No groups</div> : null}
      </div>
    </DashboardDataCard>
  );
}
