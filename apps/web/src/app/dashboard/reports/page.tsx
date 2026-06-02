"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  DatabaseZap,
  FileCheck2,
  Landmark,
  LockKeyhole,
  MapPinned,
  PieChart,
  ShieldCheck,
  TrendingUp,
  UserCog,
  UsersRound,
  WalletCards,
  SlidersHorizontal
} from "@/lib/theme-icons";
import type { PortfolioSummary } from "@intellicash/shared";
import { ApiClientError, apiFetch, formatKes, humanizeEnum } from "../../../lib/api";
import { DataTable } from "../../../components/dashboard/data-table";
import { StatCard } from "../../../components/dashboard/stat-card";
import type {
  AgentRow,
  AuditEvent,
  GroupRow,
  IntegrationHealth,
  IntegrationStatus,
  PartnerRow,
  ProgrammeRow,
  User
} from "../../../components/dashboard/types";
import {
  activeApiKeyCount,
  activeSessionCount,
  average,
  canUseReport,
  capacitySignal,
  categoryLabel,
  categoryOrder,
  creditBand,
  dateTime,
  dominantLabel,
  formatNumber,
  formatPercent,
  latestCreditScore,
  moneySignal,
  reportBasisLabel,
  reportUpdatedAt,
  sourceLabel
} from "../../../features/reports/model";
import type {
  ReportCard,
  ReportCategory,
  ReportFoundation,
  ReportId,
  ReportInsight
} from "../../../features/reports/model";

async function fetchIfPermitted<T>(
  permissions: Set<string>,
  permission: string,
  path: string,
  fallback: T
): Promise<T> {
  if (!permissions.has(permission)) return fallback;

  try {
    return await apiFetch<T>(path);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 403) {
      return fallback;
    }

    throw error;
  }
}

