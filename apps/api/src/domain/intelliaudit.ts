import { createHash } from "node:crypto";
import type {
  IntelliAuditReportStandard,
  IntelliAuditScopeType
} from "@intellicash/shared";
import {
  intelliAuditReportStandards,
  intelliAuditScopeTypes
} from "@intellicash/shared";

export interface IntelliAuditActor {
  id: string;
  role: string;
  partnerId: string | null;
  groupId: string | null;
}

export interface IntelliAuditScope {
  scopeType: IntelliAuditScopeType;
  scopeId: string | null;
}

export interface EvidenceSignalRecord {
  id?: string;
  documentId?: string | null;
  hash: string;
  reference?: string | null;
  description?: string | null;
  amountCents?: number | null;
  direction?: string | null;
  counterparty?: string | null;
}

export interface EvidenceSignal {
  severity: "HIGH" | "LOW" | "MEDIUM";
  category: string;
  title: string;
  observation: string;
  recommendation: string;
  evidenceRefs: Array<{ entityType: string; entityId: string }>;
}

export const intelliAuditStandardReferences = [
  {
    key: "KE_DPA_2019",
    name: "Kenya Data Protection Act, 2019",
    category: "DATA_PROTECTION",
    jurisdiction: "Kenya",
    sourceUrl: "https://www.odpc.go.ke/data-protection-laws-kenya/",
    summary:
      "Use for personal data minimisation, lawful processing, data-subject rights, breach handling, and processor/controller governance."
  },
  {
    key: "KE_POCAMLA_AML_CFT",
    name: "Kenya POCAMLA and FRC AML/CFT requirements",
    category: "AML_CFT",
    jurisdiction: "Kenya",
    sourceUrl: "https://www.frc.go.ke/",
    summary:
      "Use for suspicious or unusual transaction indicators, reporting-institution controls, sanctions screening, and AML/CFT governance."
  },
  {
    key: "KE_SASRA_RETURNS",
    name: "SASRA SACCO regulatory reporting framework",
    category: "SACCO",
    jurisdiction: "Kenya",
    sourceUrl: "https://www.sasra.go.ke/regulatory-reporting-forms/",
    summary:
      "Use for SACCO statutory returns, prudential reporting, governance, liquidity, capital, and member-protection reporting."
  },
  {
    key: "IFRS_2026",
    name: "IFRS Accounting Standards",
    category: "FINANCIAL_REPORTING",
    jurisdiction: "International",
    sourceUrl:
      "https://www.ifrs.org/news-and-events/news/2026/01/now-available-ifrs-accounting-standards-required-2026-two-editions/",
    summary:
      "Use for general purpose financial statements, disclosure discipline, measurement, recognition, and management commentary."
  },
  {
    key: "IAASB_2025_ISA",
    name: "IAASB International Standards on Auditing handbook",
    category: "AUDIT",
    jurisdiction: "International",
    sourceUrl:
      "https://www.iaasb.org/publications/2025-handbook-international-quality-management-auditing-review-other-assurance-and-related-services",
    summary:
      "Use for audit planning, evidence, fraud responsibilities, going concern, quality management, and assurance report boundaries."
  },
  {
    key: "IPSASB_2025",
    name: "IPSASB International Public Sector Accounting Standards",
    category: "PUBLIC_SECTOR",
    jurisdiction: "International",
    sourceUrl:
      "https://www.ipsasb.org/publications/2025-handbook-international-public-sector-accounting-pronouncements",
    summary:
      "Use for public sector accrual/cash reporting, budget comparison, assets, liabilities, and public accountability."
  },
  {
    key: "KE_PSASB_IPSAS",
    name: "Kenya PSASB public sector accounting standards",
    category: "PUBLIC_SECTOR",
    jurisdiction: "Kenya",
    sourceUrl: "https://psasb.go.ke/accounting-standards/",
    summary:
      "Use for Kenyan public-sector entity reporting formats, proper books of account, and IPSAS adoption context."
  },
  {
    key: "KE_PBORA_NGO_RETURNS",
    name: "Kenya NGO/PBO annual return accountability guidance",
    category: "NGO_DONOR",
    jurisdiction: "Kenya",
    sourceUrl: "https://pbora.ecitizen.go.ke/",
    summary:
      "Use for NGO/PBO annual returns, audited-account thresholds, Form 14 context, and donor accountability reporting."
  },
  {
    key: "WORLD_BANK_FM",
    name: "World Bank financial management guidance",
    category: "DONOR",
    jurisdiction: "International",
    sourceUrl: "https://www.worldbank.org/en/programs/financial-management",
    summary:
      "Use for project financial management, internal controls, funds flow, interim financial reporting, and audit arrangements."
  },
  {
    key: "CGAP_MFI_INDICATORS",
    name: "CGAP microfinance minimum indicators",
    category: "PORTFOLIO_QUALITY",
    jurisdiction: "International",
    sourceUrl:
      "https://www.cgap.org/research/publication/measuring-results-of-microfinance-institutions-minimum-indicators",
    summary:
      "Use for microfinance and community-managed loan fund portfolio quality, repayment, sustainability, and outreach indicators."
  }
] as const;

