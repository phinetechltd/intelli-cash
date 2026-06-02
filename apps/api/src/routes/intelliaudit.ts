import { Router } from "express";
import { z } from "zod";
import {
  intelliAuditEvidenceSourceTypes,
  intelliAuditReportStandards,
  intelliAuditScopeTypes,
  integrationProviders
} from "@intellicash/shared";
import {
  assertNotSelfApproval,
  buildAssistantSections,
  buildReportDraftContent,
  canApproveIntelliAuditScope,
  detectEvidenceSignals,
  hashEvidencePayload,
  intelliAuditStandardReferences,
  isUnsafeAuditRequest,
  normalizeIntelliAuditScope,
  normalizeReportStandard,
  type EvidenceSignal,
  type EvidenceSignalRecord,
  type IntelliAuditActor,
  type IntelliAuditScope
} from "../domain/intelliaudit";
import { getIntegrationAdapter } from "../domain/integrations";
import { env } from "../config/env";
import { appendAuditEvent } from "../services/audit-service";
import { groupScopeForUser, programmeScopeForUser } from "../services/account-scope";
import { generateIntelliAuditLlmResponse, intelliAuditSystemPolicy } from "../services/intelliaudit-llm";
import { requireAuth, type AuthenticatedUser } from "../middleware/auth";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

const genericConnectorProviders = [
  "DATABASE",
  "MYSQL",
  "CSV",
  "EXCEL",
  "PDF",
  "BANK_STATEMENT",
  "MPESA_STATEMENT",
  "ACCOUNTING_SYSTEM",
  "ERP",
  "PAYROLL",
  "REST_API",
  "OPENAPI",
  "WEBHOOK",
  "MANUAL"
] as const;

const supportedConnectorProviders = new Set<string>([
  ...integrationProviders,
  ...genericConnectorProviders
]);

const scopeSchema = z.object({
  scopeType: z.enum(intelliAuditScopeTypes).default("GLOBAL"),
  scopeId: z.string().nullable().optional()
});

const evidenceRecordSchema = z.object({
  recordType: z.string().min(2).default("TRANSACTION"),
  occurredAt: z.string().datetime().optional(),
  amountCents: z.coerce.number().int().optional(),
  currency: z.string().min(3).max(3).default("KES"),
  direction: z.enum(["CREDIT", "DEBIT"]).optional(),
  counterparty: z.string().optional(),
  reference: z.string().optional(),
  description: z.string().optional(),
  confidence: z.coerce.number().min(0).max(1).default(0.8),
  data: z.record(z.unknown()).default({})
});

const evidenceUploadSchema = scopeSchema.extend({
  sourceId: z.string().optional(),
  sourceName: z.string().min(2).optional(),
  sourceType: z.enum(intelliAuditEvidenceSourceTypes).default("MANUAL"),
  provider: z.string().optional(),
  title: z.string().min(2),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  sourceUri: z.string().url().optional(),
  rawText: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  records: z.array(evidenceRecordSchema).default([])
});

const connectorSyncSchema = scopeSchema.extend({
  sourceId: z.string().optional(),
  sourceName: z.string().min(2).optional(),
  endpoint: z.string().url().optional(),
  method: z.enum(["GET", "POST"]).default("GET"),
  headers: z.record(z.string()).default({}),
  body: z.record(z.unknown()).optional(),
  records: z.array(evidenceRecordSchema).default([]),
  metadata: z.record(z.unknown()).default({})
});

const chatSchema = scopeSchema.extend({
  conversationId: z.string().optional(),
  message: z.string().min(2)
});

const reportDraftSchema = scopeSchema.extend({
  title: z.string().min(2),
  templateKey: z.string().min(2).default("STANDARD_REPORT"),
  standard: z.enum(intelliAuditReportStandards).default("IFRS"),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional()
});

