import type { ReactNode } from "react";
import { humanizeEnum } from "../../lib/api";
import type { GroupRow } from "../../types/dashboard";

export type ReportCategory =
  | "all"
  | "financial"
  | "system"
  | "audit"
  | "operations"
  | "partners"
  | "data";

export type ReportId =
  | "executive"
  | "fund-balances"
  | "fund-type-summary"
  | "cash-concentration"
  | "external-loan-exposure"
  | "ledger-transactions"
  | "credit-readiness"
  | "system-health"
  | "integrations"
  | "access-rbac"
  | "data-source"
  | "audit-trail"
  | "audit-volume"
  | "actor-activity"
  | "entity-trail"
  | "county-coverage"
  | "agent-productivity"
  | "meeting-monitor"
  | "phase-distribution"
  | "programme-performance"
  | "partner-linkage"
  | "partner-coverage"
  | "ftma-vsla-kpi"
  | "ftma-training-kpi"
  | "ftma-fsc-kpi";

export interface ReportCard {
  id: ReportId;
  category: Exclude<ReportCategory, "all">;
  title: string;
  description: string;
  audience: string;
  cadence: string;
  metric: string;
  icon: ReactNode;
}

export interface ReportInsight {
  label: string;
  value: string;
  note: string;
}

export interface ReportFoundation {
  account: ReportAccountScope;
  visibility?: ReportVisibility;
  fundAccounts: FundAccountSource[];
  ledgerEntries: LedgerEntrySource[];
  users: UserAccessSource[];
  meetings: MeetingSource[];
  votes: VoteSource[];
  ftmaCountyVslaKpis: FtmaCountyVslaKpiSource[];
  ftmaCountyVslaTrainingMetrics: FtmaCountyVslaTrainingSource[];
  ftmaCountyFscKpis: FtmaCountyFscKpiSource[];
}

export interface ReportVisibility {
  fundAccounts: boolean;
  ledgerEntries: boolean;
  users: boolean;
  meetings: boolean;
  votes: boolean;
  importedKpis: boolean;
}

export interface ReportAccountScope {
  userId: string | null;
  name: string;
  email: string | null;
  role: string | null;
  scopeType: string;
  scopeId: string | null;
  scopeName: string;
  permissions: string[];
}

export interface SourceGroup {
  id: string;
  name: string;
  code: string;
  county: string;
  phase?: string;
  sourceSystem?: string | null;
  programme?: { name: string } | null;
  villageAgent?: { name: string } | null;
  _count?: { members: number; meetings: number; votes: number };
}

export interface FundAccountSource {
  id: string;
  type: string;
  balanceCents: number;
  currency: string;
  group: SourceGroup;
}

export interface LedgerEntrySource {
  id: string;
  type: string;
  amountCents: number;
  currency: string;
  direction: string;
  description: string;
  signature: string;
  createdAt: string;
  group: SourceGroup;
  member?: { fullName: string } | null;
  fundAccount?: { type: string; currency: string } | null;
  meeting?: { title: string; status: string } | null;
}

export interface UserAccessSource {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  partner?: { name: string } | null;
  group?: { id: string; name: string; code: string } | null;
  member?: { id: string; fullName: string } | null;
  sessions: Array<{ expiresAt: string; lastUsedAt?: string | null }>;
  apiKeys: Array<{ revokedAt?: string | null; lastUsedAt?: string | null }>;
}

export interface MeetingSource {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
  openedAt?: string | null;
  closedAt?: string | null;
  unlockStatus: string;
  gpsCompliant: boolean;
  transactionTotal: number;
  group: SourceGroup;
  _count: { attendance: number; ledgerEntries: number; votes: number };
}

export interface VoteSource {
  id: string;
  resolutionType: string;
  result: string;
  yesCount: number;
  noCount: number;
  abstainCount: number;
  totalEligible: number;
  createdAt: string;
  group: SourceGroup;
}

export interface FtmaCountyVslaKpiSource {
  id: string;
  county: string;
  metricDate?: string | null;
  vslaGroupCount: number;
  membershipCount: number;
  nhifUptakeRate?: number | null;
  externalLoanUptakeRate?: number | null;
  actionableMarketingPlanRate?: number | null;
  savingsCents: number;
  outstandingLoanCents: number;
  socialFundCents: number;
}

export interface FtmaCountyVslaTrainingSource {
  id: string;
  county: string;
  assessedVslaCount: number;
  newGroupsCount: number;
  bdsModulesCount: number;
  nhifSensitizedCount: number;
  linkedToMarketCount: number;
  linkedToFinanceCount: number;
  marketLinkageCount: number;
  inputDistributorLinkageCount: number;
  valueAdditionTrainingCount: number;
}

export interface FtmaCountyFscKpiSource {
  id: string;
  county: string;
  fscBdsModulesCount: number;
  actionableBusinessPlanRate?: number | null;
  nhifMembershipRate?: number | null;
  financialInstitutionLinkages: number;
  marketLinkages: number;
  inputDistributorLinkages: number;
  otherTrainings: number;
}