export function hashEvidencePayload(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function normalizeIntelliAuditScope(input: {
  scopeType?: string | null;
  scopeId?: string | null;
}): IntelliAuditScope {
  const scopeType = intelliAuditScopeTypes.includes(input.scopeType as IntelliAuditScopeType)
    ? (input.scopeType as IntelliAuditScopeType)
    : "GLOBAL";

  return {
    scopeType,
    scopeId: scopeType === "GLOBAL" ? null : input.scopeId ?? null
  };
}

export function normalizeReportStandard(value?: string | null): IntelliAuditReportStandard {
  return intelliAuditReportStandards.includes(value as IntelliAuditReportStandard)
    ? (value as IntelliAuditReportStandard)
    : "IFRS";
}

export function isUnsafeAuditRequest(message: string) {
  const normalized = message.toLowerCase();
  return [
    /fabricat/,
    /falsif/,
    /manipulat/,
    /hide (the )?(loss|fraud|transaction|evidence|audit)/,
    /conceal/,
    /delete (the )?(audit|evidence|log|trail)/,
    /misrepresent/,
    /backdate/,
    /fake (invoice|receipt|statement|report|evidence|transaction)/,
    /issue (a )?final audit opinion/
  ].some((pattern) => pattern.test(normalized));
}

export function canApproveIntelliAuditScope(actor: IntelliAuditActor, scope: IntelliAuditScope) {
  if (actor.role === "IWL_ADMIN") return true;

  if (
    scope.scopeType === "PARTNER" &&
    scope.scopeId &&
    actor.partnerId === scope.scopeId &&
    (actor.role === "PARTNER_OFFICER" || actor.role === "LENDER")
  ) {
    return true;
  }

  if (
    scope.scopeType === "GROUP" &&
    scope.scopeId &&
    actor.groupId === scope.scopeId &&
    actor.role === "GROUP_ACCOUNT"
  ) {
    return true;
  }

  return false;
}

export function assertNotSelfApproval(actorId: string, ownerId: string | null | undefined, label: string) {
  if (ownerId && actorId === ownerId) {
    throw new Error(`${label} requires review by a different user.`);
  }
}

export function detectEvidenceSignals(records: EvidenceSignalRecord[]) {
  const signals: EvidenceSignal[] = [];
  const byHash = new Map<string, EvidenceSignalRecord[]>();
  const byReferenceAmount = new Map<string, EvidenceSignalRecord[]>();
  const missingDocumentRecords = records.filter((record) => !record.documentId);

  for (const record of records) {
    const hashRows = byHash.get(record.hash) ?? [];
    hashRows.push(record);
    byHash.set(record.hash, hashRows);

    if (record.reference && record.amountCents) {
      const key = `${record.reference}:${record.amountCents}`;
      const referenceRows = byReferenceAmount.get(key) ?? [];
      referenceRows.push(record);
      byReferenceAmount.set(key, referenceRows);
    }
  }

  const duplicateRows = Array.from(byHash.values()).filter((rows) => rows.length > 1);
  const duplicateReferenceRows = Array.from(byReferenceAmount.values()).filter((rows) => rows.length > 1);
  const largeTransactions = records.filter((record) => Math.abs(record.amountCents ?? 0) >= 1_000_000_00);

  if (duplicateRows.length > 0 || duplicateReferenceRows.length > 0) {
    const refs = [...duplicateRows, ...duplicateReferenceRows]
      .flat()
      .filter((record): record is EvidenceSignalRecord & { id: string } => Boolean(record.id))
      .slice(0, 12);

    signals.push({
      severity: "HIGH",
      category: "DUPLICATE_RECORDS",
      title: "Potential duplicate evidence records",
      observation: `${duplicateRows.length + duplicateReferenceRows.length} duplicate hash/reference group(s) were detected in staged evidence.`,
      recommendation:
        "Review source documents, external references, and reconciliation matches before report use or ledger posting.",
      evidenceRefs: refs.map((record) => ({ entityType: "INTELLIAUDIT_RECORD", entityId: record.id }))
    });
  }

  if (largeTransactions.length > 0) {
    signals.push({
      severity: "MEDIUM",
      category: "UNUSUAL_TRANSACTION",
      title: "Large transaction review required",
      observation: `${largeTransactions.length} staged record(s) meet the large transaction review threshold.`,
      recommendation:
        "Confirm authorization, supporting documentation, donor restrictions, AML/CFT screening, and budget classification.",
      evidenceRefs: largeTransactions
        .filter((record): record is EvidenceSignalRecord & { id: string } => Boolean(record.id))
        .slice(0, 12)
        .map((record) => ({ entityType: "INTELLIAUDIT_RECORD", entityId: record.id }))
    });
  }

  if (missingDocumentRecords.length > 0) {
    signals.push({
      severity: "MEDIUM",
      category: "MISSING_DOCUMENTATION",
      title: "Evidence records without source documents",
      observation: `${missingDocumentRecords.length} staged record(s) do not have a linked source document.`,
      recommendation:
        "Attach bank, M-Pesa, invoice, receipt, payroll, ERP, or accounting-system evidence before relying on the records.",
      evidenceRefs: missingDocumentRecords
        .filter((record): record is EvidenceSignalRecord & { id: string } => Boolean(record.id))
        .slice(0, 12)
        .map((record) => ({ entityType: "INTELLIAUDIT_RECORD", entityId: record.id }))
    });
  }

  return signals;
}

export function buildAssistantSections(input: {
  message: string;
  evidenceRecordCount: number;
  documentCount: number;
  auditEventCount: number;
  findings: EvidenceSignal[];
  llmText?: string | null;
}) {
  const facts = [
    `${input.evidenceRecordCount} staged evidence record(s) are available in the selected scope.`,
    `${input.documentCount} source document(s) are linked to the selected scope.`,
    `${input.auditEventCount} platform audit event(s) are available for traceability.`
  ];
  const assumptions = [
    "Amounts are treated as Kenyan shilling cents unless a source record states another currency.",
    "AI findings are advisory and require human review before report approval or audit reliance."
  ];
  const observations =
    input.findings.length > 0
      ? input.findings.map((finding) => `${finding.title}: ${finding.observation}`)
      : ["No high-priority deterministic exception was detected in the currently staged evidence."];
  const recommendations =
    input.findings.length > 0
      ? input.findings.map((finding) => finding.recommendation)
      : ["Continue reconciling source records to ledger entries and retain audit-trail references for reports."];
  const unsupportedClaims = input.llmText
    ? []
    : ["No external LLM response was used because IntelliAudit LLM runtime is disabled or not configured."];

  return {
    content: [
      "IntelliAudit analysis",
      "",
      "Factual data:",
      ...facts.map((fact) => `- ${fact}`),
      "",
      "Assumptions:",
      ...assumptions.map((assumption) => `- ${assumption}`),
      "",
      "Observations:",
      ...observations.map((observation) => `- ${observation}`),
      "",
      "Recommendations:",
      ...recommendations.map((recommendation) => `- ${recommendation}`),
      "",
      "Boundary:",
      "- This is not a final audit opinion. Final opinions require sufficient evidence, traceable records, and human approval."
    ].join("\n"),
    factualData: facts,
    assumptions,
    observations,
    recommendations,
    unsupportedClaims
  };
}

export function buildReportDraftContent(input: {
  title: string;
  standard: IntelliAuditReportStandard;
  documentCount: number;
  evidenceRecordCount: number;
  findings: EvidenceSignal[];
  auditReferenceCount: number;
}) {
  return {
    title: input.title,
    standard: input.standard,
    executiveSummary:
      "Generated from scoped Intelli-Cash evidence. Conclusions are limited to verified records, staged reconciliation evidence, and immutable audit references.",
    methodology:
      "The draft aggregates scoped source documents, staged extracted records, reconciliation exceptions, deterministic anomaly checks, and platform audit events.",
    findings: input.findings.map((finding) => ({
      severity: finding.severity,
      category: finding.category,
      title: finding.title,
      observation: finding.observation,
      evidenceRefs: finding.evidenceRefs
    })),
    financialAnalysis: {
      sourceDocuments: input.documentCount,
      evidenceRecords: input.evidenceRecordCount,
      auditReferences: input.auditReferenceCount
    },
    complianceReview: [
      "Kenya Data Protection Act: restrict personal data use to scoped, traceable evidence.",
      "POCAMLA/AML-CFT: flag unusual, duplicate, unsupported, or high-value transactions for review.",
      "Applicable reporting standard: classify output under the selected report template and preserve source references."
    ],
    riskAssessment: input.findings.map((finding) => ({
      risk: finding.title,
      severity: finding.severity,
      response: finding.recommendation
    })),
    recommendations: input.findings.map((finding) => finding.recommendation),
    appendices: [
      "Evidence source register",
      "Reconciliation batch references",
      "Audit event references",
      "Standards registry references"
    ],
    auditTrailReferences: input.auditReferenceCount
  };
}