const approvalSchema = z.object({
  notes: z.string().optional()
});

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function requestActor(user: AuthenticatedUser | undefined): IntelliAuditActor {
  if (!user) {
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  return {
    id: user.id,
    role: user.role,
    partnerId: user.partnerId,
    groupId: user.groupId
  };
}

function scopeFromBody(body: { scopeType?: string | null; scopeId?: string | null }) {
  return normalizeIntelliAuditScope(body);
}

async function assertScopeAccess(
  user: AuthenticatedUser | undefined,
  scope: IntelliAuditScope,
  mode: "approve" | "read" | "write"
) {
  const actor = requestActor(user);

  if (actor.role === "IWL_ADMIN") return;
  if (mode === "read" && actor.role === "READ_ONLY") return;

  if (scope.scopeType === "GLOBAL") {
    throw new ApiHttpError(403, "SCOPE_FORBIDDEN", "Global IntelliAudit scope requires IWL admin access.");
  }

  if (mode === "approve" && canApproveIntelliAuditScope(actor, scope)) return;

  if (scope.scopeType === "PARTNER" && scope.scopeId && actor.partnerId === scope.scopeId) return;
  if (scope.scopeType === "GROUP" && scope.scopeId) {
    const group = await prisma.group.findFirst({
      where: { AND: [{ id: scope.scopeId }, groupScopeForUser(user)] },
      select: { id: true }
    });
    if (group) return;
  }

  if (scope.scopeType === "PROGRAMME" && scope.scopeId) {
    const programme = await prisma.programme.findFirst({
      where: { AND: [{ id: scope.scopeId }, programmeScopeForUser(user)] },
      select: { id: true }
    });
    if (programme && (mode !== "approve" || actor.role === "PARTNER_OFFICER" || actor.role === "LENDER")) {
      return;
    }
  }

  throw new ApiHttpError(403, "SCOPE_FORBIDDEN", "This IntelliAudit scope is outside your account.");
}

async function scopedWhere(user: AuthenticatedUser | undefined) {
  if (!user) return { id: "__no_access__" };
  if (user.role === "IWL_ADMIN" || user.role === "READ_ONLY") return {};

  const clauses: Array<{ scopeType: string; scopeId?: string | null }> = [];

  if (user.partnerId) clauses.push({ scopeType: "PARTNER", scopeId: user.partnerId });
  if (user.groupId) clauses.push({ scopeType: "GROUP", scopeId: user.groupId });

  const [groups, programmes] = await Promise.all([
    prisma.group.findMany({ where: groupScopeForUser(user), select: { id: true } }),
    prisma.programme.findMany({ where: programmeScopeForUser(user), select: { id: true } })
  ]);

  groups.forEach((group) => clauses.push({ scopeType: "GROUP", scopeId: group.id }));
  programmes.forEach((programme) => clauses.push({ scopeType: "PROGRAMME", scopeId: programme.id }));

  return clauses.length > 0 ? { OR: clauses } : { id: "__no_access__" };
}

function recordToSignalRecord(record: {
  id: string;
  documentId: string | null;
  hash: string;
  reference: string | null;
  description: string | null;
  amountCents: number | null;
  direction: string | null;
  counterparty: string | null;
}): EvidenceSignalRecord {
  return {
    id: record.id,
    documentId: record.documentId,
    hash: record.hash,
    reference: record.reference,
    description: record.description,
    amountCents: record.amountCents,
    direction: record.direction,
    counterparty: record.counterparty
  };
}

async function upsertStandardsRegistry() {
  await Promise.all(
    intelliAuditStandardReferences.map((reference) =>
      prisma.intelliAuditStandardReference.upsert({
        where: { key: reference.key },
        create: reference,
        update: reference
      })
    )
  );
}

async function ensureEvidenceSource(input: {
  actorUserId?: string;
  sourceId?: string;
  sourceName?: string;
  sourceType: string;
  provider?: string | null;
  scope: IntelliAuditScope;
  connectorConfig?: unknown;
}) {
  if (input.sourceId) {
    const source = await prisma.intelliAuditEvidenceSource.findUnique({
      where: { id: input.sourceId }
    });

    if (!source) {
      throw new ApiHttpError(404, "EVIDENCE_SOURCE_NOT_FOUND", "Evidence source does not exist.");
    }

    return source;
  }

  return prisma.intelliAuditEvidenceSource.create({
    data: {
      name: input.sourceName ?? input.provider ?? input.sourceType,
      sourceType: input.sourceType,
      provider: input.provider ?? null,
      scopeType: input.scope.scopeType,
      scopeId: input.scope.scopeId,
      connectorConfigJson: input.connectorConfig ? JSON.stringify(input.connectorConfig) : null,
      createdByUserId: input.actorUserId
    }
  });
}

async function stageEvidence(input: {
  actorUserId?: string;
  sourceId?: string;
  sourceName?: string;
  sourceType: string;
  provider?: string | null;
  scope: IntelliAuditScope;
  title: string;
  fileName?: string;
  mimeType?: string;
  sourceUri?: string;
  rawText?: string;
  metadata: Record<string, unknown>;
  records: z.infer<typeof evidenceRecordSchema>[];
}) {
  const source = await ensureEvidenceSource({
    actorUserId: input.actorUserId,
    sourceId: input.sourceId,
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    provider: input.provider,
    scope: input.scope,
    connectorConfig: input.metadata
  });
  const contentHash = hashEvidencePayload({
    title: input.title,
    fileName: input.fileName,
    sourceUri: input.sourceUri,
    rawText: input.rawText,
    metadata: input.metadata,
    records: input.records
  });

  const document = await prisma.intelliAuditSourceDocument.create({
    data: {
      sourceId: source.id,
      scopeType: input.scope.scopeType,
      scopeId: input.scope.scopeId,
      title: input.title,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sourceUri: input.sourceUri,
      contentHash,
      extractionStatus: input.records.length > 0 ? "COMPLETE" : "METADATA_ONLY",
      rawMetadataJson: JSON.stringify({
        ...input.metadata,
        rawTextPreview: input.rawText?.slice(0, 500) ?? null
      }),
      uploadedByUserId: input.actorUserId
    }
  });

  const existingHashes = new Set(
    (
      await prisma.intelliAuditExtractedRecord.findMany({
        where: { hash: { in: input.records.map((record) => hashEvidencePayload(record)) } },
        select: { hash: true }
      })
    ).map((record) => record.hash)
  );

  const records = await Promise.all(
    input.records.map((record) => {
      const normalized = {
        ...record.data,
        recordType: record.recordType,
        occurredAt: record.occurredAt,
        amountCents: record.amountCents,
        currency: record.currency,
        direction: record.direction,
        counterparty: record.counterparty,
        reference: record.reference,
        description: record.description
      };
      const hash = hashEvidencePayload(record);

      return prisma.intelliAuditExtractedRecord.create({
        data: {
          sourceId: source.id,
          documentId: document.id,
          recordType: record.recordType,
          occurredAt: record.occurredAt ? new Date(record.occurredAt) : null,
          amountCents: record.amountCents,
          currency: record.currency,
          direction: record.direction,
          counterparty: record.counterparty,
          reference: record.reference,
          description: record.description,
          normalizedJson: JSON.stringify(normalized),
          hash,
          confidence: record.confidence,
          status: existingHashes.has(hash) ? "DUPLICATE_REVIEW" : "STAGED"
        }
      });
    })
  );

  let reconciliationBatch = null;
  if (records.length > 0) {
    const totalDebitCents = records
      .filter((record) => record.direction === "DEBIT")
      .reduce((sum, record) => sum + (record.amountCents ?? 0), 0);
    const totalCreditCents = records
      .filter((record) => record.direction !== "DEBIT")
      .reduce((sum, record) => sum + (record.amountCents ?? 0), 0);
    const duplicateCount = records.filter((record) => record.status === "DUPLICATE_REVIEW").length;

    reconciliationBatch = await prisma.intelliAuditReconciliationBatch.create({
      data: {
        scopeType: input.scope.scopeType,
        scopeId: input.scope.scopeId,
        title: `${input.title} reconciliation`,
        recordCount: records.length,
        exceptionCount: duplicateCount,
        totalDebitCents,
        totalCreditCents,
        createdByUserId: input.actorUserId,
        items: {
          create: records.map((record) => ({
            extractedRecordId: record.id,
            matchStatus: record.status === "DUPLICATE_REVIEW" ? "EXCEPTION" : "UNMATCHED",
            confidence: record.confidence,
            exceptionJson:
              record.status === "DUPLICATE_REVIEW"
                ? JSON.stringify({ reason: "Duplicate evidence hash already exists" })
                : null
          }))
        }
      }
    });
  }

  const signals = detectEvidenceSignals(records.map(recordToSignalRecord));
  const findings = await Promise.all(
    signals.map((signal) =>
      prisma.intelliAuditFinding.create({
        data: {
          scopeType: input.scope.scopeType,
          scopeId: input.scope.scopeId,
          severity: signal.severity,
          category: signal.category,
          title: signal.title,
          observation: signal.observation,
          recommendation: signal.recommendation,
          evidenceRefsJson: JSON.stringify(signal.evidenceRefs),
          sourceIdsJson: JSON.stringify([source.id]),
          createdByUserId: input.actorUserId
        }
      })
    )
  );

  return { source, document, records, reconciliationBatch, findings, signals };
}

async function scopedEvidenceContext(user: AuthenticatedUser | undefined) {
  const where = await scopedWhere(user);
  const [sources, documents, records, findings, auditEvents] = await Promise.all([
    prisma.intelliAuditEvidenceSource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { documents: true, records: true, syncRuns: true } }
      }
    }),
    prisma.intelliAuditSourceDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { source: true, _count: { select: { records: true } } }
    }),
    prisma.intelliAuditExtractedRecord.findMany({
      where: { source: where },
      orderBy: { createdAt: "desc" },
      take: 500
    }),
    prisma.intelliAuditFinding.findMany({
      where,
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 100
    }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  return { sources, documents, records, findings, auditEvents };
}