const numberFormatter = new Intl.NumberFormat("en-KE");

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatPercent(value: number | null | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`;
}

export function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function latestCreditScore(group: GroupRow) {
  return group.creditScores[0]?.score ?? 0;
}

export function sourceLabel(sourceSystem?: string | null) {
  if (!sourceSystem) return "Native";
  if (sourceSystem === "FTMA_PERFORMANCE") return "FtMA Performance";
  return humanizeEnum(sourceSystem);
}

export function dominantLabel(counts: Record<string, number>) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "Not enough data";
  return entries.sort((left, right) => right[1] - left[1])[0]?.[0] ?? "Not enough data";
}

export function creditBand(score: number) {
  if (score >= 80) return "Finance ready";
  if (score >= 65) return "Watchlist";
  if (score > 0) return "Strengthen first";
  return "Pending";
}

export function capacitySignal(used: number) {
  if (used >= 100) return "Over capacity";
  if (used >= 80) return "Near limit";
  if (used >= 50) return "Balanced";
  return "Available capacity";
}

export function moneySignal(cents: number) {
  if (cents >= 100_000_000) return "High value";
  if (cents >= 20_000_000) return "Established";
  if (cents > 0) return "Active";
  return "No balance";
}

export function reportUpdatedAt() {
  return new Date().toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function dateTime(value: string) {
  return new Date(value).toLocaleString("en-KE");
}

export function activeSessionCount(user: UserAccessSource) {
  const now = Date.now();
  return user.sessions.filter((session) => new Date(session.expiresAt).getTime() > now).length;
}

export function activeApiKeyCount(user: UserAccessSource) {
  return user.apiKeys.filter((key) => !key.revokedAt).length;
}

export function categoryLabel(category: ReportCategory) {
  if (category === "all") return "All";
  return `${category.slice(0, 1).toUpperCase()}${category.slice(1)}`;
}

export const categoryOrder: ReportCategory[] = [
  "all",
  "financial",
  "system",
  "audit",
  "operations",
  "partners",
  "data"
];

export const reportPermissionRequirements: Record<ReportId, string[]> = {
  executive: ["analytics:read"],
  "fund-balances": ["analytics:read", "ledger:read"],
  "fund-type-summary": ["analytics:read", "ledger:read"],
  "cash-concentration": ["analytics:read", "ledger:read"],
  "external-loan-exposure": ["analytics:read", "ledger:read"],
  "ledger-transactions": ["analytics:read", "ledger:read"],
  "credit-readiness": ["analytics:read", "groups:read"],
  "system-health": ["analytics:read"],
  integrations: ["analytics:read", "integrations:read"],
  "access-rbac": ["analytics:read", "users:read"],
  "data-source": ["analytics:read"],
  "audit-trail": ["analytics:read", "audit:read"],
  "audit-volume": ["analytics:read", "audit:read"],
  "actor-activity": ["analytics:read", "audit:read"],
  "entity-trail": ["analytics:read", "audit:read"],
  "county-coverage": ["analytics:read", "groups:read"],
  "agent-productivity": ["analytics:read", "village-agents:read"],
  "meeting-monitor": ["analytics:read", "meetings:read"],
  "phase-distribution": ["analytics:read", "groups:read"],
  "programme-performance": ["analytics:read", "programmes:read"],
  "partner-linkage": ["analytics:read", "partners:read"],
  "partner-coverage": ["analytics:read", "partners:read", "programmes:read"],
  "ftma-vsla-kpi": ["analytics:read", "programmes:read"],
  "ftma-training-kpi": ["analytics:read", "programmes:read"],
  "ftma-fsc-kpi": ["analytics:read", "programmes:read"]
};

export const reportVisibilityRequirements: Partial<Record<ReportId, Array<keyof ReportVisibility>>> = {
  "fund-balances": ["fundAccounts"],
  "fund-type-summary": ["fundAccounts"],
  "cash-concentration": ["fundAccounts"],
  "external-loan-exposure": ["fundAccounts"],
  "ledger-transactions": ["ledgerEntries"],
  "access-rbac": ["users"],
  "meeting-monitor": ["meetings"],
  "ftma-vsla-kpi": ["importedKpis"],
  "ftma-training-kpi": ["importedKpis"],
  "ftma-fsc-kpi": ["importedKpis"]
};

export function canUseReport(
  reportId: ReportId,
  permissions: Set<string>,
  visibility?: ReportVisibility
) {
  const hasPermissions = reportPermissionRequirements[reportId].every((permission) =>
    permissions.has(permission)
  );
  if (!hasPermissions) return false;

  return (reportVisibilityRequirements[reportId] ?? []).every(
    (source) => visibility?.[source] !== false
  );
}

export function reportBasisLabel(reportId: ReportId) {
  switch (reportId) {
    case "fund-balances":
    case "fund-type-summary":
    case "cash-concentration":
    case "external-loan-exposure":
      return "Fund accounts";
    case "ledger-transactions":
      return "Ledger entries";
    case "access-rbac":
      return "User access";
    case "audit-trail":
    case "audit-volume":
    case "actor-activity":
    case "entity-trail":
      return "Audit events";
    case "meeting-monitor":
      return "Meetings";
    case "ftma-vsla-kpi":
    case "ftma-training-kpi":
    case "ftma-fsc-kpi":
      return "Imported KPIs";
    case "integrations":
      return "Integrations";
    case "partner-linkage":
    case "partner-coverage":
      return "Partner scope";
    case "programme-performance":
      return "Programmes";
    case "agent-productivity":
      return "Field agents";
    case "county-coverage":
    case "phase-distribution":
    case "credit-readiness":
      return "Groups";
    case "data-source":
      return "Scoped sources";
    case "executive":
    case "system-health":
    default:
      return "Visible datasets";
  }
}