export default function ReportsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationHealth | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [foundation, setFoundation] = useState<ReportFoundation | null>(null);
  const [activeCategory, setActiveCategory] = useState<ReportCategory>("all");
  const [activeReport, setActiveReport] = useState<ReportId>("executive");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadReports() {
      try {
        const me = await apiFetch<User>("/auth/me");
        const permissions = new Set(me.permissions ?? []);

        if (!permissions.has("analytics:read")) {
          throw new Error("Reports require analytics access for this account.");
        }

        const [
          portfolioResponse,
          groupResponse,
          agentResponse,
          partnerResponse,
          programmeResponse,
          integrationResponse,
          auditResponse,
          foundationResponse
        ] = await Promise.all([
          apiFetch<PortfolioSummary>("/analytics/portfolio"),
          fetchIfPermitted<GroupRow[]>(permissions, "groups:read", "/groups", []),
          fetchIfPermitted<AgentRow[]>(permissions, "village-agents:read", "/village-agents", []),
          fetchIfPermitted<PartnerRow[]>(permissions, "partners:read", "/partners", []),
          fetchIfPermitted<ProgrammeRow[]>(permissions, "programmes:read", "/programmes", []),
          fetchIfPermitted<IntegrationHealth | null>(permissions, "integrations:read", "/integrations/health", null),
          fetchIfPermitted<AuditEvent[]>(permissions, "audit:read", "/audit/events", []),
          apiFetch<ReportFoundation>("/reports/foundation")
        ]);

        if (!mounted) return;
        setUser(me);
        setPortfolio(portfolioResponse);
        setGroups(groupResponse);
        setAgents(agentResponse);
        setPartners(partnerResponse);
        setProgrammes(programmeResponse);
        setIntegrations(integrationResponse);
        setAuditEvents(auditResponse);
        setFoundation(foundationResponse);
      } catch (reportsError) {
        if (mounted) {
          setError(reportsError instanceof Error ? reportsError.message : "Reports failed");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadReports();
    return () => {
      mounted = false;
    };
  }, []);

  const permissionSet = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const accountScope = foundation?.account;
  const accountScopeLabel =
    accountScope?.scopeName ??
    user?.group?.name ??
    user?.partner?.name ??
    user?.member?.fullName ??
    "This account";
  const accountScopeNote = accountScope
    ? `${humanizeEnum(accountScope.scopeType)} scope for ${humanizeEnum(accountScope.role ?? "ACCOUNT")}`
    : "Account-scoped reports";
  const canReadIntegrations = permissionSet.has("integrations:read");

  const activeGroups = useMemo(
    () => groups.filter((group) => group.phase !== "POST_GRADUATION"),
    [groups]
  );

  const creditScores = useMemo(
    () => groups.map(latestCreditScore).filter((score) => score > 0),
    [groups]
  );

  const financeReadyGroups = useMemo(
    () => groups.filter((group) => latestCreditScore(group) >= 80),
    [groups]
  );

  const fundAccounts = foundation?.fundAccounts ?? [];
  const ledgerEntries = foundation?.ledgerEntries ?? [];
  const systemUsers = foundation?.users ?? [];
  const meetings = foundation?.meetings ?? [];
  const votes = foundation?.votes ?? [];
  const reportVisibility = foundation?.visibility;
  const ftmaCountyVslaKpis = foundation?.ftmaCountyVslaKpis ?? [];
  const ftmaTrainingMetrics = foundation?.ftmaCountyVslaTrainingMetrics ?? [];
  const ftmaFscKpis = foundation?.ftmaCountyFscKpis ?? [];

  const fundBalanceRows = useMemo(
    () =>
      fundAccounts.map((account) => ({
        id: account.id,
        group: account.group.name,
        code: account.group.code,
        county: account.group.county,
        programme: account.group.programme?.name ?? "Unassigned",
        agent: account.group.villageAgent?.name ?? "Unassigned",
        fundType: humanizeEnum(account.type),
        rawFundType: account.type,
        balanceCents: account.balanceCents,
        balance: formatKes(account.balanceCents),
        members: account.group._count?.members ?? 0,
        source: sourceLabel(account.group.sourceSystem),
        signal: moneySignal(account.balanceCents)
      })),
    [fundAccounts]
  );

  const fundTypeRows = useMemo(() => {
    const fundMap = new Map<
      string,
      {
        accounts: number;
        groups: Set<string>;
        positiveGroups: Set<string>;
        totalCents: number;
        countyCounts: Record<string, number>;
      }
    >();

    fundAccounts.forEach((account) => {
      const entry =
        fundMap.get(account.type) ??
        {
          accounts: 0,
          groups: new Set<string>(),
          positiveGroups: new Set<string>(),
          totalCents: 0,
          countyCounts: {}
        };
      entry.accounts += 1;
      entry.groups.add(account.group.id);
      if (account.balanceCents > 0) entry.positiveGroups.add(account.group.id);
      entry.totalCents += account.balanceCents;
      entry.countyCounts[account.group.county] = (entry.countyCounts[account.group.county] ?? 0) + 1;
      fundMap.set(account.type, entry);
    });

    return Array.from(fundMap.entries())
      .map(([type, entry]) => ({
        type: humanizeEnum(type),
        rawType: type,
        accounts: entry.accounts,
        groups: entry.groups.size,
        positiveGroups: entry.positiveGroups.size,
        totalCents: entry.totalCents,
        total: formatKes(entry.totalCents),
        averageCents: entry.groups.size > 0 ? Math.round(entry.totalCents / entry.groups.size) : 0,
        average: formatKes(entry.groups.size > 0 ? Math.round(entry.totalCents / entry.groups.size) : 0),
        strongestCounty: dominantLabel(entry.countyCounts),
        signal: moneySignal(entry.totalCents)
      }))
      .sort((left, right) => right.totalCents - left.totalCents);
  }, [fundAccounts]);

  const cashConcentrationRows = useMemo(() => {
    const groupMap = new Map<
      string,
      {
        id: string;
        group: string;
        code: string;
        county: string;
        phase: string;
        source: string;
        members: number;
        internalLoanCents: number;
        socialCents: number;
        externalLoanCents: number;
        otherCents: number;
      }
    >();

    fundAccounts.forEach((account) => {
      const row =
        groupMap.get(account.group.id) ??
        {
          id: account.group.id,
          group: account.group.name,
          code: account.group.code,
          county: account.group.county,
          phase: account.group.phase ? humanizeEnum(account.group.phase) : "Unknown",
          source: sourceLabel(account.group.sourceSystem),
          members: account.group._count?.members ?? 0,
          internalLoanCents: 0,
          socialCents: 0,
          externalLoanCents: 0,
          otherCents: 0
        };

      if (account.type === "INTERNAL_LOAN") row.internalLoanCents += account.balanceCents;
      else if (account.type === "SOCIAL") row.socialCents += account.balanceCents;
      else if (account.type === "EXTERNAL_LOAN") row.externalLoanCents += account.balanceCents;
      else row.otherCents += account.balanceCents;
      groupMap.set(account.group.id, row);
    });

    return Array.from(groupMap.values())
      .map((row) => {
        const totalCents =
          row.internalLoanCents + row.socialCents + row.externalLoanCents + row.otherCents;
        return {
          ...row,
          totalCents,
          total: formatKes(totalCents),
          internalLoan: formatKes(row.internalLoanCents),
          social: formatKes(row.socialCents),
          externalLoan: formatKes(row.externalLoanCents),
          signal: moneySignal(totalCents)
        };
      })
      .sort((left, right) => right.totalCents - left.totalCents);
  }, [fundAccounts]);

  const externalLoanRows = useMemo(
    () =>
      fundAccounts
        .filter((account) => account.type === "EXTERNAL_LOAN" && account.balanceCents > 0)
        .map((account) => ({
          id: account.id,
          group: account.group.name,
          code: account.group.code,
          county: account.group.county,
          phase: account.group.phase ? humanizeEnum(account.group.phase) : "Unknown",
          outstandingCents: account.balanceCents,
          outstanding: formatKes(account.balanceCents),
          members: account.group._count?.members ?? 0,
          agent: account.group.villageAgent?.name ?? "Unassigned",
          source: sourceLabel(account.group.sourceSystem),
          exposureSignal:
            account.balanceCents >= 50_000_000
              ? "High exposure"
              : account.balanceCents >= 10_000_000
                ? "Moderate exposure"
                : "Low exposure"
        }))
        .sort((left, right) => right.outstandingCents - left.outstandingCents),
    [fundAccounts]
  );

  const ledgerRows = useMemo(
    () =>
      ledgerEntries.map((entry) => ({
        id: entry.id,
        group: entry.group.name,
        county: entry.group.county,
        type: humanizeEnum(entry.type),
        fundType: entry.fundAccount?.type ? humanizeEnum(entry.fundAccount.type) : "Unassigned",
        member: entry.member?.fullName ?? "Group-level",
        direction: entry.direction,
        amountCents: entry.amountCents,
        amount: formatKes(entry.amountCents),
        createdAt: entry.createdAt,
        time: dateTime(entry.createdAt),
        meeting: entry.meeting?.title ?? "No meeting",
        signature: entry.signature,
        source: sourceLabel(entry.group.sourceSystem)
      })),
    [ledgerEntries]
  );

  const creditRows = useMemo(
    () =>
      groups
        .map((group) => {
          const score = latestCreditScore(group);
          const band = creditBand(score);
          return {
            id: group.id,
            group: group.name,
            county: group.county,
            members: group._count.members,
            score,
            band,
            phase: humanizeEnum(group.phase),
            source: sourceLabel(group.sourceSystem),
            lenderSignal:
              band === "Finance ready"
                ? "Prioritise lender pipeline"
                : band === "Watchlist"
                  ? "Monitor repayment and savings depth"
                  : "Strengthen governance and transaction history"
          };
        })
        .sort((left, right) => right.score - left.score),
    [groups]
  );

  const countyRows = useMemo(() => {
    const countyMap = new Map<
      string,
      {
        groups: number;
        members: number;
        agents: Set<string>;
        scores: number[];
        phases: Record<string, number>;
        sources: Record<string, number>;
      }
    >();

    groups.forEach((group) => {
      const county = group.county || "Unassigned";
      const entry =
        countyMap.get(county) ??
        {
          groups: 0,
          members: 0,
          agents: new Set<string>(),
          scores: [],
          phases: {},
          sources: {}
        };

      entry.groups += 1;
      entry.members += group._count.members;
      if (group.villageAgent?.name) entry.agents.add(group.villageAgent.name);
      const score = latestCreditScore(group);
      if (score > 0) entry.scores.push(score);
      const phase = humanizeEnum(group.phase);
      const source = sourceLabel(group.sourceSystem);
      entry.phases[phase] = (entry.phases[phase] ?? 0) + 1;
      entry.sources[source] = (entry.sources[source] ?? 0) + 1;
      countyMap.set(county, entry);
    });

    return Array.from(countyMap.entries())
      .map(([county, entry]) => ({
        county,
        groups: entry.groups,
        members: entry.members,
        agents: entry.agents.size,
        averageCreditScore: average(entry.scores),
        dominantPhase: dominantLabel(entry.phases),
        primarySource: dominantLabel(entry.sources),
        coverageSignal:
          entry.groups >= 75
            ? "Portfolio anchor"
            : entry.groups >= 25
              ? "Growth corridor"
              : "Emerging county"
      }))
      .sort((left, right) => right.groups - left.groups);
  }, [groups]);

  const agentRows = useMemo(
    () =>
      agents
        .map((agent) => {
          const capacityUsed =
            agent.caseloadLimit > 0 ? Math.round((agent._count.groups / agent.caseloadLimit) * 100) : 0;
          return {
            id: agent.id,
            name: agent.name,
            county: agent.county ?? agent.programme?.county ?? "Unassigned",
            programme: agent.programme?.name ?? "Unassigned",
            groups: agent._count.groups,
            caseloadLimit: agent.caseloadLimit,
            capacityUsed,
            digitalLiteracyScore: agent.digitalLiteracyScore,
            projectOfficer: agent.projectOfficer ?? "Not assigned",
            status: humanizeEnum(agent.status),
            source: sourceLabel(agent.sourceSystem),
            capacitySignal: capacitySignal(capacityUsed)
          };
        })
        .sort((left, right) => right.groups - left.groups),
    [agents]
  );

  const meetingRows = useMemo(
    () =>
      meetings.map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        group: meeting.group.name,
        county: meeting.group.county,
        status: humanizeEnum(meeting.status),
        unlockStatus: humanizeEnum(meeting.unlockStatus),
        gpsCompliant: meeting.gpsCompliant ? "Yes" : "No",
        transactions: meeting.transactionTotal,
        attendance: meeting._count.attendance,
        ledgerEntries: meeting._count.ledgerEntries,
        votes: meeting._count.votes,
        scheduledAt: meeting.scheduledAt,
        scheduled: dateTime(meeting.scheduledAt),
        source: sourceLabel(meeting.group.sourceSystem)
      })),
    [meetings]
  );

  const governanceRows = useMemo(
    () =>
      groups
        .map((group) => {
          const score = Math.min(
            100,
            group._count.meetings * 20 +
              group._count.votes * 8 +
              (group._count.members >= 15 ? 10 : 0) +
              (latestCreditScore(group) > 0 ? 10 : 0)
          );
          const status =
            group._count.meetings === 0
              ? "Meeting data missing"
              : group._count.votes === 0
                ? "Voting not started"
                : score >= 80
                  ? "Strong controls"
                  : "Build history";
          return {
            id: group.id,
            group: group.name,
            county: group.county,
            meetings: group._count.meetings,
            votes: group._count.votes,
            members: group._count.members,
            score,
            status,
            source: sourceLabel(group.sourceSystem)
          };
        })
        .sort((left, right) => right.score - left.score),
    [groups]
  );

  const phaseRows = useMemo(() => {
    const phaseMap = new Map<string, { groups: number; members: number; scoreValues: number[] }>();
    groups.forEach((group) => {
      const phase = humanizeEnum(group.phase);
      const entry = phaseMap.get(phase) ?? { groups: 0, members: 0, scoreValues: [] };
      entry.groups += 1;
      entry.members += group._count.members;
      const score = latestCreditScore(group);
      if (score > 0) entry.scoreValues.push(score);
      phaseMap.set(phase, entry);
    });

    return Array.from(phaseMap.entries()).map(([phase, entry]) => ({
      phase,
      groups: entry.groups,
      members: entry.members,
      averageCreditScore: average(entry.scoreValues),
      share: groups.length > 0 ? Math.round((entry.groups / groups.length) * 100) : 0
    }));
  }, [groups]);

  const programmeRows = useMemo(
    () =>
      programmes
        .map((programme) => ({
          id: programme.id,
          programme: programme.name,
          partner: programme.partner.name,
          county: programme.county ?? programme.country,
          groups: programme._count.groups,
          agents: programme._count.villageAgents,
          source: sourceLabel(programme.sourceSystem),
          signal:
            programme._count.groups >= 100
              ? "Large portfolio"
              : programme._count.groups > 0
                ? "Active"
                : "Needs portfolio"
        }))
        .sort((left, right) => right.groups - left.groups),
    [programmes]
  );

  const partnerRows = useMemo(
    () =>
      partners
        .map((partner) => ({
          id: partner.id,
          partner: partner.name,
          type: humanizeEnum(partner.type),
          county: partner.county ?? "Programme scope",
          linkageType: partner.linkageType ?? humanizeEnum(partner.apiScope),
          contact:
            partner.contactName && partner.contactPhone
              ? `${partner.contactName} - ${partner.contactPhone}`
              : partner.contactName ?? partner.contactPhone ?? "Not captured",
          programmes: partner._count.programmes,
          webhooks: partner._count.webhookSubscriptions,
          users: partner._count.users,
          source: sourceLabel(partner.sourceSystem),
          valueProposition: partner.valueProposition ?? partner.capacity ?? "Not captured"
        }))
        .sort((left, right) => left.partner.localeCompare(right.partner)),
    [partners]
  );

  const integrationRows = useMemo(
    () =>
      (integrations?.statuses ?? []).map((status: IntegrationStatus) => ({
        id: status.provider,
        provider: status.displayName,
        mode: humanizeEnum(status.mode),
        status: status.configured ? "Configured" : "Needs credentials",
        configured: status.configured ? 1 : 0,
        missing: status.missingEnv.length,
        storedCredentials: status.storedCredentialKeys.length,
        networkTestsAllowed: status.networkTestsAllowed ? "Allowed" : "Disabled",
        nextAction: status.configured
          ? "Run sandbox status check"
          : `Add ${status.missingEnv.length} credential${status.missingEnv.length === 1 ? "" : "s"}`
      })),
    [integrations]
  );

  const userAccessRows = useMemo(
    () =>
      systemUsers.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: humanizeEnum(user.role),
        status: humanizeEnum(user.status),
        accountScope: user.partner?.name ?? user.group?.name ?? user.member?.fullName ?? "Platform",
        activeSessions: activeSessionCount(user),
        activeApiKeys: activeApiKeyCount(user),
        createdAt: user.createdAt,
        created: dateTime(user.createdAt),
        signal:
          user.status !== "ACTIVE"
            ? "Disabled"
            : activeSessionCount(user) > 0
              ? "Active session"
              : "No active session"
      })),
    [systemUsers]
  );

  const sourceRows = useMemo(() => {
    const sourceMap = new Map<
      string,
      {
        groups: number;
        members: number;
        agents: number;
        partners: number;
        counties: Set<string>;
        scores: number[];
      }
    >();

    function getEntry(source: string) {
      const entry =
        sourceMap.get(source) ??
        {
          groups: 0,
          members: 0,
          agents: 0,
          partners: 0,
          counties: new Set<string>(),
          scores: []
        };
      sourceMap.set(source, entry);
      return entry;
    }

    groups.forEach((group) => {
      const entry = getEntry(sourceLabel(group.sourceSystem));
      entry.groups += 1;
      entry.members += group._count.members;
      entry.counties.add(group.county || "Unassigned");
      const score = latestCreditScore(group);
      if (score > 0) entry.scores.push(score);
    });

    agents.forEach((agent) => {
      const entry = getEntry(sourceLabel(agent.sourceSystem));
      entry.agents += 1;
      if (agent.county) entry.counties.add(agent.county);
    });

    partners.forEach((partner) => {
      const entry = getEntry(sourceLabel(partner.sourceSystem));
      entry.partners += 1;
      if (partner.county) entry.counties.add(partner.county);
    });

    return Array.from(sourceMap.entries())
      .map(([source, entry]) => ({
        source,
        groups: entry.groups,
        members: entry.members,
        agents: entry.agents,
        partners: entry.partners,
        counties: entry.counties.size,
        averageCreditScore: average(entry.scores),
        signal: entry.groups > 100 ? "Portfolio-scale source" : "Foundation source"
      }))
      .sort((left, right) => right.groups - left.groups);
  }, [agents, groups, partners]);

  const auditVolumeRows = useMemo(() => {
    const eventMap = new Map<string, { count: number; entities: Set<string>; latest: string }>();
    auditEvents.forEach((event) => {
      const entry = eventMap.get(event.type) ?? {
        count: 0,
        entities: new Set<string>(),
        latest: event.createdAt
      };
      entry.count += 1;
      entry.entities.add(event.entityType);
      if (new Date(event.createdAt).getTime() > new Date(entry.latest).getTime()) {
        entry.latest = event.createdAt;
      }
      eventMap.set(event.type, entry);
    });

    return Array.from(eventMap.entries())
      .map(([type, entry]) => ({
        type: humanizeEnum(type),
        rawType: type,
        count: entry.count,
        entities: entry.entities.size,
        latestAt: entry.latest,
        latest: dateTime(entry.latest)
      }))
      .sort((left, right) => right.count - left.count);
  }, [auditEvents]);

  const actorActivityRows = useMemo(() => {
    const actorMap = new Map<string, { actor: string; role: string; events: number; latest: string }>();
    auditEvents.forEach((event) => {
      const actor = event.actor?.name ?? "System";
      const entry = actorMap.get(actor) ?? {
        actor,
        role: event.actor?.role ? humanizeEnum(event.actor.role) : "System",
        events: 0,
        latest: event.createdAt
      };
      entry.events += 1;
      if (new Date(event.createdAt).getTime() > new Date(entry.latest).getTime()) {
        entry.latest = event.createdAt;
      }
      actorMap.set(actor, entry);
    });

    return Array.from(actorMap.values())
      .map((entry) => ({ ...entry, latestTime: dateTime(entry.latest) }))
      .sort((left, right) => right.events - left.events);
  }, [auditEvents]);

  const entityTrailRows = useMemo(() => {
    const entityMap = new Map<string, { entity: string; events: number; latestType: string; latest: string }>();
    auditEvents.forEach((event) => {
      const entry = entityMap.get(event.entityType) ?? {
        entity: event.entityType,
        events: 0,
        latestType: event.type,
        latest: event.createdAt
      };
      entry.events += 1;
      if (new Date(event.createdAt).getTime() > new Date(entry.latest).getTime()) {
        entry.latest = event.createdAt;
        entry.latestType = event.type;
      }
      entityMap.set(event.entityType, entry);
    });

    return Array.from(entityMap.values())
      .map((entry) => ({
        ...entry,
        entity: humanizeEnum(entry.entity),
        latestType: humanizeEnum(entry.latestType),
        latestTime: dateTime(entry.latest)
      }))
      .sort((left, right) => right.events - left.events);
  }, [auditEvents]);

  const systemHealthRows = useMemo(
    () => {
      const rows = [
        {
          area: "Portfolio analytics",
          status: groups.length > 0 ? "Operational" : "No groups",
          records: groups.length,
          signal: `${formatNumber(portfolio?.members ?? 0)} members`,
          nextAction: "Use county and phase reports for this account scope"
        }
      ];

      if (reportVisibility?.users !== false) {
        rows.unshift({
          area: "Account access and RBAC",
          status: systemUsers.length > 0 ? "Operational" : "Needs users",
          records: systemUsers.length,
          signal: `${userAccessRows.filter((user) => user.activeSessions > 0).length} active sessions`,
          nextAction: "Review account users and inactive sessions"
        });
      }

      if (canReadIntegrations) {
        rows.splice(1, 0, {
          area: "Integration credentials",
          status: (integrations?.configured ?? 0) > 0 ? "Partially configured" : "Credential gated",
          records: integrations?.total ?? 0,
          signal: `${integrationRows.reduce((sum, row) => sum + row.missing, 0)} missing fields`,
          nextAction: "Complete sandbox credentials before status tests"
        });
      }

      if (reportVisibility?.ledgerEntries !== false || permissionSet.has("audit:read")) {
        rows.push({
          area: "Append-only records",
          status: ledgerEntries.length + auditEvents.length > 0 ? "Recording" : "No events",
          records: ledgerEntries.length + auditEvents.length,
          signal: `${ledgerEntries.length} ledger, ${auditEvents.length} audit`,
          nextAction: "Export ledger and audit reports for assurance"
        });
      }

      if (reportVisibility?.importedKpis !== false) {
        rows.push({
          area: "Imported workbook data",
          status: sourceRows.some((row) => row.source === "FtMA Performance") ? "Loaded" : "Not loaded",
          records: sourceRows.find((row) => row.source === "FtMA Performance")?.groups ?? 0,
          signal: `${ftmaCountyVslaKpis.length} county KPI rows`,
          nextAction: "Validate imported source totals after every import"
        });
      }

      return rows;
    },
    [
      auditEvents.length,
      canReadIntegrations,
      ftmaCountyVslaKpis.length,
      groups.length,
      integrationRows,
      integrations,
      ledgerEntries.length,
      permissionSet,
      portfolio,
      reportVisibility,
      sourceRows,
      systemUsers.length,
      userAccessRows
    ]
  );

  const reportCards = useMemo<ReportCard[]>(
    () => {
      const scopedAudience = accountScopeLabel;
      const allReportCards: ReportCard[] = [
        {
        id: "executive",
        category: "system",
        title: `${accountScopeLabel} Report Pack`,
        description: "Account-scoped pulse across finance, groups, controls, partners, and data quality.",
        audience: scopedAudience,
        cadence: "Weekly",
        metric: `${formatNumber(activeGroups.length)} active groups`,
        icon: <BarChart3 size={22} />
      },
      {
        id: "fund-balances",
        category: "financial",
        title: "Fund Balance Register",
        description: "Group-by-group balances across internal loan, social, external loan, grant, and VSLF accounts.",
        audience: scopedAudience,
        cadence: "Weekly",
        metric: `${formatNumber(fundBalanceRows.length)} accounts`,
        icon: <WalletCards size={22} />
      },
      {
        id: "fund-type-summary",
        category: "financial",
        title: "Fund Type Summary",
        description: "Portfolio totals and active coverage for each fund account type.",
        audience: scopedAudience,
        cadence: "Weekly",
        metric: `${formatKes(fundTypeRows.reduce((sum, row) => sum + row.totalCents, 0))}`,
        icon: <PieChart size={22} />
      },
      {
        id: "cash-concentration",
        category: "financial",
        title: "Cash Concentration Report",
        description: "Find the highest-value groups by combined savings, social, and loan balances.",
        audience: "Portfolio risk",
        cadence: "Weekly",
        metric: `${formatNumber(cashConcentrationRows.length)} groups`,
        icon: <TrendingUp size={22} />
      },
      {
        id: "external-loan-exposure",
        category: "financial",
        title: "External Loan Exposure",
        description: "Outstanding external loan balances by group, county, source, and field owner.",
        audience: "Lenders",
        cadence: "Fortnightly",
        metric: `${formatNumber(externalLoanRows.length)} exposed groups`,
        icon: <Landmark size={22} />
      },
      {
        id: "ledger-transactions",
        category: "financial",
        title: "Append-only Ledger Transactions",
        description: "Financial transaction records with fund type, member, meeting, direction, signature, and timestamp.",
        audience: "Finance assurance",
        cadence: "On demand",
        metric: `${formatNumber(ledgerRows.length)} entries`,
        icon: <FileCheck2 size={22} />
      },
      {
        id: "credit-readiness",
        category: "financial",
        title: "Credit Readiness Pipeline",
        description: "Rank groups for lender conversations using score bands and member depth.",
        audience: "Lenders",
        cadence: "Fortnightly",
        metric: `${formatNumber(financeReadyGroups.length)} finance ready`,
        icon: <TrendingUp size={22} />
      },
      {
        id: "system-health",
        category: "system",
        title: "System Health Summary",
        description: "Operational state across auth, integrations, analytics, append-only records, and imports.",
        audience: "Platform ops",
        cadence: "Daily",
        metric: `${formatNumber(systemHealthRows.length)} control areas`,
        icon: <DatabaseZap size={22} />
      },
      {
        id: "integrations",
        category: "system",
        title: "Integration Readiness Matrix",
        description: "Provider-by-provider credentials, missing fields, mode, and next sandbox action.",
        audience: "Platform ops",
        cadence: "Daily",
        metric: `${integrations?.configured ?? 0}/${integrations?.total ?? 0} configured`,
        icon: <LockKeyhole size={22} />
      },
      {
        id: "access-rbac",
        category: "system",
        title: "User Access and RBAC",
        description: "Role-scoped access report covering users, partners, sessions, and API keys.",
        audience: "Administrators",
        cadence: "Weekly",
        metric: `${formatNumber(userAccessRows.length)} users`,
        icon: <UserCog size={22} />
      },
      {
        id: "data-source",
        category: "system",
        title: "Data Source Reconciliation",
        description: "Separate workbook imports from native records for validation and audit-ready exports.",
        audience: "Data quality",
        cadence: "After imports",
        metric: `${formatNumber(sourceRows.find((row) => row.source === "FtMA Performance")?.groups ?? 0)} FtMA groups`,
        icon: <ClipboardList size={22} />
      },
      {
        id: "audit-trail",
        category: "audit",
        title: "Audit Integrity Trail",
        description: "Recent immutable audit records by event, entity, actor, hash, and time.",
        audience: "Auditors",
        cadence: "On demand",
        metric: `${formatNumber(auditEvents.length)} events`,
        icon: <ShieldCheck size={22} />
      },
      {
        id: "audit-volume",
        category: "audit",
        title: "Audit Event Volume",
        description: "Event-type distribution showing where system activity is concentrated.",
        audience: "Auditors",
        cadence: "Weekly",
        metric: `${formatNumber(auditVolumeRows.length)} event types`,
        icon: <BarChart3 size={22} />
      },
      {
        id: "actor-activity",
        category: "audit",
        title: "Actor Activity Report",
        description: "Who changed or checked what, with event counts and latest activity.",
        audience: "Auditors",
        cadence: "Weekly",
        metric: `${formatNumber(actorActivityRows.length)} actors`,
        icon: <UserCog size={22} />
      },
      {
        id: "entity-trail",
        category: "audit",
        title: "Entity Control Trail",
        description: "Audit coverage by entity type for users, groups, integrations, and system records.",
        audience: "Assurance",
        cadence: "Weekly",
        metric: `${formatNumber(entityTrailRows.length)} entities`,
        icon: <FileCheck2 size={22} />
      },
      {
        id: "county-coverage",
        category: "operations",
        title: "County Coverage Heatmap",
        description: "Anchor counties, growth corridors, member concentration, and source coverage.",
        audience: "Programme managers",
        cadence: "Monthly",
        metric: `${formatNumber(countyRows.length)} counties`,
        icon: <MapPinned size={22} />
      },
      {
        id: "agent-productivity",
        category: "operations",
        title: "VA / FSC Productivity",
        description: "Field caseload, capacity pressure, officer assignment, and digital readiness.",
        audience: "Field operations",
        cadence: "Weekly",
        metric: `${formatNumber(agents.length)} agents`,
        icon: <UsersRound size={22} />
      },
      {
        id: "meeting-monitor",
        category: "operations",
        title: "Meeting Monitor Report",
        description: "Meeting status, unlock controls, GPS compliance, attendance, ledger, and vote activity.",
        audience: "Field assurance",
        cadence: "Daily",
        metric: `${formatNumber(meetingRows.length)} meetings`,
        icon: <Activity size={22} />
      },
      {
        id: "phase-distribution",
        category: "operations",
        title: "Phase Distribution Report",
        description: "Group and member spread by mobilisation, development, maturity, and graduation phase.",
        audience: "Programme managers",
        cadence: "Monthly",
        metric: `${formatNumber(phaseRows.length)} phases`,
        icon: <PieChart size={22} />
      },
      {
        id: "programme-performance",
        category: "operations",
        title: "Programme Performance",
        description: "Programme-level coverage by partner, county, groups, and VA assignment.",
        audience: "Programme managers",
        cadence: "Monthly",
        metric: `${formatNumber(programmeRows.length)} programmes`,
        icon: <Building2 size={22} />
      },
      {
        id: "partner-linkage",
        category: "partners",
        title: "Partner Linkage Register",
        description: "Institution, market linkage, contact owner, scope, webhook, and source visibility.",
        audience: "Partnerships",
        cadence: "Monthly",
        metric: `${formatNumber(partnerRows.length)} partners`,
        icon: <Landmark size={22} />
      },
      {
        id: "partner-coverage",
        category: "partners",
        title: "Partner Programme Coverage",
        description: "How partner programmes cover groups and Village Agents.",
        audience: "Partnerships",
        cadence: "Monthly",
        metric: `${formatNumber(programmeRows.length)} programmes`,
        icon: <Building2 size={22} />
      },
      {
        id: "ftma-vsla-kpi",
        category: "data",
        title: "FtMA VSLA County KPI",
        description: "County financial KPI report for savings, social fund, external loans, and readiness rates.",
        audience: "MEL teams",
        cadence: "After imports",
        metric: `${formatNumber(ftmaCountyVslaKpis.length)} counties`,
        icon: <WalletCards size={22} />
      },
      {
        id: "ftma-training-kpi",
        category: "data",
        title: "FtMA Training and Linkage KPI",
        description: "BDS modules, NHIF sensitisation, market linkages, finance linkages, and value addition training.",
        audience: "MEL teams",
        cadence: "After imports",
        metric: `${formatNumber(ftmaTrainingMetrics.length)} counties`,
        icon: <ClipboardList size={22} />
      },
      {
        id: "ftma-fsc-kpi",
        category: "data",
        title: "FtMA FSC Performance KPI",
        description: "FSC business plan readiness, NHIF membership, market, input, finance, and training linkages.",
        audience: "MEL teams",
        cadence: "After imports",
        metric: `${formatNumber(ftmaFscKpis.length)} counties`,
        icon: <UsersRound size={22} />
      }
      ];

      return allReportCards.filter((report) =>
        canUseReport(report.id, permissionSet, reportVisibility)
      );
    },
    [
      accountScopeLabel,
      activeGroups.length,
      actorsLength(actorActivityRows),
      agents.length,
      auditEvents.length,
      auditVolumeRows.length,
      cashConcentrationRows.length,
      countyRows.length,
      entityTrailRows.length,
      externalLoanRows.length,
      financeReadyGroups.length,
      ftmaCountyVslaKpis.length,
      ftmaFscKpis.length,
      ftmaTrainingMetrics.length,
      fundBalanceRows.length,
      fundTypeRows,
      integrations,
      ledgerRows.length,
      meetingRows.length,
      partnerRows.length,
      phaseRows.length,
      permissionSet,
      programmeRows.length,
      reportVisibility,
      sourceRows,
      systemHealthRows.length,
      userAccessRows.length
    ]
  );

  const visibleReports = useMemo(
    () =>
      activeCategory === "all"
        ? reportCards
        : reportCards.filter((report) => report.category === activeCategory),
    [activeCategory, reportCards]
  );

  const selectedReport =
    reportCards.find((report) => report.id === activeReport) ?? reportCards[0];
  const selectedReportId = selectedReport?.id ?? "executive";

  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        categoryOrder.map((category) => [
          category,
          category === "all"
            ? reportCards.length
            : reportCards.filter((report) => report.category === category).length
        ])
      ) as Record<ReportCategory, number>,
    [reportCards]
  );
  const availableCategories = useMemo(
    () => categoryOrder.filter((category) => category === "all" || categoryCounts[category] > 0),
    [categoryCounts]
  );

  const totalFundCents = fundTypeRows.reduce((sum, row) => sum + row.totalCents, 0);
  const totalExternalLoanCents = externalLoanRows.reduce(
    (sum, row) => sum + row.outstandingCents,
    0
  );
  const totalAuditRecords = auditEvents.length + ledgerRows.length;

  const insights = useMemo<ReportInsight[]>(() => {
    const rows = getReportRowCount(selectedReportId);
    return [
      {
        label: "Account scope",
        value: accountScopeLabel,
        note: accountScopeNote
      },
      {
        label: "Records",
        value: formatNumber(rows),
        note: "available in this report table"
      },
      {
        label: "Basis",
        value: reportBasisLabel(selectedReportId),
        note: "calculated from permitted platform data"
      },
      {
        label: "Output",
        value: "Excel / PDF",
        note: `${selectedReport?.cadence ?? "On demand"} export with current filters`
      }
    ];

    function getReportRowCount(report: ReportId) {
      switch (report) {
        case "fund-balances":
          return fundBalanceRows.length;
        case "fund-type-summary":
          return fundTypeRows.length;
        case "cash-concentration":
          return cashConcentrationRows.length;
        case "external-loan-exposure":
          return externalLoanRows.length;
        case "ledger-transactions":
          return ledgerRows.length;
        case "credit-readiness":
          return creditRows.length;
        case "system-health":
          return systemHealthRows.length;
        case "integrations":
          return integrationRows.length;
        case "access-rbac":
          return userAccessRows.length;
        case "data-source":
          return sourceRows.length;
        case "audit-trail":
          return auditEvents.length;
        case "audit-volume":
          return auditVolumeRows.length;
        case "actor-activity":
          return actorActivityRows.length;
        case "entity-trail":
          return entityTrailRows.length;
        case "county-coverage":
          return countyRows.length;
        case "agent-productivity":
          return agentRows.length;
        case "meeting-monitor":
          return meetingRows.length;
        case "phase-distribution":
          return phaseRows.length;
        case "programme-performance":
        case "partner-coverage":
          return programmeRows.length;
        case "partner-linkage":
          return partnerRows.length;
        case "ftma-vsla-kpi":
          return ftmaCountyVslaKpis.length;
        case "ftma-training-kpi":
          return ftmaTrainingMetrics.length;
        case "ftma-fsc-kpi":
          return ftmaFscKpis.length;
        case "executive":
        default:
          return reportCards.length;
      }
    }
  }, [
    accountScopeLabel,
    accountScopeNote,
    agentRows.length,
    actorActivityRows.length,
    auditEvents.length,
    auditVolumeRows.length,
    cashConcentrationRows.length,
    countyRows.length,
    creditRows.length,
    entityTrailRows.length,
    externalLoanRows.length,
    ftmaCountyVslaKpis.length,
    ftmaFscKpis.length,
    ftmaTrainingMetrics.length,
    fundBalanceRows.length,
    fundTypeRows.length,
    integrationRows.length,
    ledgerRows.length,
    meetingRows.length,
    partnerRows.length,
    phaseRows.length,
    programmeRows.length,
    reportCards.length,
    selectedReport,
    selectedReportId,
    sourceRows.length,
    systemHealthRows.length,
    userAccessRows.length
  ]);

  const executiveRows = useMemo(() => {
    const hasReport = (ids: ReportId[]) => ids.some((id) => reportCards.some((report) => report.id === id));
    const rows = [
      {
        visible: hasReport(["fund-balances", "fund-type-summary", "cash-concentration"]),
        section: "Financial reports",
        metric: "Tracked funds",
        value: formatKes(totalFundCents),
        signal: `${formatNumber(fundBalanceRows.length)} fund accounts`,
        owner: "Finance desk",
        action: "Review fund balances, concentration, and ledger transactions"
      },
      {
        visible: hasReport(["external-loan-exposure"]),
        section: "Financial reports",
        metric: "External loan exposure",
        value: formatKes(totalExternalLoanCents),
        signal: `${formatNumber(externalLoanRows.length)} groups with exposure`,
        owner: "Lender desk",
        action: "Prioritise high exposure groups for repayment monitoring"
      },
      {
        visible: hasReport(["credit-readiness"]),
        section: "Financial reports",
        metric: "Credit signals",
        value: formatNumber(financeReadyGroups.length),
        signal: `${formatNumber(creditRows.length)} groups scored`,
        owner: "Lender desk",
        action: "Review readiness bands and group evidence"
      },
      {
        visible: hasReport(["system-health"]),
        section: "System reports",
        metric: "Control areas",
        value: formatNumber(systemHealthRows.length),
        signal: "Permission-scoped platform checks",
        owner: "Platform operations",
        action: "Review controls visible to this account"
      },
      {
        visible: hasReport(["integrations"]),
        section: "System reports",
        metric: "Integration readiness",
        value: `${integrations?.configured ?? 0}/${integrations?.total ?? 0}`,
        signal: `${formatNumber(integrationRows.reduce((sum, row) => sum + row.missing, 0))} missing credential fields`,
        owner: "Platform operations",
        action: "Complete sandbox credentials and run provider status checks"
      },
      {
        visible: hasReport(["audit-trail", "audit-volume", "actor-activity", "entity-trail"]),
        section: "Audit reports",
        metric: "Immutable evidence",
        value: formatNumber(totalAuditRecords),
        signal: `${formatNumber(auditEvents.length)} audit events${
          permissionSet.has("ledger:read") ? `, ${formatNumber(ledgerRows.length)} ledger entries` : ""
        }`,
        owner: "Assurance",
        action: "Export audit trail, actor activity, and entity control reports"
      },
      {
        visible: hasReport(["county-coverage", "agent-productivity", "meeting-monitor", "phase-distribution", "programme-performance"]),
        section: "Operations reports",
        metric: "Active groups",
        value: formatNumber(activeGroups.length),
        signal: `${formatNumber(portfolio?.members ?? 0)} members enrolled`,
        owner: "Programme managers",
        action: "Use county, phase, meeting, and VA reports for field planning"
      },
      {
        visible: hasReport(["partner-linkage", "partner-coverage"]),
        section: "Partner reports",
        metric: "Partner network",
        value: formatNumber(partnerRows.length),
        signal: `${formatNumber(programmeRows.length)} programmes`,
        owner: "Partnerships",
        action: "Review linkage register and programme coverage"
      },
      {
        visible: hasReport(["data-source", "ftma-vsla-kpi", "ftma-training-kpi", "ftma-fsc-kpi"]),
        section: "Data reports",
        metric: "Scoped data sources",
        value: `${formatNumber(sourceRows.find((row) => row.source === "FtMA Performance")?.groups ?? 0)} groups`,
        signal: `${formatNumber(ftmaCountyVslaKpis.length)} county KPI rows`,
        owner: "Data stewardship",
        action: "Validate imports and source reconciliation reports"
      }
    ];

    return rows
      .filter((row) => row.visible)
      .map(({ visible: _visible, ...row }) => row);
  }, [
    activeGroups.length,
    auditEvents.length,
    creditRows.length,
    externalLoanRows.length,
    financeReadyGroups.length,
    ftmaCountyVslaKpis.length,
    fundBalanceRows.length,
    integrationRows,
    integrations,
    ledgerRows.length,
    partnerRows.length,
    permissionSet,
    portfolio,
    programmeRows.length,
    reportCards,
    sourceRows,
    systemHealthRows.length,
    totalAuditRecords,
    totalExternalLoanCents,
    totalFundCents
  ]);

  function selectCategory(category: ReportCategory) {
    setActiveCategory(category);
    if (category === "all") return;
    const reportStillVisible = reportCards.some(
      (report) => report.id === activeReport && report.category === category
    );
    if (!reportStillVisible) {
      const firstReport = reportCards.find((report) => report.category === category);
      if (firstReport) setActiveReport(firstReport.id);
    }
  }

  function renderReportTable(reportId: ReportId) {
    switch (reportId) {
      case "fund-balances":
        return (
          <DataTable
            columns={[
              { key: "group", header: "Group", value: (row) => `${row.group} ${row.code}` },
              { key: "county", header: "County", value: (row) => row.county },
              { key: "fundType", header: "Fund", value: (row) => row.fundType },
              { key: "balance", header: "Balance", value: (row) => row.balanceCents, exportValue: (row) => row.balance, cell: (row) => row.balance },
              { key: "members", header: "Members", value: (row) => row.members },
              { key: "agent", header: "VA / FSC", value: (row) => row.agent },
              { key: "source", header: "Source", value: (row) => row.source },
              { key: "signal", header: "Signal", value: (row) => row.signal }
            ]}
            defaultSort={{ key: "balance", direction: "desc" }}
            exportName="intelli-cash-fund-balance-register"
            filters={[
              { key: "fund", label: "Fund", allLabel: "All funds", getValue: (row) => row.fundType },
              { key: "county", label: "County", allLabel: "All counties", getValue: (row) => row.county },
              { key: "source", label: "Source", allLabel: "All sources", getValue: (row) => row.source }
            ]}
            getRowKey={(row) => row.id}
            rows={fundBalanceRows}
            title="Fund balance register"
          />
        );
      case "fund-type-summary":
        return (
          <DataTable
            columns={[
              { key: "type", header: "Fund Type", value: (row) => row.type },
              { key: "accounts", header: "Accounts", value: (row) => row.accounts },
              { key: "groups", header: "Groups", value: (row) => row.groups },
              { key: "positive", header: "Positive Groups", value: (row) => row.positiveGroups },
              { key: "total", header: "Total", value: (row) => row.totalCents, exportValue: (row) => row.total, cell: (row) => row.total },
              { key: "average", header: "Average / Group", value: (row) => row.averageCents, exportValue: (row) => row.average, cell: (row) => row.average },
              { key: "county", header: "Strongest County", value: (row) => row.strongestCounty },
              { key: "signal", header: "Signal", value: (row) => row.signal }
            ]}
            defaultSort={{ key: "total", direction: "desc" }}
            exportName="intelli-cash-fund-type-summary"
            getRowKey={(row) => row.rawType}
            rows={fundTypeRows}
            title="Fund type summary"
          />
        );
      case "cash-concentration":
        return (
          <DataTable
            columns={[
              { key: "group", header: "Group", value: (row) => `${row.group} ${row.code}` },
              { key: "county", header: "County", value: (row) => row.county },
              { key: "phase", header: "Phase", value: (row) => row.phase },
              { key: "total", header: "Total", value: (row) => row.totalCents, exportValue: (row) => row.total, cell: (row) => row.total },
              { key: "internal", header: "Internal Loan", value: (row) => row.internalLoanCents, exportValue: (row) => row.internalLoan, cell: (row) => row.internalLoan },
              { key: "social", header: "Social", value: (row) => row.socialCents, exportValue: (row) => row.social, cell: (row) => row.social },
              { key: "external", header: "External Loan", value: (row) => row.externalLoanCents, exportValue: (row) => row.externalLoan, cell: (row) => row.externalLoan },
              { key: "source", header: "Source", value: (row) => row.source }
            ]}
            defaultSort={{ key: "total", direction: "desc" }}
            exportName="intelli-cash-cash-concentration-report"
            filters={[
              { key: "county", label: "County", allLabel: "All counties", getValue: (row) => row.county },
              { key: "source", label: "Source", allLabel: "All sources", getValue: (row) => row.source }
            ]}
            getRowKey={(row) => row.id}
            rows={cashConcentrationRows}
            title="Cash concentration report"
          />
        );
      case "external-loan-exposure":
        return (
          <DataTable
            columns={[
              { key: "group", header: "Group", value: (row) => `${row.group} ${row.code}` },
              { key: "county", header: "County", value: (row) => row.county },
              { key: "phase", header: "Phase", value: (row) => row.phase },
              { key: "outstanding", header: "Outstanding", value: (row) => row.outstandingCents, exportValue: (row) => row.outstanding, cell: (row) => row.outstanding },
              { key: "members", header: "Members", value: (row) => row.members },
              { key: "agent", header: "VA / FSC", value: (row) => row.agent },
              { key: "source", header: "Source", value: (row) => row.source },
              { key: "signal", header: "Exposure", value: (row) => row.exposureSignal }
            ]}
            defaultSort={{ key: "outstanding", direction: "desc" }}
            exportName="intelli-cash-external-loan-exposure-report"
            filters={[
              { key: "county", label: "County", allLabel: "All counties", getValue: (row) => row.county },
              { key: "signal", label: "Exposure", allLabel: "All exposure", getValue: (row) => row.exposureSignal },
              { key: "source", label: "Source", allLabel: "All sources", getValue: (row) => row.source }
            ]}
            getRowKey={(row) => row.id}
            rows={externalLoanRows}
            title="External loan exposure"
          />
        );
      case "ledger-transactions":
        return (
          <DataTable
            columns={[
              { key: "time", header: "Time", value: (row) => new Date(row.createdAt).getTime(), exportValue: (row) => row.time, cell: (row) => row.time },
              { key: "group", header: "Group", value: (row) => row.group },
              { key: "member", header: "Member", value: (row) => row.member },
              { key: "type", header: "Type", value: (row) => row.type },
              { key: "fund", header: "Fund", value: (row) => row.fundType },
              { key: "direction", header: "Direction", value: (row) => row.direction },
              { key: "amount", header: "Amount", value: (row) => row.amountCents, exportValue: (row) => row.amount, cell: (row) => row.amount },
              { key: "signature", header: "Signature", value: (row) => row.signature, className: "hash-cell" }
            ]}
            defaultSort={{ key: "time", direction: "desc" }}
            exportName="intelli-cash-ledger-transactions"
            filters={[
              { key: "fund", label: "Fund", allLabel: "All funds", getValue: (row) => row.fundType },
              { key: "direction", label: "Direction", allLabel: "All directions", getValue: (row) => row.direction }
            ]}
            getRowKey={(row) => row.id}
            rows={ledgerRows}
            title="Append-only ledger transactions"
          />
        );
      case "credit-readiness":
        return (
          <DataTable
            columns={[
              { key: "group", header: "Group", value: (row) => row.group },
              { key: "county", header: "County", value: (row) => row.county },
              { key: "members", header: "Members", value: (row) => row.members },
              { key: "score", header: "Score", value: (row) => row.score },
              {
                key: "band",
                header: "Band",
                value: (row) => row.band,
                cell: (row) => (
                  <span className={`pill ${row.band === "Finance ready" ? "" : row.band === "Watchlist" ? "gold" : "red"}`}>
                    {row.band}
                  </span>
                )
              },
              { key: "phase", header: "Phase", value: (row) => row.phase },
              { key: "signal", header: "Lender Signal", value: (row) => row.lenderSignal },
              { key: "source", header: "Source", value: (row) => row.source }
            ]}
            defaultSort={{ key: "score", direction: "desc" }}
            exportName="intelli-cash-credit-readiness-report"
            filters={[
              { key: "band", label: "Band", allLabel: "All bands", getValue: (row) => row.band },
              { key: "county", label: "County", allLabel: "All counties", getValue: (row) => row.county },
              { key: "source", label: "Source", allLabel: "All sources", getValue: (row) => row.source }
            ]}
            getRowKey={(row) => row.id}
            rows={creditRows}
            title="Credit readiness pipeline"
          />
        );
      case "system-health":
        return (
          <DataTable
            columns={[
              { key: "area", header: "Area", value: (row) => row.area },
              { key: "status", header: "Status", value: (row) => row.status },
              { key: "records", header: "Records", value: (row) => row.records },
              { key: "signal", header: "Signal", value: (row) => row.signal },
              { key: "next", header: "Next Action", value: (row) => row.nextAction }
            ]}
            exportName="intelli-cash-system-health-summary"
            filters={[{ key: "status", label: "Status", allLabel: "All statuses", getValue: (row) => row.status }]}
            getRowKey={(row) => row.area}
            rows={systemHealthRows}
            title="System health summary"
          />
        );
      case "integrations":
        return (
          <DataTable
            columns={[
              { key: "provider", header: "Provider", value: (row) => row.provider },
              { key: "mode", header: "Mode", value: (row) => row.mode },
              { key: "status", header: "Status", value: (row) => row.status },
              { key: "missing", header: "Missing Fields", value: (row) => row.missing },
              { key: "stored", header: "Stored Credentials", value: (row) => row.storedCredentials },
              { key: "network", header: "Network Tests", value: (row) => row.networkTestsAllowed },
              { key: "action", header: "Next Action", value: (row) => row.nextAction }
            ]}
            defaultSort={{ key: "missing", direction: "desc" }}
            exportName="intelli-cash-integration-readiness-report"
            filters={[
              { key: "status", label: "Status", allLabel: "All statuses", getValue: (row) => row.status },
              { key: "mode", label: "Mode", allLabel: "All modes", getValue: (row) => row.mode }
            ]}
            getRowKey={(row) => row.id}
            rows={integrationRows}
            title="Integration readiness matrix"
          />
        );
      case "access-rbac":
        return (
          <DataTable
            columns={[
              { key: "name", header: "User", value: (row) => `${row.name} ${row.email}` },
              { key: "role", header: "Role", value: (row) => row.role },
              { key: "status", header: "Status", value: (row) => row.status },
              { key: "scope", header: "Scope", value: (row) => row.accountScope },
              { key: "sessions", header: "Sessions", value: (row) => row.activeSessions },
              { key: "keys", header: "API Keys", value: (row) => row.activeApiKeys },
              { key: "signal", header: "Signal", value: (row) => row.signal },
              { key: "created", header: "Created", value: (row) => new Date(row.createdAt).getTime(), exportValue: (row) => row.created, cell: (row) => row.created }
            ]}
            defaultSort={{ key: "created", direction: "desc" }}
            exportName="intelli-cash-user-access-rbac-report"
            filters={[
              { key: "role", label: "Role", allLabel: "All roles", getValue: (row) => row.role },
              { key: "status", label: "Status", allLabel: "All statuses", getValue: (row) => row.status }
            ]}
            getRowKey={(row) => row.id}
            rows={userAccessRows}
            title="User access and RBAC"
          />
        );
      case "data-source":
        return (
          <DataTable
            columns={[
              { key: "source", header: "Source", value: (row) => row.source },
              { key: "groups", header: "Groups", value: (row) => row.groups },
              { key: "members", header: "Members", value: (row) => row.members },
              { key: "agents", header: "Agents", value: (row) => row.agents },
              { key: "partners", header: "Partners", value: (row) => row.partners },
              { key: "counties", header: "Counties", value: (row) => row.counties },
              { key: "score", header: "Avg. Score", value: (row) => row.averageCreditScore },
              { key: "signal", header: "Signal", value: (row) => row.signal }
            ]}
            defaultSort={{ key: "groups", direction: "desc" }}
            exportName="intelli-cash-data-source-reconciliation-report"
            getRowKey={(row) => row.source}
            rows={sourceRows}
            title="Data source reconciliation"
          />
        );
      case "audit-trail":
        return (
          <DataTable
            columns={[
              { key: "event", header: "Event", value: (row) => humanizeEnum(row.type) },
              { key: "entity", header: "Entity", value: (row) => row.entityType },
              { key: "actor", header: "Actor", value: (row) => row.actor?.name ?? "System" },
              { key: "time", header: "Time", value: (row) => new Date(row.createdAt).getTime(), exportValue: (row) => dateTime(row.createdAt), cell: (row) => dateTime(row.createdAt) },
              { key: "hash", header: "Hash", value: (row) => row.hash, className: "hash-cell" }
            ]}
            defaultSort={{ key: "time", direction: "desc" }}
            exportName="intelli-cash-audit-integrity-trail"
            filters={[
              { key: "entity", label: "Entity", allLabel: "All entities", getValue: (row) => row.entityType },
              { key: "event", label: "Event", allLabel: "All events", getValue: (row) => row.type }
            ]}
            getRowKey={(row) => row.id}
            rows={auditEvents}
            title="Audit integrity trail"
          />
        );
      case "audit-volume":
        return (
          <DataTable
            columns={[
              { key: "type", header: "Event Type", value: (row) => row.type },
              { key: "count", header: "Events", value: (row) => row.count },
              { key: "entities", header: "Entity Types", value: (row) => row.entities },
              { key: "latest", header: "Latest", value: (row) => new Date(row.latestAt).getTime(), exportValue: (row) => row.latest, cell: (row) => row.latest }
            ]}
            defaultSort={{ key: "count", direction: "desc" }}
            exportName="intelli-cash-audit-event-volume"
            getRowKey={(row) => row.rawType}
            rows={auditVolumeRows}
            title="Audit event volume"
          />
        );
      case "actor-activity":
        return (
          <DataTable
            columns={[
              { key: "actor", header: "Actor", value: (row) => row.actor },
              { key: "role", header: "Role", value: (row) => row.role },
              { key: "events", header: "Events", value: (row) => row.events },
              { key: "latest", header: "Latest", value: (row) => new Date(row.latest).getTime(), exportValue: (row) => row.latestTime, cell: (row) => row.latestTime }
            ]}
            defaultSort={{ key: "events", direction: "desc" }}
            exportName="intelli-cash-actor-activity-report"
            getRowKey={(row) => row.actor}
            rows={actorActivityRows}
            title="Actor activity report"
          />
        );
      case "entity-trail":
        return (
          <DataTable
            columns={[
              { key: "entity", header: "Entity", value: (row) => row.entity },
              { key: "events", header: "Events", value: (row) => row.events },
              { key: "latestType", header: "Latest Event", value: (row) => row.latestType },
              { key: "latest", header: "Latest Time", value: (row) => new Date(row.latest).getTime(), exportValue: (row) => row.latestTime, cell: (row) => row.latestTime }
            ]}
            defaultSort={{ key: "events", direction: "desc" }}
            exportName="intelli-cash-entity-control-trail"
            getRowKey={(row) => row.entity}
            rows={entityTrailRows}
            title="Entity control trail"
          />
        );
      case "county-coverage":
        return (
          <DataTable
            columns={[
              { key: "county", header: "County", value: (row) => row.county },
              { key: "groups", header: "Groups", value: (row) => row.groups },
              { key: "members", header: "Members", value: (row) => row.members },
              { key: "agents", header: "Agents", value: (row) => row.agents },
              { key: "score", header: "Avg. Score", value: (row) => row.averageCreditScore },
              { key: "phase", header: "Dominant Phase", value: (row) => row.dominantPhase },
              { key: "source", header: "Primary Source", value: (row) => row.primarySource },
              { key: "signal", header: "Signal", value: (row) => row.coverageSignal }
            ]}
            defaultSort={{ key: "groups", direction: "desc" }}
            exportName="intelli-cash-county-coverage-report"
            filters={[
              { key: "phase", label: "Phase", allLabel: "All phases", getValue: (row) => row.dominantPhase },
              { key: "signal", label: "Signal", allLabel: "All signals", getValue: (row) => row.coverageSignal }
            ]}
            getRowKey={(row) => row.county}
            rows={countyRows}
            title="County coverage heatmap"
          />
        );
      case "agent-productivity":
        return (
          <DataTable
            columns={[
              { key: "agent", header: "Agent", value: (row) => row.name },
              { key: "county", header: "County", value: (row) => row.county },
              { key: "programme", header: "Programme", value: (row) => row.programme },
              { key: "officer", header: "Project Officer", value: (row) => row.projectOfficer },
              { key: "groups", header: "Groups", value: (row) => row.groups },
              { key: "capacity", header: "Capacity", value: (row) => row.capacityUsed, exportValue: (row) => `${row.capacityUsed}% of ${row.caseloadLimit}`, cell: (row) => `${row.capacityUsed}%` },
              { key: "literacy", header: "Literacy", value: (row) => row.digitalLiteracyScore },
              { key: "signal", header: "Signal", value: (row) => row.capacitySignal },
              { key: "source", header: "Source", value: (row) => row.source }
            ]}
            defaultSort={{ key: "groups", direction: "desc" }}
            exportName="intelli-cash-va-fsc-productivity-report"
            filters={[
              { key: "county", label: "County", allLabel: "All counties", getValue: (row) => row.county },
              { key: "signal", label: "Capacity", allLabel: "All capacity", getValue: (row) => row.capacitySignal },
              { key: "source", label: "Source", allLabel: "All sources", getValue: (row) => row.source }
            ]}
            getRowKey={(row) => row.id}
            rows={agentRows}
            title="VA / FSC productivity"
          />
        );
      case "meeting-monitor":
        return (
          <DataTable
            columns={[
              { key: "scheduled", header: "Scheduled", value: (row) => new Date(row.scheduledAt).getTime(), exportValue: (row) => row.scheduled, cell: (row) => row.scheduled },
              { key: "meeting", header: "Meeting", value: (row) => `${row.title} ${row.group}` },
              { key: "county", header: "County", value: (row) => row.county },
              { key: "status", header: "Status", value: (row) => row.status },
              { key: "unlock", header: "Unlock", value: (row) => row.unlockStatus },
              { key: "gps", header: "GPS", value: (row) => row.gpsCompliant },
              { key: "attendance", header: "Attendance", value: (row) => row.attendance },
              { key: "votes", header: "Votes", value: (row) => row.votes },
              { key: "source", header: "Source", value: (row) => row.source }
            ]}
            defaultSort={{ key: "scheduled", direction: "desc" }}
            exportName="intelli-cash-meeting-monitor-report"
            filters={[
              { key: "status", label: "Status", allLabel: "All statuses", getValue: (row) => row.status },
              { key: "gps", label: "GPS", allLabel: "All GPS", getValue: (row) => row.gpsCompliant }
            ]}
            getRowKey={(row) => row.id}
            rows={meetingRows}
            title="Meeting monitor report"
          />
        );
      case "phase-distribution":
        return (
          <DataTable
            columns={[
              { key: "phase", header: "Phase", value: (row) => row.phase },
              { key: "groups", header: "Groups", value: (row) => row.groups },
              { key: "members", header: "Members", value: (row) => row.members },
              { key: "score", header: "Avg. Score", value: (row) => row.averageCreditScore },
              { key: "share", header: "Portfolio Share", value: (row) => row.share, exportValue: (row) => `${row.share}%`, cell: (row) => `${row.share}%` }
            ]}
            defaultSort={{ key: "groups", direction: "desc" }}
            exportName="intelli-cash-phase-distribution-report"
            getRowKey={(row) => row.phase}
            rows={phaseRows}
            title="Phase distribution report"
          />
        );
      case "programme-performance":
      case "partner-coverage":
        return (
          <DataTable
            columns={[
              { key: "programme", header: "Programme", value: (row) => row.programme },
              { key: "partner", header: "Partner", value: (row) => row.partner },
              { key: "county", header: "County", value: (row) => row.county },
              { key: "groups", header: "Groups", value: (row) => row.groups },
              { key: "agents", header: "VAs / FSCs", value: (row) => row.agents },
              { key: "source", header: "Source", value: (row) => row.source },
              { key: "signal", header: "Signal", value: (row) => row.signal }
            ]}
            defaultSort={{ key: "groups", direction: "desc" }}
            exportName="intelli-cash-programme-performance-report"
            filters={[
              { key: "partner", label: "Partner", allLabel: "All partners", getValue: (row) => row.partner },
              { key: "signal", label: "Signal", allLabel: "All signals", getValue: (row) => row.signal }
            ]}
            getRowKey={(row) => row.id}
            rows={programmeRows}
            title={reportId === "partner-coverage" ? "Partner programme coverage" : "Programme performance"}
          />
        );
      case "partner-linkage":
        return (
          <DataTable
            columns={[
              { key: "partner", header: "Partner", value: (row) => row.partner },
              { key: "type", header: "Type", value: (row) => row.type },
              { key: "county", header: "County", value: (row) => row.county },
              { key: "linkage", header: "Linkage", value: (row) => row.linkageType },
              { key: "contact", header: "Contact", value: (row) => row.contact },
              { key: "programmes", header: "Programmes", value: (row) => row.programmes },
              { key: "webhooks", header: "Webhooks", value: (row) => row.webhooks },
              { key: "source", header: "Source", value: (row) => row.source },
              { key: "value", header: "Value", value: (row) => row.valueProposition }
            ]}
            defaultSort={{ key: "partner", direction: "asc" }}
            exportName="intelli-cash-partner-linkage-report"
            filters={[
              { key: "type", label: "Type", allLabel: "All types", getValue: (row) => row.type },
              { key: "linkage", label: "Linkage", allLabel: "All linkages", getValue: (row) => row.linkageType },
              { key: "source", label: "Source", allLabel: "All sources", getValue: (row) => row.source }
            ]}
            getRowKey={(row) => row.id}
            rows={partnerRows}
            title="Partner linkage register"
          />
        );
      case "ftma-vsla-kpi":
        return (
          <DataTable
            columns={[
              { key: "county", header: "County", value: (row) => row.county },
              { key: "groups", header: "VSLA Groups", value: (row) => row.vslaGroupCount },
              { key: "members", header: "Members", value: (row) => row.membershipCount },
              { key: "savings", header: "Savings", value: (row) => row.savingsCents, exportValue: (row) => formatKes(row.savingsCents), cell: (row) => formatKes(row.savingsCents) },
              { key: "social", header: "Social Fund", value: (row) => row.socialFundCents, exportValue: (row) => formatKes(row.socialFundCents), cell: (row) => formatKes(row.socialFundCents) },
              { key: "loans", header: "Outstanding Loans", value: (row) => row.outstandingLoanCents, exportValue: (row) => formatKes(row.outstandingLoanCents), cell: (row) => formatKes(row.outstandingLoanCents) },
              { key: "nhif", header: "NHIF", value: (row) => row.nhifUptakeRate ?? 0, exportValue: (row) => formatPercent(row.nhifUptakeRate), cell: (row) => formatPercent(row.nhifUptakeRate) },
              { key: "marketing", header: "Marketing Plan", value: (row) => row.actionableMarketingPlanRate ?? 0, exportValue: (row) => formatPercent(row.actionableMarketingPlanRate), cell: (row) => formatPercent(row.actionableMarketingPlanRate) }
            ]}
            defaultSort={{ key: "savings", direction: "desc" }}
            exportName="intelli-cash-ftma-vsla-county-kpi"
            getRowKey={(row) => row.id}
            rows={ftmaCountyVslaKpis}
            title="FtMA VSLA county KPI"
          />
        );
      case "ftma-training-kpi":
        return (
          <DataTable
            columns={[
              { key: "county", header: "County", value: (row) => row.county },
              { key: "assessed", header: "Assessed VSLAs", value: (row) => row.assessedVslaCount },
              { key: "new", header: "New Groups", value: (row) => row.newGroupsCount },
              { key: "bds", header: "BDS Modules", value: (row) => row.bdsModulesCount },
              { key: "nhif", header: "NHIF Sensitized", value: (row) => row.nhifSensitizedCount },
              { key: "market", header: "Market Linked", value: (row) => row.linkedToMarketCount },
              { key: "finance", header: "Finance Linked", value: (row) => row.linkedToFinanceCount },
              { key: "value", header: "Value Addition", value: (row) => row.valueAdditionTrainingCount }
            ]}
            defaultSort={{ key: "assessed", direction: "desc" }}
            exportName="intelli-cash-ftma-training-linkage-kpi"
            getRowKey={(row) => row.id}
            rows={ftmaTrainingMetrics}
            title="FtMA training and linkage KPI"
          />
        );
      case "ftma-fsc-kpi":
        return (
          <DataTable
            columns={[
              { key: "county", header: "County", value: (row) => row.county },
              { key: "bds", header: "BDS Modules", value: (row) => row.fscBdsModulesCount },
              { key: "business", header: "Business Plan", value: (row) => row.actionableBusinessPlanRate ?? 0, exportValue: (row) => formatPercent(row.actionableBusinessPlanRate), cell: (row) => formatPercent(row.actionableBusinessPlanRate) },
              { key: "nhif", header: "NHIF", value: (row) => row.nhifMembershipRate ?? 0, exportValue: (row) => formatPercent(row.nhifMembershipRate), cell: (row) => formatPercent(row.nhifMembershipRate) },
              { key: "finance", header: "Finance Linkages", value: (row) => row.financialInstitutionLinkages },
              { key: "market", header: "Market Linkages", value: (row) => row.marketLinkages },
              { key: "input", header: "Input Linkages", value: (row) => row.inputDistributorLinkages },
              { key: "other", header: "Other Trainings", value: (row) => row.otherTrainings }
            ]}
            defaultSort={{ key: "bds", direction: "desc" }}
            exportName="intelli-cash-ftma-fsc-performance-kpi"
            getRowKey={(row) => row.id}
            rows={ftmaFscKpis}
            title="FtMA FSC performance KPI"
          />
        );
      case "executive":
      default:
        return (
          <DataTable
            columns={[
              { key: "section", header: "Report Family", value: (row) => row.section },
              { key: "metric", header: "Metric", value: (row) => row.metric },
              { key: "value", header: "Value", value: (row) => row.value },
              { key: "signal", header: "Signal", value: (row) => row.signal },
              { key: "owner", header: "Owner", value: (row) => row.owner },
              { key: "action", header: "Recommended Action", value: (row) => row.action }
            ]}
            exportName="intelli-cash-executive-report-pack"
            filters={[
              { key: "family", label: "Family", allLabel: "All families", getValue: (row) => row.section },
              { key: "owner", label: "Owner", allLabel: "All owners", getValue: (row) => row.owner }
            ]}
            getRowKey={(row) => `${row.section}-${row.metric}`}
            rows={executiveRows}
            title="Executive portfolio pack"
          />
        );
    }
  }

  if (loading) return <div className="loading-panel">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Reporting Center</p>
          <h2
            aria-label="Reports"
            className="has-hint"
            data-hint="Choose a report family, open a focused report, then filter, sort, paginate, and export account-scoped evidence."
            tabIndex={0}
          >
            Reports
          </h2>
        </div>
        <div className="page-heading-actions">
          <span className="pill blue">Scope: {accountScopeLabel}</span>
          <span className="pill">Updated {reportUpdatedAt()}</span>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard
          icon={<WalletCards size={20} />}
          label="Financial"
          note={
            categoryCounts.financial === 0
              ? "No financial access"
              : reportVisibility?.fundAccounts === false
                ? "Credit and group signals"
                : formatKes(totalFundCents)
          }
          value={formatNumber(categoryCounts.financial)}
        />
        <StatCard
          icon={<DatabaseZap size={20} />}
          label="System"
          note={`${integrations?.configured ?? 0}/${integrations?.total ?? 0} integrations configured`}
          value={formatNumber(categoryCounts.system)}
        />
        <StatCard
          icon={<ShieldCheck size={20} />}
          label="Audit"
          note={categoryCounts.audit > 0 ? `${formatNumber(totalAuditRecords)} evidence records` : "No audit access"}
          value={formatNumber(categoryCounts.audit)}
        />
        <StatCard
          icon={<ClipboardList size={20} />}
          label="Other"
          note="Operations, partners, and data quality"
          value={formatNumber(
            categoryCounts.operations + categoryCounts.partners + categoryCounts.data
          )}
        />
      </section>

      <section className="dashboard-filter-row" aria-label="Report filters">
        <label className="table-filter compact-filter report-type-filter" title="Report type">
          <SlidersHorizontal aria-hidden="true" size={15} />
          <span className="sr-only">Report type</span>
          <select
            aria-label="Report type"
            onChange={(event) => selectCategory(event.target.value as ReportCategory)}
            value={activeCategory}
          >
            {availableCategories.map((category) => (
              <option key={category} value={category}>
                {categoryLabel(category)} ({categoryCounts[category]})
              </option>
            ))}
          </select>
        </label>
        <span className="pill blue">{formatNumber(visibleReports.length)} reports</span>
      </section>

      <section className="system-workspace report-layout" aria-label="Report workspace">
        <aside className="system-list-panel report-list-panel" aria-label="Report catalog">
          <section className="report-catalog">
            {visibleReports.map((report) => (
              <button
                aria-label={report.title}
                className={`report-tile ${activeReport === report.id ? "active" : ""}`}
                data-hint={report.description}
                key={report.id}
                onClick={() => setActiveReport(report.id)}
                type="button"
              >
                <span className="report-tile-icon">{report.icon}</span>
                <span>
                  <strong>{report.title}</strong>
                </span>
                <span className="report-tile-footer">
                  <small>{categoryLabel(report.category)}</small>
                  <small>{report.audience}</small>
                  <small>{report.cadence}</small>
                  <small>{report.metric}</small>
                </span>
              </button>
            ))}
          </section>
        </aside>

        <section className="data-card report-workspace">
          <header>
            <div>
              <h3
                aria-label={selectedReport?.title}
                className="has-inline-hint"
                data-hint={selectedReport?.description ?? ""}
                tabIndex={0}
              >
                {selectedReport?.title}
              </h3>
            </div>
            <span className="pill blue">{categoryLabel(selectedReport?.category ?? "system")}</span>
          </header>
          <div className="report-insight-grid">
            {insights.map((insight) => (
              <div
                aria-label={`${insight.label}: ${insight.value}`}
                className="report-insight"
                data-hint={insight.note}
                key={insight.label}
                tabIndex={0}
              >
                <span>{insight.label}</span>
                <strong>{insight.value}</strong>
              </div>
            ))}
          </div>
          {selectedReport ? renderReportTable(selectedReport.id) : <div className="empty-state">No reports</div>}
        </section>
      </section>
    </>
  );
}

function actorsLength<T>(rows: T[]) {
  return rows.length;
}