router.get("/intelliaudit/standards", requireAuth("intelliaudit:read"), async (_req, res, next) => {
  try {
    await upsertStandardsRegistry();
    const standards = await prisma.intelliAuditStandardReference.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }]
    });
    ok(res, standards);
  } catch (error) {
    next(error);
  }
});

router.get("/intelliaudit/overview", requireAuth("intelliaudit:read"), async (req, res, next) => {
  try {
    await upsertStandardsRegistry();
    const where = await scopedWhere(req.user);
    const [sources, documents, records, reconciliations, findings, recommendations, reports, approvals, standards] =
      await Promise.all([
        prisma.intelliAuditEvidenceSource.count({ where }),
        prisma.intelliAuditSourceDocument.count({ where }),
        prisma.intelliAuditExtractedRecord.count({ where: { source: where } }),
        prisma.intelliAuditReconciliationBatch.count({ where }),
        prisma.intelliAuditFinding.count({ where }),
        prisma.intelliAuditRecommendation.count({ where }),
        prisma.intelliAuditReportDraft.count({ where }),
        prisma.intelliAuditReportDraft.count({ where: { ...where, status: "APPROVED" } }),
        prisma.intelliAuditStandardReference.count()
      ]);

    ok(res, {
      sources,
      documents,
      records,
      reconciliations,
      findings,
      recommendations,
      reports,
      approvals,
      standards,
      llmConfigured: Boolean(
        env.INTELLIAUDIT_LLM_PROVIDER !== "disabled" &&
          env.INTELLIAUDIT_LLM_BASE_URL &&
          env.INTELLIAUDIT_LLM_API_KEY &&
          env.INTELLIAUDIT_LLM_MODEL
      ),
      connectorNetworkCallsEnabled: env.INTELLIAUDIT_ENABLE_CONNECTOR_NETWORK_CALLS
    });
  } catch (error) {
    next(error);
  }
});

router.get("/intelliaudit/evidence", requireAuth("intelliaudit:read"), async (req, res, next) => {
  try {
    const context = await scopedEvidenceContext(req.user);
    ok(res, {
      ...context,
      documents: context.documents.map((document) => ({
        ...document,
        metadata: parseJson(document.rawMetadataJson, {})
      })),
      records: context.records.map((record) => ({
        ...record,
        normalized: parseJson(record.normalizedJson, {})
      })),
      findings: context.findings.map((finding) => ({
        ...finding,
        evidenceRefs: parseJson(finding.evidenceRefsJson, []),
        sourceIds: parseJson(finding.sourceIdsJson, [])
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.post("/intelliaudit/evidence", requireAuth("evidence:write"), async (req, res, next) => {
  try {
    const body = evidenceUploadSchema.parse(req.body);
    const scope = scopeFromBody(body);
    await assertScopeAccess(req.user, scope, "write");

    const result = await stageEvidence({
      actorUserId: req.user?.id,
      sourceId: body.sourceId,
      sourceName: body.sourceName,
      sourceType: body.sourceType,
      provider: body.provider,
      scope,
      title: body.title,
      fileName: body.fileName,
      mimeType: body.mimeType,
      sourceUri: body.sourceUri,
      rawText: body.rawText,
      metadata: body.metadata,
      records: body.records
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "INTELLIAUDIT_EVIDENCE",
      entityId: result.document.id,
      type: "INTELLIAUDIT_EVIDENCE_UPLOADED",
      payload: {
        sourceId: result.source.id,
        documentId: result.document.id,
        contentHash: result.document.contentHash,
        scope,
        recordCount: result.records.length
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "INTELLIAUDIT_EVIDENCE",
      entityId: result.document.id,
      type: "INTELLIAUDIT_EVIDENCE_EXTRACTED",
      payload: {
        documentId: result.document.id,
        extractionStatus: result.document.extractionStatus,
        recordIds: result.records.map((record) => record.id),
        findingIds: result.findings.map((finding) => finding.id)
      }
    });

    if (result.reconciliationBatch) {
      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "INTELLIAUDIT_RECONCILIATION",
        entityId: result.reconciliationBatch.id,
        type: "INTELLIAUDIT_RECONCILIATION_STAGED",
        payload: {
          batchId: result.reconciliationBatch.id,
          recordCount: result.records.length,
          exceptionCount: result.reconciliationBatch.exceptionCount,
          scope
        }
      });
    }

    ok(res.status(201), result);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/intelliaudit/connectors/:provider/sync",
  requireAuth("connectors:sync"),
  async (req, res, next) => {
    try {
      const provider = String(req.params.provider ?? "").toUpperCase();
      if (!supportedConnectorProviders.has(provider)) {
        throw new ApiHttpError(404, "CONNECTOR_NOT_FOUND", "IntelliAudit connector provider is unknown.");
      }

      const body = connectorSyncSchema.parse(req.body);
      const scope = scopeFromBody(body);
      await assertScopeAccess(req.user, scope, "write");

      let networkStatus: { ok: boolean; message: string } | null = null;
      let records = body.records;

      const integrationAdapter = getIntegrationAdapter(provider);
      if (integrationAdapter) {
        const adapterResult = await integrationAdapter.test();
        networkStatus = { ok: adapterResult.ok, message: adapterResult.message };
      } else if (body.endpoint && env.INTELLIAUDIT_ENABLE_CONNECTOR_NETWORK_CALLS) {
        const response = await fetch(body.endpoint, {
          method: body.method,
          headers: body.headers,
          body: body.method === "POST" ? JSON.stringify(body.body ?? {}) : undefined
        });
        const payload = (await response.json().catch(() => null)) as unknown;
        const rows = Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
            ? ((payload as { data: unknown[] }).data)
            : [];

        records = rows.map((row, index) => {
          const rowRecord = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
          return {
            recordType: String(rowRecord.recordType ?? "API_RECORD"),
            amountCents:
              typeof rowRecord.amountCents === "number" ? rowRecord.amountCents : undefined,
            currency: typeof rowRecord.currency === "string" ? rowRecord.currency : "KES",
            direction:
              rowRecord.direction === "CREDIT" || rowRecord.direction === "DEBIT"
                ? rowRecord.direction
                : undefined,
            reference: String(rowRecord.reference ?? `${provider}-${index + 1}`),
            description: String(rowRecord.description ?? "Imported API record"),
            confidence: 0.72,
            data: rowRecord
          };
        });
        networkStatus = { ok: response.ok, message: `Connector endpoint responded with HTTP ${response.status}.` };
      } else if (body.endpoint) {
        networkStatus = {
          ok: true,
          message: "Connector network call skipped because INTELLIAUDIT_ENABLE_CONNECTOR_NETWORK_CALLS is false."
        };
      }

      const result = await stageEvidence({
        actorUserId: req.user?.id,
        sourceId: body.sourceId,
        sourceName: body.sourceName ?? `${provider} sync`,
        sourceType: genericConnectorProviders.includes(provider as (typeof genericConnectorProviders)[number])
          ? provider
          : "REST_API",
        provider,
        scope,
        title: `${provider} sync ${new Date().toISOString()}`,
        metadata: {
          ...body.metadata,
          endpoint: body.endpoint ?? null,
          networkStatus
        },
        records
      });

      const completedAt = new Date();
      await prisma.intelliAuditEvidenceSource.update({
        where: { id: result.source.id },
        data: { lastSyncedAt: completedAt }
      });
      const syncRun = await prisma.intelliAuditConnectorSyncRun.create({
        data: {
          sourceId: result.source.id,
          provider,
          status: "SUCCESS",
          completedAt,
          importedRecordCount: result.records.length,
          exceptionCount: result.reconciliationBatch?.exceptionCount ?? 0,
          actorUserId: req.user?.id,
          summaryJson: JSON.stringify({
            networkStatus,
            documentId: result.document.id,
            reconciliationBatchId: result.reconciliationBatch?.id ?? null
          })
        }
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "INTELLIAUDIT_CONNECTOR",
        entityId: syncRun.id,
        type: "INTELLIAUDIT_CONNECTOR_SYNCED",
        payload: {
          provider,
          syncRunId: syncRun.id,
          sourceId: result.source.id,
          importedRecordCount: result.records.length,
          exceptionCount: syncRun.exceptionCount,
          networkStatus
        }
      });

      ok(res.status(201), { ...result, syncRun });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/intelliaudit/chat", requireAuth("intelliaudit:write"), async (req, res, next) => {
  try {
    const body = chatSchema.parse(req.body);
    const scope = scopeFromBody(body);
    await assertScopeAccess(req.user, scope, "write");

    const conversation = body.conversationId
      ? await prisma.intelliAuditConversation.findUnique({ where: { id: body.conversationId } })
      : await prisma.intelliAuditConversation.create({
          data: {
            scopeType: scope.scopeType,
            scopeId: scope.scopeId,
            title: body.message.slice(0, 80),
            createdByUserId: req.user?.id
          }
        });

    if (!conversation) {
      throw new ApiHttpError(404, "CONVERSATION_NOT_FOUND", "IntelliAudit conversation does not exist.");
    }

    await prisma.intelliAuditMessage.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: body.message,
        factualDataJson: "[]",
        assumptionsJson: "[]",
        observationsJson: "[]",
        recommendationsJson: "[]",
        evidenceRefsJson: "[]",
        unsupportedClaimsJson: "[]"
      }
    });

    if (isUnsafeAuditRequest(body.message)) {
      const refusal = {
        content:
          "I cannot help manipulate, conceal, falsify, backdate, or misrepresent financial information. I can help document the issue, preserve evidence, prepare a correction workflow, and flag compliance risks for human review.",
        factualData: [],
        assumptions: [],
        observations: ["The user request matched IntelliAudit unsafe financial-reporting policy."],
        recommendations: [
          "Preserve the evidence trail, document the attempted action, and route the matter to an authorized reviewer."
        ],
        unsupportedClaims: []
      };

      const assistantMessage = await prisma.intelliAuditMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: refusal.content,
          factualDataJson: JSON.stringify(refusal.factualData),
          assumptionsJson: JSON.stringify(refusal.assumptions),
          observationsJson: JSON.stringify(refusal.observations),
          recommendationsJson: JSON.stringify(refusal.recommendations),
          evidenceRefsJson: "[]",
          unsupportedClaimsJson: JSON.stringify(refusal.unsupportedClaims)
        }
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "INTELLIAUDIT_CHAT",
        entityId: conversation.id,
        type: "INTELLIAUDIT_REQUEST_REJECTED",
        payload: {
          conversationId: conversation.id,
          messageId: assistantMessage.id,
          reason: "Unsafe audit manipulation request"
        }
      });

      ok(res, { conversation, message: assistantMessage });
      return;
    }

    const context = await scopedEvidenceContext(req.user);
    const signalFindings = detectEvidenceSignals(context.records.map(recordToSignalRecord));
    const llmText = await generateIntelliAuditLlmResponse({
      message: body.message,
      evidencePack: {
        scope,
        documents: context.documents.slice(0, 20),
        records: context.records.slice(0, 50),
        findings: context.findings.slice(0, 20)
      },
      systemPolicy: intelliAuditSystemPolicy
    });
    const sections = buildAssistantSections({
      message: body.message,
      evidenceRecordCount: context.records.length,
      documentCount: context.documents.length,
      auditEventCount: context.auditEvents.length,
      findings: signalFindings,
      llmText
    });
    const content = llmText ? `${sections.content}\n\nProvider note:\n${llmText}` : sections.content;
    const evidenceRefs = context.records.slice(0, 25).map((record) => ({
      entityType: "INTELLIAUDIT_RECORD",
      entityId: record.id
    }));

    const assistantMessage = await prisma.intelliAuditMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content,
        factualDataJson: JSON.stringify(sections.factualData),
        assumptionsJson: JSON.stringify(sections.assumptions),
        observationsJson: JSON.stringify(sections.observations),
        recommendationsJson: JSON.stringify(sections.recommendations),
        evidenceRefsJson: JSON.stringify(evidenceRefs),
        unsupportedClaimsJson: JSON.stringify(sections.unsupportedClaims)
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "INTELLIAUDIT_CHAT",
      entityId: conversation.id,
      type: "INTELLIAUDIT_AI_RESPONDED",
      payload: {
        conversationId: conversation.id,
        messageId: assistantMessage.id,
        evidenceRecordCount: context.records.length,
        documentCount: context.documents.length,
        llmConfigured: Boolean(llmText)
      }
    });

    ok(res, { conversation, message: assistantMessage });
  } catch (error) {
    next(error);
  }
});

router.get("/intelliaudit/reconciliations", requireAuth("intelliaudit:read"), async (req, res, next) => {
  try {
    const where = await scopedWhere(req.user);
    const batches = await prisma.intelliAuditReconciliationBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { items: { take: 25, orderBy: { createdAt: "desc" } } }
    });
    ok(res, batches);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/intelliaudit/reconciliations/:id/approve",
  requireAuth("intelliaudit:approve"),
  async (req, res, next) => {
    try {
      const body = approvalSchema.parse(req.body);
      const batch = await prisma.intelliAuditReconciliationBatch.findUnique({
        where: { id: String(req.params.id ?? "") }
      });

      if (!batch) {
        throw new ApiHttpError(404, "RECONCILIATION_NOT_FOUND", "Reconciliation batch does not exist.");
      }

      const scope = normalizeIntelliAuditScope({ scopeType: batch.scopeType, scopeId: batch.scopeId });
      await assertScopeAccess(req.user, scope, "approve");
      assertNotSelfApproval(req.user?.id ?? "", batch.createdByUserId, "Reconciliation approval");

      const approved = await prisma.intelliAuditReconciliationBatch.update({
        where: { id: batch.id },
        data: {
          status: "APPROVED",
          approvedByUserId: req.user?.id,
          approvedAt: new Date(),
          reviewerNotes: body.notes
        },
        include: { items: true }
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "INTELLIAUDIT_RECONCILIATION",
        entityId: approved.id,
        type: "INTELLIAUDIT_RECONCILIATION_APPROVED",
        payload: {
          batchId: approved.id,
          approvedByUserId: req.user?.id,
          recordCount: approved.recordCount,
          exceptionCount: approved.exceptionCount
        }
      });

      ok(res, approved);
    } catch (error) {
      if (error instanceof Error && error.message.includes("requires review by a different user")) {
        next(new ApiHttpError(400, "SELF_APPROVAL_BLOCKED", error.message));
        return;
      }
      next(error);
    }
  }
);

router.get("/intelliaudit/reports", requireAuth("intelliaudit:read"), async (req, res, next) => {
  try {
    const where = await scopedWhere(req.user);
    const reports = await prisma.intelliAuditReportDraft.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        approvals: { orderBy: { createdAt: "desc" } },
        auditReferences: { orderBy: { createdAt: "desc" } }
      }
    });

    ok(
      res,
      reports.map((report) => ({
        ...report,
        content: parseJson(report.contentJson, {}),
        auditTrailRefs: parseJson(report.auditTrailRefsJson, [])
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post("/intelliaudit/reports", requireAuth("intelliaudit:write"), async (req, res, next) => {
  try {
    const body = reportDraftSchema.parse(req.body);
    const scope = scopeFromBody(body);
    await assertScopeAccess(req.user, scope, "write");

    const context = await scopedEvidenceContext(req.user);
    const signalFindings: EvidenceSignal[] = detectEvidenceSignals(context.records.map(recordToSignalRecord));
    const standard = normalizeReportStandard(body.standard);
    const auditRefs = [
      ...context.auditEvents.slice(0, 40).map((event) => ({
        entityType: "AUDIT_EVENT",
        entityId: event.id
      })),
      ...context.documents.slice(0, 40).map((document) => ({
        entityType: "INTELLIAUDIT_DOCUMENT",
        entityId: document.id
      })),
      ...context.records.slice(0, 40).map((record) => ({
        entityType: "INTELLIAUDIT_RECORD",
        entityId: record.id
      }))
    ];
    const content = buildReportDraftContent({
      title: body.title,
      standard,
      documentCount: context.documents.length,
      evidenceRecordCount: context.records.length,
      findings: signalFindings,
      auditReferenceCount: auditRefs.length
    });

    const report = await prisma.intelliAuditReportDraft.create({
      data: {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        templateKey: body.templateKey,
        standard,
        title: body.title,
        periodStart: body.periodStart ? new Date(body.periodStart) : null,
        periodEnd: body.periodEnd ? new Date(body.periodEnd) : null,
        generatedByUserId: req.user?.id,
        contentJson: JSON.stringify(content),
        auditTrailRefsJson: JSON.stringify(auditRefs),
        auditReferences: {
          create: auditRefs.map((ref) => ({
            entityType: ref.entityType,
            entityId: ref.entityId,
            auditEventId: ref.entityType === "AUDIT_EVENT" ? ref.entityId : null,
            evidenceDocumentId: ref.entityType === "INTELLIAUDIT_DOCUMENT" ? ref.entityId : null,
            extractedRecordId: ref.entityType === "INTELLIAUDIT_RECORD" ? ref.entityId : null
          }))
        }
      },
      include: {
        approvals: true,
        auditReferences: true
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "INTELLIAUDIT_REPORT",
      entityId: report.id,
      type: "INTELLIAUDIT_REPORT_DRAFTED",
      payload: {
        reportId: report.id,
        title: report.title,
        standard,
        templateKey: report.templateKey,
        auditReferenceCount: auditRefs.length,
        scope
      }
    });

    ok(res.status(201), {
      ...report,
      content,
      auditTrailRefs: auditRefs
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/intelliaudit/reports/:id/approve",
  requireAuth("reports:approve"),
  async (req, res, next) => {
    try {
      const body = approvalSchema.parse(req.body);
      const report = await prisma.intelliAuditReportDraft.findUnique({
        where: { id: String(req.params.id ?? "") }
      });

      if (!report) {
        throw new ApiHttpError(404, "REPORT_NOT_FOUND", "IntelliAudit report draft does not exist.");
      }

      const scope = normalizeIntelliAuditScope({ scopeType: report.scopeType, scopeId: report.scopeId });
      await assertScopeAccess(req.user, scope, "approve");
      assertNotSelfApproval(req.user?.id ?? "", report.generatedByUserId, "Report approval");

      const approved = await prisma.intelliAuditReportDraft.update({
        where: { id: report.id },
        data: {
          status: "APPROVED",
          approvedByUserId: req.user?.id,
          approvedAt: new Date(),
          approvalNotes: body.notes,
          approvals: {
            create: {
              actorUserId: req.user?.id ?? "",
              action: "APPROVED",
              notes: body.notes
            }
          }
        },
        include: {
          approvals: { orderBy: { createdAt: "desc" } },
          auditReferences: { orderBy: { createdAt: "desc" } }
        }
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "INTELLIAUDIT_REPORT",
        entityId: approved.id,
        type: "INTELLIAUDIT_REPORT_APPROVED",
        payload: {
          reportId: approved.id,
          approvedByUserId: req.user?.id,
          status: approved.status,
          scope
        }
      });

      ok(res, {
        ...approved,
        content: parseJson(approved.contentJson, {}),
        auditTrailRefs: parseJson(approved.auditTrailRefsJson, [])
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("requires review by a different user")) {
        next(new ApiHttpError(400, "SELF_APPROVAL_BLOCKED", error.message));
        return;
      }
      next(error);
    }
  }
);

router.post("/intelliaudit/reports/:id/export", requireAuth("intelliaudit:read"), async (req, res, next) => {
  try {
    const report = await prisma.intelliAuditReportDraft.findUnique({
      where: { id: String(req.params.id ?? "") }
    });

    if (!report) {
      throw new ApiHttpError(404, "REPORT_NOT_FOUND", "IntelliAudit report draft does not exist.");
    }

    const scope = normalizeIntelliAuditScope({ scopeType: report.scopeType, scopeId: report.scopeId });
    await assertScopeAccess(req.user, scope, "read");

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "INTELLIAUDIT_REPORT",
      entityId: report.id,
      type: "INTELLIAUDIT_REPORT_EXPORTED",
      payload: {
        reportId: report.id,
        status: report.status,
        exportedAt: new Date().toISOString()
      }
    });

    ok(res, {
      reportId: report.id,
      title: report.title,
      status: report.status,
      content: parseJson(report.contentJson, {}),
      auditTrailRefs: parseJson(report.auditTrailRefsJson, [])
    });
  } catch (error) {
    next(error);
  }
});

export { router as intelliAuditRouter };
