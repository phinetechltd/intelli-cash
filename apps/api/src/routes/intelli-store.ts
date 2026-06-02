import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { appendAuditEvent } from "../services/audit-service";
import { createNotification } from "../services/notification-service";
import { requireAuth } from "../middleware/auth";
import {
  partnerScopeForUser,
  programmeScopeForUser,
  villageAgentScopeForUser
} from "../services/account-scope";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

const productStatusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
const supplierStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const installmentFrequencySchema = z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]);
const requestStatusSchema = z.enum([
  "PENDING",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "FULFILLED",
  "CANCELLED"
]);
const repaymentStatusSchema = z.enum([
  "NOT_FINANCED",
  "FINANCED",
  "PARTIALLY_PAID",
  "PAID",
  "DEFAULTED"
]);
const repaymentSourceSchema = z.enum(["MANUAL", "EXTERNAL_REFERENCE"]);

const storeSupplierSchema = z.object({
  name: z.string().min(2),
  status: supplierStatusSchema.default("ACTIVE"),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  county: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional()
});

const programmeSettingSchema = z.object({
  programmeId: z.string(),
  creditTerms: z.string().nullable().optional(),
  depositRateBps: z.number().int().min(0).max(10_000).default(1000),
  installmentCount: z.number().int().min(1).max(60).default(6),
  installmentFrequency: installmentFrequencySchema.default("MONTHLY"),
  flatInterestRateBps: z.number().int().min(0).max(10_000).default(0),
  gracePeriodDays: z.number().int().min(0).max(365).default(30),
  defaultAgentIds: z.array(z.string()).default([]),
  primaryAgentId: z.string().nullable().optional()
});

const storeProductCreateSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
  category: z.string().min(2).default("AGRI_EQUIPMENT"),
  status: productStatusSchema.default("ACTIVE"),
  supplierId: z.string().nullable().optional(),
  description: z.string().min(10),
  imageUrl: z.string().url(),
  sellerName: z.string().min(2).optional(),
  priceCents: z.number().int().min(100),
  depositCents: z.number().int().min(0).default(0),
  currency: z.string().min(3).max(3).default("KES"),
  creditSummary: z.string().optional(),
  fulfilmentSummary: z.string().optional(),
  inventoryCount: z.number().int().min(0).nullable().optional(),
  programmeIds: z.array(z.string()).min(1),
  creditTerms: z.string().optional(),
  programmeSettings: z.array(programmeSettingSchema).min(1).optional()
});

const storeProductUpdateSchema = storeProductCreateSchema
  .omit({ programmeIds: true })
  .partial()
  .extend({
    programmeIds: z.array(z.string()).min(1).optional(),
    creditTerms: z.string().nullable().optional(),
    programmeSettings: z.array(programmeSettingSchema).min(1).optional()
  });

const creditRequestCreateSchema = z.object({
  productId: z.string(),
  programmeId: z.string(),
  distributionAgentId: z.string().optional(),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  phoneNumber: z.string().min(7),
  county: z.string().optional(),
  groupName: z.string().optional(),
  quantity: z.number().int().min(1).max(100).default(1),
  depositCents: z.number().int().min(0).optional(),
  notes: z.string().optional()
});

const bookingRequestCreateSchema = z.object({
  villageAgentId: z.string().optional(),
  programmeId: z.string().optional(),
  serviceType: z.string().min(2),
  preferredDate: z.string().datetime().optional(),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  phoneNumber: z.string().min(7),
  county: z.string().optional(),
  groupName: z.string().optional(),
  notes: z.string().optional()
});

const requestUpdateSchema = z.object({
  status: requestStatusSchema.optional(),
  reviewNotes: z.string().nullable().optional(),
  distributionAgentId: z.string().nullable().optional(),
  financierPartnerId: z.string().nullable().optional(),
  commissionRateBps: z.number().int().min(0).max(5000).optional(),
  repaymentStatus: repaymentStatusSchema.optional()
});

const repaymentCreateSchema = z.object({
  amountCents: z.number().int().min(1),
  installmentId: z.string().optional(),
  source: repaymentSourceSchema.default("MANUAL"),
  provider: z.string().optional(),
  providerReference: z.string().optional(),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().optional()
});

const reportQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  supplierId: z.string().optional(),
  productId: z.string().optional(),
  programmeId: z.string().optional(),
  agentId: z.string().optional(),
  financierPartnerId: z.string().optional(),
  status: z.string().optional()
});

const productInclude = {
  supplier: true,
  programmeLinks: {
    include: {
      programme: {
        include: {
          partner: true,
          partnerLinks: { include: { partner: true }, orderBy: { role: "asc" } }
        }
      },
      defaultAgents: {
        include: {
          villageAgent: true
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
      }
    },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.StoreProductInclude;

const creditRequestInclude = {
  product: {
    include: {
      supplier: true
    }
  },
  programme: {
    include: {
      partner: true
    }
  },
  requester: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  },
  distributionAgent: true,
  financierPartner: true,
  installments: {
    orderBy: { sequence: "asc" }
  },
  repayments: {
    orderBy: { receivedAt: "desc" }
  }
} satisfies Prisma.StoreCreditRequestInclude;

const bookingRequestInclude = {
  villageAgent: true,
  programme: {
    include: {
      partner: true
    }
  }
} satisfies Prisma.AgentBookingRequestInclude;

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `store-product-${Date.now()}`;
}

function storeProductScopeForUser(user: Express.Request["user"]): Prisma.StoreProductWhereInput {
  if (!user) return { id: "__no_access__" };
  if (user.role === "IWL_ADMIN" || user.role === "READ_ONLY") return {};

  return {
    programmeLinks: {
      some: {
        programme: programmeScopeForUser(user)
      }
    }
  };
}

function creditRequestScopeForUser(user: Express.Request["user"]): Prisma.StoreCreditRequestWhereInput {
  if (!user) return { id: "__no_access__" };
  if (user.role === "IWL_ADMIN" || user.role === "READ_ONLY") return {};

  if (user.role === "PARTNER_OFFICER") {
    return user.partnerId
      ? {
          OR: [
            { programme: programmeScopeForUser(user) },
            { financierPartnerId: user.partnerId }
          ]
        }
      : { id: "__no_access__" };
  }

  if (user.role === "LENDER") {
    return user.partnerId
      ? {
          OR: [
            { financierPartnerId: user.partnerId },
            { programme: programmeScopeForUser(user) }
          ]
        }
      : { id: "__no_access__" };
  }

  if (user.role === "MEMBER") {
    return {
      OR: [
        { requesterUserId: user.id },
        { customerEmail: user.email }
      ]
    };
  }

  if (user.role === "GROUP_ACCOUNT") {
    return {
      OR: [
        { requesterUserId: user.id },
        { customerEmail: user.email },
        ...(user.group?.name ? [{ groupName: user.group.name }] : [])
      ]
    };
  }

  return { programme: programmeScopeForUser(user) };
}

function assertCanManageCatalog(user: Express.Request["user"]) {
  if (!user || user.role !== "IWL_ADMIN") {
    throw new ApiHttpError(403, "FORBIDDEN", "Only platform admins can vet suppliers and manage Intelli-Store products.");
  }
}

function assertCanManageStoreOperations(user: Express.Request["user"]) {
  if (!user || user.role !== "IWL_ADMIN") {
    throw new ApiHttpError(403, "FORBIDDEN", "Only platform admins can manage Intelli-Store operations.");
  }
}

function cleanNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function bookingRequestScopeForUser(user: Express.Request["user"]): Prisma.AgentBookingRequestWhereInput {
  if (!user) return { id: "__no_access__" };
  if (user.role === "IWL_ADMIN" || user.role === "READ_ONLY") return {};

  return {
    OR: [
      { programme: programmeScopeForUser(user) },
      { villageAgent: villageAgentScopeForUser(user) }
    ]
  };
}

async function validateProgrammeIds(user: Express.Request["user"], programmeIds: string[]) {
  const uniqueProgrammeIds = Array.from(new Set(programmeIds));
  const programmes = await prisma.programme.findMany({
    where: {
      AND: [{ id: { in: uniqueProgrammeIds } }, programmeScopeForUser(user)]
    },
    select: { id: true }
  });

  if (programmes.length !== uniqueProgrammeIds.length) {
    throw new ApiHttpError(404, "PROGRAMME_NOT_FOUND", "One or more selected programs do not exist or are outside this account.");
  }

  return uniqueProgrammeIds;
}

async function validateSupplierId(user: Express.Request["user"], supplierId?: string | null) {
  if (!supplierId) return null;
  if (!user || user.role !== "IWL_ADMIN") {
    throw new ApiHttpError(403, "FORBIDDEN", "Only platform admins can link vetted suppliers.");
  }

  const supplier = await prisma.storeSupplier.findFirst({
    where: { id: supplierId },
    select: { id: true }
  });

  if (!supplier) {
    throw new ApiHttpError(404, "STORE_SUPPLIER_NOT_FOUND", "Selected supplier does not exist.");
  }

  return supplier.id;
}

function deriveProgrammeSettings({
  programmeIds,
  creditTerms,
  programmeSettings
}: {
  programmeIds?: string[];
  creditTerms?: string | null;
  programmeSettings?: Array<z.infer<typeof programmeSettingSchema>>;
}) {
  if (programmeSettings?.length) {
    const byProgramme = new Map<string, z.infer<typeof programmeSettingSchema>>();
    programmeSettings.forEach((setting) => byProgramme.set(setting.programmeId, setting));
    return Array.from(byProgramme.values());
  }

  return (programmeIds ?? []).map((programmeId) => ({
    programmeId,
    creditTerms,
    depositRateBps: 1000,
    installmentCount: 6,
    installmentFrequency: "MONTHLY" as const,
    flatInterestRateBps: 0,
    gracePeriodDays: 30,
    defaultAgentIds: [],
    primaryAgentId: null
  }));
}

async function validateProgrammeSettings(
  user: Express.Request["user"],
  settings: Array<z.infer<typeof programmeSettingSchema>>
) {
  const programmeIds = await validateProgrammeIds(
    user,
    settings.map((setting) => setting.programmeId)
  );
  const validProgrammeIds = new Set(programmeIds);

  const uniqueSettings = settings.filter((setting, index, rows) =>
    rows.findIndex((candidate) => candidate.programmeId === setting.programmeId) === index
  );

  for (const setting of uniqueSettings) {
    if (!validProgrammeIds.has(setting.programmeId)) {
      throw new ApiHttpError(404, "PROGRAMME_NOT_FOUND", "One or more selected programs do not exist or are outside this account.");
    }

    const defaultAgentIds = Array.from(new Set(setting.defaultAgentIds ?? []));
    const primaryAgentId = setting.primaryAgentId ?? defaultAgentIds[0] ?? null;

    if (primaryAgentId && !defaultAgentIds.includes(primaryAgentId)) {
      throw new ApiHttpError(400, "PRIMARY_VA_REQUIRED", "The primary VA must be included in the default VA list.");
    }

    if (defaultAgentIds.length > 0) {
      const agents = await prisma.villageAgent.findMany({
        where: {
          AND: [
            {
              id: { in: defaultAgentIds },
              programmeId: setting.programmeId,
              status: "ACTIVE"
            },
            villageAgentScopeForUser(user)
          ]
        },
        select: { id: true }
      });

      if (agents.length !== defaultAgentIds.length) {
        throw new ApiHttpError(404, "VILLAGE_AGENT_NOT_FOUND", "One or more default VAs are not active in the selected program.");
      }
    }

    setting.defaultAgentIds = defaultAgentIds;
    setting.primaryAgentId = primaryAgentId;
  }

  return uniqueSettings;
}

async function replaceProductProgrammeLinks(
  tx: Prisma.TransactionClient,
  productId: string,
  settings: Array<z.infer<typeof programmeSettingSchema>>
) {
  await tx.storeProductProgramme.deleteMany({ where: { productId } });

  for (const setting of settings) {
    await tx.storeProductProgramme.create({
      data: {
        productId,
        programmeId: setting.programmeId,
        creditTerms: setting.creditTerms ?? undefined,
        depositRateBps: setting.depositRateBps,
        installmentCount: setting.installmentCount,
        installmentFrequency: setting.installmentFrequency,
        flatInterestRateBps: setting.flatInterestRateBps,
        gracePeriodDays: setting.gracePeriodDays,
        defaultAgents: {
          create: (setting.defaultAgentIds ?? []).map((agentId) => ({
            villageAgentId: agentId,
            isPrimary: agentId === setting.primaryAgentId
          }))
        }
      }
    });
  }
}

function calculateCommissionCents(requestedAmountCents: number, commissionRateBps: number) {
  return Math.floor((requestedAmountCents * commissionRateBps) / 10_000);
}

function humanizeStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}

async function resolveDistributionAgentId({
  requestedAgentId,
  programmeId,
  user,
  publicOnly
}: {
  requestedAgentId?: string | null;
  programmeId: string;
  user?: Express.Request["user"];
  publicOnly?: boolean;
}) {
  const where: Prisma.VillageAgentWhereInput = {
    AND: [
      {
        programmeId,
        status: "ACTIVE",
        ...(requestedAgentId ? { id: requestedAgentId } : {})
      },
      publicOnly ? { programme: { publicStatus: "ONGOING" } } : {},
      user ? villageAgentScopeForUser(user) : {}
    ]
  };

  const agent = await prisma.villageAgent.findFirst({
    where,
    orderBy: [{ county: "asc" }, { name: "asc" }],
    select: { id: true }
  });

  if (requestedAgentId && !agent) {
    throw new ApiHttpError(404, "VILLAGE_AGENT_NOT_FOUND", "Selected VA / CBT cannot distribute this product request.");
  }

  return agent?.id;
}

async function resolveProductDefaultAgentId({
  productId,
  programmeId,
  user,
  publicOnly
}: {
  productId: string;
  programmeId: string;
  user?: Express.Request["user"];
  publicOnly?: boolean;
}) {
  const link = await prisma.storeProductProgramme.findFirst({
    where: {
      productId,
      programmeId,
      programme: publicOnly ? { publicStatus: "ONGOING" } : programmeScopeForUser(user)
    },
    include: {
      defaultAgents: {
        where: {
          isPrimary: true,
          villageAgent: {
            status: "ACTIVE",
            programmeId,
            ...(publicOnly ? { programme: { publicStatus: "ONGOING" } } : {})
          }
        },
        include: { villageAgent: true },
        orderBy: { createdAt: "asc" },
        take: 1
      }
    }
  });

  const agent = link?.defaultAgents[0]?.villageAgent;

  if (!agent) return undefined;
  if (user) {
    const scopedAgent = await prisma.villageAgent.findFirst({
      where: {
        AND: [{ id: agent.id }, villageAgentScopeForUser(user)]
      },
      select: { id: true }
    });

    return scopedAgent?.id;
  }

  return agent.id;
}

async function assertFinancierPartnerAccess({
  financierPartnerId,
  programmeId,
  user
}: {
  financierPartnerId: string;
  programmeId: string;
  user: Express.Request["user"];
}) {
  if (!user) {
    throw new ApiHttpError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  if (user.role === "GROUP_ACCOUNT" || user.role === "MEMBER") {
    throw new ApiHttpError(403, "FORBIDDEN", "Groups and members can request products, but cannot finance store requests.");
  }

  if (user.role === "LENDER" && financierPartnerId !== user.partnerId) {
    throw new ApiHttpError(403, "FORBIDDEN", "Lender users can only finance requests through their own lender account.");
  }

  const financier = await prisma.partner.findFirst({
    where: {
      AND: [
        {
          id: financierPartnerId,
          status: "ACTIVE",
          OR: [
            { programmes: { some: { id: programmeId } } },
            { programmeLinks: { some: { programmeId } } }
          ]
        },
        partnerScopeForUser(user)
      ]
    },
    select: { id: true }
  });

  if (!financier) {
    throw new ApiHttpError(404, "FINANCIER_NOT_FOUND", "Selected financing partner is not linked to this product program.");
  }

  return financier.id;
}

function splitCents(total: number, count: number) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_value, index) => base + (index < remainder ? 1 : 0));
}

function addInstallmentInterval(start: Date, frequency: z.infer<typeof installmentFrequencySchema>, index: number) {
  const dueDate = new Date(start);
  if (frequency === "WEEKLY") {
    dueDate.setDate(dueDate.getDate() + 7 * index);
  } else if (frequency === "BIWEEKLY") {
    dueDate.setDate(dueDate.getDate() + 14 * index);
  } else {
    dueDate.setMonth(dueDate.getMonth() + index);
  }

  return dueDate;
}

async function generateInstallmentSchedule(tx: Prisma.TransactionClient, requestId: string) {
  const existingInstallments = await tx.storeCreditInstallment.count({ where: { requestId } });
  if (existingInstallments > 0) return null;

  const request = await tx.storeCreditRequest.findUnique({
    where: { id: requestId },
    include: {
      product: {
        include: {
          programmeLinks: true
        }
      }
    }
  });

  if (!request || !request.financierPartnerId) return null;

  const terms = request.product.programmeLinks.find((link) => link.programmeId === request.programmeId);
  const installmentCount = terms?.installmentCount ?? 6;
  const principalCents =
    request.financedAmountCents > 0
      ? request.financedAmountCents
      : Math.max(0, request.requestedAmountCents - request.depositCents);

  if (principalCents <= 0 || installmentCount <= 0) return null;

  const interestCents = Math.floor((principalCents * (terms?.flatInterestRateBps ?? 0)) / 10_000);
  const principalParts = splitCents(principalCents, installmentCount);
  const interestParts = splitCents(interestCents, installmentCount);
  const firstDueDate = new Date(request.financedAt ?? new Date());
  firstDueDate.setDate(firstDueDate.getDate() + (terms?.gracePeriodDays ?? 30));

  await tx.storeCreditInstallment.createMany({
    data: principalParts.map((principalPart, index) => {
      const interestPart = interestParts[index] ?? 0;
      return {
        requestId: request.id,
        sequence: index + 1,
        dueDate: addInstallmentInterval(
          firstDueDate,
          installmentFrequencySchema.parse(terms?.installmentFrequency ?? "MONTHLY"),
          index
        ),
        principalCents: principalPart,
        interestCents: interestPart,
        totalDueCents: principalPart + interestPart
      };
    })
  });

  return request.id;
}

async function refreshRequestRepaymentStatus(tx: Prisma.TransactionClient, requestId: string, now = new Date()) {
  const installments = await tx.storeCreditInstallment.findMany({
    where: { requestId },
    select: { id: true, totalDueCents: true, paidCents: true }
  });

  const totalDueCents = installments.reduce((sum, installment) => sum + installment.totalDueCents, 0);
  const paidCents = installments.reduce((sum, installment) => sum + installment.paidCents, 0);

  const repaymentStatus =
    totalDueCents > 0 && paidCents >= totalDueCents
      ? "PAID"
      : paidCents > 0
        ? "PARTIALLY_PAID"
        : "FINANCED";

  await tx.storeCreditRequest.update({
    where: { id: requestId },
    data: {
      repaymentStatus,
      paidAt: repaymentStatus === "PAID" ? now : null
    }
  });

  return repaymentStatus;
}

async function allocateRepayment(
  tx: Prisma.TransactionClient,
  {
    requestId,
    amountCents,
    installmentId,
    source,
    provider,
    providerReference,
    receivedAt,
    notes,
    recordedByUserId
  }: z.infer<typeof repaymentCreateSchema> & {
    requestId: string;
    recordedByUserId?: string | null;
  }
) {
  const orderedInstallments = await tx.storeCreditInstallment.findMany({
    where: { requestId },
    orderBy: { sequence: "asc" }
  });

  const installments = installmentId
    ? [
        ...orderedInstallments.filter((installment) => installment.id === installmentId),
        ...orderedInstallments.filter((installment) => installment.id !== installmentId)
      ]
    : orderedInstallments;

  if (installmentId && installments[0]?.id !== installmentId) {
    throw new ApiHttpError(404, "INSTALLMENT_NOT_FOUND", "Selected installment does not exist for this request.");
  }

  let remainingCents = amountCents;
  const createdRepayments = [];
  const now = receivedAt ? new Date(receivedAt) : new Date();

  for (const installment of installments) {
    if (remainingCents <= 0) break;
    const installmentOutstanding = installment.totalDueCents - installment.paidCents;
    if (installmentOutstanding <= 0) continue;

    const allocationCents = Math.min(remainingCents, installmentOutstanding);
    const nextPaidCents = installment.paidCents + allocationCents;
    const nextStatus =
      nextPaidCents >= installment.totalDueCents
        ? "PAID"
        : nextPaidCents > 0
          ? "PARTIALLY_PAID"
          : "PENDING";

    const repayment = await tx.storeCreditRepayment.create({
      data: {
        requestId,
        installmentId: installment.id,
        amountCents: allocationCents,
        source,
        provider,
        providerReference,
        receivedAt: now,
        notes,
        recordedByUserId: recordedByUserId ?? undefined
      }
    });

    createdRepayments.push(repayment);
    await tx.storeCreditInstallment.update({
      where: { id: installment.id },
      data: {
        paidCents: nextPaidCents,
        status: nextStatus,
        paidAt: nextStatus === "PAID" ? now : null
      }
    });

    remainingCents -= allocationCents;
  }

  if (remainingCents > 0) {
    throw new ApiHttpError(400, "REPAYMENT_EXCEEDS_OUTSTANDING", "Repayment amount exceeds the outstanding loan balance.");
  }

  await refreshRequestRepaymentStatus(tx, requestId, now);
  return createdRepayments;
}

async function createCreditRequestFromPayload({
  body,
  user,
  publicOnly
}: {
  body: z.infer<typeof creditRequestCreateSchema>;
  user?: Express.Request["user"];
  publicOnly?: boolean;
}) {
  const product = await prisma.storeProduct.findFirst({
    where: {
      id: body.productId,
      status: "ACTIVE",
      programmeLinks: {
        some: {
          programmeId: body.programmeId,
          programme: publicOnly ? { publicStatus: "ONGOING" } : programmeScopeForUser(user)
        }
      }
    },
    select: {
      id: true,
      name: true,
      priceCents: true,
      depositCents: true,
      inventoryCount: true
    }
  });

  if (!product) {
    throw new ApiHttpError(404, "STORE_PRODUCT_NOT_FOUND", "Store product is not available through the selected program.");
  }
  if (product.inventoryCount !== null) {
    const reserved = await prisma.storeCreditRequest.aggregate({
      _sum: { quantity: true },
      where: {
        productId: product.id,
        status: { in: ["PENDING", "UNDER_REVIEW", "APPROVED"] }
      }
    });
    const availableQuantity = product.inventoryCount - (reserved._sum.quantity ?? 0);

    if (availableQuantity < body.quantity) {
      throw new ApiHttpError(
        400,
        "INSUFFICIENT_INVENTORY",
        `${product.name} has ${Math.max(0, availableQuantity)} unit${availableQuantity === 1 ? "" : "s"} available.`
      );
    }
  }

  const requestedAmountCents = product.priceCents * body.quantity;
  const depositCents = body.depositCents ?? product.depositCents * body.quantity;
  const customerFields =
    !publicOnly && user?.role === "MEMBER"
      ? {
          customerName: user.member?.fullName ?? user.name,
          customerEmail: user.email,
          phoneNumber: user.member?.phone ?? body.phoneNumber,
          groupName: user.group?.name ?? body.groupName
        }
      : {
          customerName: body.customerName,
          customerEmail: body.customerEmail,
          phoneNumber: body.phoneNumber,
          groupName: body.groupName
        };

  if (depositCents > requestedAmountCents) {
    throw new ApiHttpError(400, "DEPOSIT_TOO_HIGH", "Deposit cannot exceed the requested product amount.");
  }

  const requestedDistributionAgentId =
    !publicOnly && user?.role === "IWL_ADMIN" ? body.distributionAgentId : undefined;
  const distributionAgentId = requestedDistributionAgentId
    ? await resolveDistributionAgentId({
        requestedAgentId: requestedDistributionAgentId,
        programmeId: body.programmeId,
        user,
        publicOnly
      })
    : (await resolveProductDefaultAgentId({
        productId: product.id,
        programmeId: body.programmeId,
        user,
        publicOnly
      })) ??
      (await resolveDistributionAgentId({
        programmeId: body.programmeId,
        user,
        publicOnly
      }));
  const commissionRateBps = 500;

  return prisma.storeCreditRequest.create({
    data: {
      productId: product.id,
      programmeId: body.programmeId,
      requesterUserId: user?.id,
      distributionAgentId,
      customerName: customerFields.customerName,
      customerEmail: customerFields.customerEmail,
      phoneNumber: customerFields.phoneNumber,
      county: body.county,
      groupName: customerFields.groupName,
      quantity: body.quantity,
      requestedAmountCents,
      depositCents,
      commissionRateBps,
      commissionCents: distributionAgentId
        ? calculateCommissionCents(requestedAmountCents, commissionRateBps)
        : 0,
      notes: body.notes
    },
    include: creditRequestInclude
  });
}

function publicProductInclude(): Prisma.StoreProductInclude {
  return {
    supplier: true,
    programmeLinks: {
      where: {
        programme: { publicStatus: "ONGOING" }
      },
      include: {
        programme: {
          include: {
            partner: true,
            partnerLinks: { include: { partner: true }, orderBy: { role: "asc" } },
            _count: {
              select: {
                groups: true,
                groupLinks: true,
                villageAgents: true
              }
            }
          }
        },
        defaultAgents: {
          include: { villageAgent: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
        }
      },
      orderBy: { createdAt: "asc" }
    }
  };
}

router.get("/public/intelli-store", async (_req, res, next) => {
  try {
    const [products, agents] = await Promise.all([
      prisma.storeProduct.findMany({
        where: {
          status: "ACTIVE",
          programmeLinks: {
            some: {
              programme: { publicStatus: "ONGOING" }
            }
          }
        },
        orderBy: { createdAt: "desc" },
        include: publicProductInclude()
      }),
      prisma.villageAgent.findMany({
        where: {
          status: "ACTIVE",
          programme: { publicStatus: "ONGOING" }
        },
        orderBy: [{ county: "asc" }, { name: "asc" }],
        include: {
          programme: { include: { partner: true } },
          groups: {
            select: {
              id: true,
              name: true,
              code: true,
              county: true,
              phase: true
            },
            orderBy: { name: "asc" }
          },
          _count: { select: { groups: true } }
        }
      })
    ]);

    ok(res, {
      products,
      agents,
      serviceTypes: [
        "Group onboarding",
        "Business coaching",
        "Digital records training",
        "Market linkage visit"
      ]
    });
  } catch (error) {
    next(error);
  }
});

router.post("/public/intelli-store/credit-requests", async (req, res, next) => {
  try {
    const body = creditRequestCreateSchema.parse(req.body);
    const creditRequest = await createCreditRequestFromPayload({
      body,
      publicOnly: true
    });

    await appendAuditEvent({
      actorUserId: null,
      entityType: "STORE_CREDIT_REQUEST",
      entityId: creditRequest.id,
      type: "STORE_CREDIT_REQUESTED",
      payload: creditRequest
    });

    ok(res.status(201), creditRequest);
  } catch (error) {
    next(error);
  }
});

router.post("/intelli-store/credit-requests", requireAuth("store:write"), async (req, res, next) => {
  try {
    const requestBody =
      req.user?.role === "MEMBER"
        ? {
            ...req.body,
            customerName: req.user.member?.fullName ?? req.user.name,
            customerEmail: req.user.email,
            phoneNumber: req.user.member?.phone ?? req.body.phoneNumber,
            groupName: req.user.group?.name ?? req.body.groupName
          }
        : req.body;
    const body = creditRequestCreateSchema.parse(requestBody);
    const creditRequest = await createCreditRequestFromPayload({
      body,
      user: req.user
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "STORE_CREDIT_REQUEST",
      entityId: creditRequest.id,
      type: "STORE_CREDIT_REQUESTED",
      payload: creditRequest
    });

    await createNotification({
      userId: creditRequest.requesterUserId,
      title: "Store request submitted",
      body: `${creditRequest.product.name} is waiting for programme review.`,
      type: "STORE",
      href: "/dashboard/intelli-store"
    }).catch(() => null);

    ok(res.status(201), creditRequest);
  } catch (error) {
    next(error);
  }
});

router.post("/public/intelli-store/booking-requests", async (req, res, next) => {
  try {
    const body = bookingRequestCreateSchema.parse(req.body);

    if (!body.villageAgentId && !body.programmeId) {
      throw new ApiHttpError(400, "BOOKING_TARGET_REQUIRED", "Booking requests require a VA / CBT or program.");
    }

    const agent = body.villageAgentId
      ? await prisma.villageAgent.findFirst({
          where: {
            id: body.villageAgentId,
            status: "ACTIVE",
            programme: { publicStatus: "ONGOING" }
          },
          select: {
            id: true,
            programmeId: true
          }
        })
      : null;

    if (body.villageAgentId && !agent) {
      throw new ApiHttpError(404, "VILLAGE_AGENT_NOT_FOUND", "Selected VA / CBT is not available for booking.");
    }

    const programmeId = body.programmeId ?? agent?.programmeId;
    if (!programmeId) {
      throw new ApiHttpError(400, "PROGRAMME_REQUIRED", "Booking requests require a public program.");
    }

    if (agent?.programmeId && body.programmeId && agent.programmeId !== body.programmeId) {
      throw new ApiHttpError(400, "BOOKING_PROGRAM_MISMATCH", "Selected VA / CBT is not linked to the selected program.");
    }

    const programme = await prisma.programme.findFirst({
      where: { id: programmeId, publicStatus: "ONGOING" },
      select: { id: true }
    });

    if (!programme) {
      throw new ApiHttpError(404, "PROGRAMME_NOT_FOUND", "Selected program is not available for booking.");
    }

    const bookingRequest = await prisma.agentBookingRequest.create({
      data: {
        villageAgentId: agent?.id,
        programmeId: programme.id,
        serviceType: body.serviceType,
        preferredDate: body.preferredDate ? new Date(body.preferredDate) : undefined,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        phoneNumber: body.phoneNumber,
        county: body.county,
        groupName: body.groupName,
        notes: body.notes
      },
      include: bookingRequestInclude
    });

    await appendAuditEvent({
      actorUserId: null,
      entityType: "AGENT_BOOKING_REQUEST",
      entityId: bookingRequest.id,
      type: "AGENT_BOOKING_REQUESTED",
      payload: bookingRequest
    });

    ok(res.status(201), bookingRequest);
  } catch (error) {
    next(error);
  }
});

router.get("/intelli-store/suppliers", requireAuth("store:read"), async (_req, res, next) => {
  try {
    const suppliers = await prisma.storeSupplier.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { products: true } }
      }
    });

    ok(res, suppliers);
  } catch (error) {
    next(error);
  }
});

router.post("/intelli-store/suppliers", requireAuth("store:write"), async (req, res, next) => {
  try {
    assertCanManageCatalog(req.user);
    const body = storeSupplierSchema.parse(req.body);

    const supplier = await prisma.storeSupplier.create({
      data: {
        name: body.name,
        status: body.status,
        contactName: body.contactName,
        contactPhone: body.contactPhone,
        contactEmail: body.contactEmail,
        county: body.county,
        location: body.location,
        notes: body.notes
      },
      include: {
        _count: { select: { products: true } }
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "STORE_SUPPLIER",
      entityId: supplier.id,
      type: "STORE_SUPPLIER_CREATED",
      payload: supplier
    });

    ok(res.status(201), supplier);
  } catch (error) {
    next(error);
  }
});

router.patch("/intelli-store/suppliers/:id", requireAuth("store:write"), async (req, res, next) => {
  try {
    assertCanManageCatalog(req.user);
    const supplierId = z.string().parse(req.params.id);
    const body = storeSupplierSchema.partial().parse(req.body);
    const existing = await prisma.storeSupplier.findUnique({
      where: { id: supplierId },
      select: { id: true }
    });

    if (!existing) {
      throw new ApiHttpError(404, "STORE_SUPPLIER_NOT_FOUND", "Store supplier does not exist.");
    }

    const supplier = await prisma.storeSupplier.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        status: body.status,
        contactName: cleanNullable(body.contactName),
        contactPhone: cleanNullable(body.contactPhone),
        contactEmail: cleanNullable(body.contactEmail),
        county: cleanNullable(body.county),
        location: cleanNullable(body.location),
        notes: cleanNullable(body.notes)
      },
      include: {
        _count: { select: { products: true } }
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "STORE_SUPPLIER",
      entityId: supplier.id,
      type: "STORE_SUPPLIER_UPDATED",
      payload: supplier
    });

    ok(res, supplier);
  } catch (error) {
    next(error);
  }
});

router.get("/intelli-store/products", requireAuth("store:read"), async (req, res, next) => {
  try {
    const products = await prisma.storeProduct.findMany({
      where: storeProductScopeForUser(req.user),
      orderBy: { createdAt: "desc" },
      include: productInclude
    });

    ok(res, products);
  } catch (error) {
    next(error);
  }
});

router.post("/intelli-store/products", requireAuth("store:write"), async (req, res, next) => {
  try {
    assertCanManageCatalog(req.user);
    const body = storeProductCreateSchema.parse(req.body);
    const programmeSettings = await validateProgrammeSettings(
      req.user,
      deriveProgrammeSettings({
        programmeIds: body.programmeIds,
        creditTerms: body.creditTerms,
        programmeSettings: body.programmeSettings
      })
    );
    const supplierId = await validateSupplierId(req.user, body.supplierId);
    const slug = body.slug ?? `${slugify(body.name)}-${Date.now().toString(36)}`;

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.storeProduct.create({
        data: {
          name: body.name,
          slug,
          category: body.category,
          status: body.status,
          supplierId,
          description: body.description,
          imageUrl: body.imageUrl,
          sellerName: body.sellerName,
          priceCents: body.priceCents,
          depositCents: body.depositCents,
          currency: body.currency,
          creditSummary: body.creditSummary,
          fulfilmentSummary: body.fulfilmentSummary,
          inventoryCount: body.inventoryCount
        },
        select: { id: true }
      });

      await replaceProductProgrammeLinks(tx, created.id, programmeSettings);

      return tx.storeProduct.findUniqueOrThrow({
        where: { id: created.id },
        include: productInclude
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "STORE_PRODUCT",
      entityId: product.id,
      type: "STORE_PRODUCT_CREATED",
      payload: product
    });

    ok(res.status(201), product);
  } catch (error) {
    next(error);
  }
});

router.patch("/intelli-store/products/:id", requireAuth("store:write"), async (req, res, next) => {
  try {
    assertCanManageCatalog(req.user);
    const productId = z.string().parse(req.params.id);
    const body = storeProductUpdateSchema.parse(req.body);
    const existing = await prisma.storeProduct.findFirst({
      where: {
        AND: [{ id: productId }, storeProductScopeForUser(req.user)]
      },
      select: { id: true, imageUrl: true }
    });

    if (!existing) {
      throw new ApiHttpError(404, "STORE_PRODUCT_NOT_FOUND", "Store product does not exist or is outside this account.");
    }

    if (!((body.imageUrl ?? existing.imageUrl) || "").trim()) {
      throw new ApiHttpError(400, "PRODUCT_IMAGE_REQUIRED", "Store products require a main image.");
    }

    const programmeIds = body.programmeIds
      ? await validateProgrammeIds(req.user, body.programmeIds)
      : undefined;
    const programmeSettings =
      body.programmeSettings || programmeIds
        ? await validateProgrammeSettings(
            req.user,
            deriveProgrammeSettings({
              programmeIds,
              creditTerms: body.creditTerms,
              programmeSettings: body.programmeSettings
            })
          )
        : undefined;
    const supplierId = body.supplierId === undefined ? undefined : await validateSupplierId(req.user, body.supplierId);

    const product = await prisma.$transaction(async (tx) => {
      await tx.storeProduct.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          slug: body.slug,
          category: body.category,
          status: body.status,
          supplierId,
          description: body.description,
          imageUrl: body.imageUrl === undefined ? undefined : body.imageUrl,
          sellerName: body.sellerName === undefined ? undefined : body.sellerName,
          priceCents: body.priceCents,
          depositCents: body.depositCents,
          currency: body.currency,
          creditSummary: body.creditSummary === undefined ? undefined : body.creditSummary,
          fulfilmentSummary: body.fulfilmentSummary === undefined ? undefined : body.fulfilmentSummary,
          inventoryCount: body.inventoryCount === undefined ? undefined : body.inventoryCount
        }
      });

      if (programmeSettings) {
        await replaceProductProgrammeLinks(tx, existing.id, programmeSettings);
      } else if (body.creditTerms !== undefined) {
        await tx.storeProductProgramme.updateMany({
          where: { productId: existing.id },
          data: { creditTerms: body.creditTerms }
        });
      }

      return tx.storeProduct.findUniqueOrThrow({
        where: { id: existing.id },
        include: productInclude
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "STORE_PRODUCT",
      entityId: product.id,
      type: "STORE_PRODUCT_UPDATED",
      payload: product
    });

    ok(res, product);
  } catch (error) {
    next(error);
  }
});

router.get("/intelli-store/credit-requests", requireAuth("store:read"), async (req, res, next) => {
  try {
    const requests = await prisma.storeCreditRequest.findMany({
      where: creditRequestScopeForUser(req.user),
      orderBy: { createdAt: "desc" },
      include: creditRequestInclude
    });

    ok(res, requests);
  } catch (error) {
    next(error);
  }
});

router.patch("/intelli-store/credit-requests/:id", requireAuth("store:write"), async (req, res, next) => {
  try {
    const requestId = z.string().parse(req.params.id);
    const body = requestUpdateSchema.parse(req.body);
    const existing = await prisma.storeCreditRequest.findFirst({
      where: {
        id: requestId,
        ...creditRequestScopeForUser(req.user)
      },
      select: {
        id: true,
        requesterUserId: true,
        productId: true,
        programmeId: true,
        quantity: true,
        requestedAmountCents: true,
        depositCents: true,
        distributionAgentId: true,
        financierPartnerId: true,
        commissionRateBps: true,
        status: true,
        repaymentStatus: true,
        financedAt: true,
        fulfilledAt: true,
        paidAt: true
      }
    });

    if (!existing) {
      throw new ApiHttpError(404, "STORE_CREDIT_REQUEST_NOT_FOUND", "Credit request does not exist or is outside this account.");
    }

    const isRequester = req.user?.role === "GROUP_ACCOUNT" || req.user?.role === "MEMBER";
    const isRequesterCancellation = isRequester && body.status === "CANCELLED";

    if (req.user?.role === "GROUP_ACCOUNT" || req.user?.role === "MEMBER") {
      const allowedStatus = !body.status || body.status === "CANCELLED";
      const onlyRequesterFields =
        body.distributionAgentId === undefined &&
        body.financierPartnerId === undefined &&
        body.commissionRateBps === undefined &&
        body.repaymentStatus === undefined;

      if (!allowedStatus || !onlyRequesterFields) {
        throw new ApiHttpError(403, "FORBIDDEN", "Group and member accounts can submit or cancel their own store requests only.");
      }
    }

    if (body.status !== undefined && req.user?.role !== "IWL_ADMIN" && !isRequesterCancellation) {
      throw new ApiHttpError(403, "FORBIDDEN", "Only platform admins can vet, approve, reject, and fulfil store requests.");
    }

    if (body.distributionAgentId !== undefined && req.user?.role !== "IWL_ADMIN") {
      throw new ApiHttpError(403, "FORBIDDEN", "Only platform admins can assign distribution agents.");
    }

    if (body.commissionRateBps !== undefined && req.user?.role !== "IWL_ADMIN") {
      throw new ApiHttpError(403, "FORBIDDEN", "Only platform admins can set agent commission rates.");
    }

    if (body.repaymentStatus !== undefined && req.user?.role !== "IWL_ADMIN") {
      throw new ApiHttpError(403, "FORBIDDEN", "Only platform admins can manually change repayment status.");
    }

    const nextDistributionAgentId =
      body.distributionAgentId === undefined
        ? existing.distributionAgentId
        : body.distributionAgentId
          ? await resolveDistributionAgentId({
              requestedAgentId: body.distributionAgentId,
              programmeId: existing.programmeId,
              user: req.user
            })
          : null;

    const nextCommissionRateBps = body.commissionRateBps ?? existing.commissionRateBps;
    const nextFinancierPartnerId =
      body.financierPartnerId === undefined
        ? existing.financierPartnerId
        : body.financierPartnerId
          ? await assertFinancierPartnerAccess({
              financierPartnerId: body.financierPartnerId,
              programmeId: existing.programmeId,
              user: req.user
            })
          : null;
    const financierChanged = body.financierPartnerId !== undefined && nextFinancierPartnerId !== existing.financierPartnerId;
    const repaymentStatus =
      body.repaymentStatus ??
      (financierChanged
        ? nextFinancierPartnerId
          ? "FINANCED"
          : "NOT_FINANCED"
        : undefined);
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const shouldDecrementInventory = body.status === "FULFILLED" && existing.status !== "FULFILLED";
      const shouldRestoreInventory =
        existing.status === "FULFILLED" && body.status !== undefined && body.status !== "FULFILLED";

      if (shouldDecrementInventory) {
        const product = await tx.storeProduct.findUnique({
          where: { id: existing.productId },
          select: { id: true, name: true, inventoryCount: true }
        });

        if (!product) {
          throw new ApiHttpError(404, "STORE_PRODUCT_NOT_FOUND", "Request product no longer exists.");
        }
        if (product.inventoryCount !== null && product.inventoryCount < existing.quantity) {
          throw new ApiHttpError(
            400,
            "INSUFFICIENT_INVENTORY",
            `${product.name} has ${product.inventoryCount} unit${product.inventoryCount === 1 ? "" : "s"} available.`
          );
        }
        if (product.inventoryCount !== null) {
          await tx.storeProduct.update({
            where: { id: product.id },
            data: { inventoryCount: { decrement: existing.quantity } }
          });
        }
      } else if (shouldRestoreInventory) {
        const product = await tx.storeProduct.findUnique({
          where: { id: existing.productId },
          select: { id: true, inventoryCount: true }
        });

        if (product && product.inventoryCount !== null) {
          await tx.storeProduct.update({
            where: { id: existing.productId },
            data: { inventoryCount: { increment: existing.quantity } }
          });
        }
      }

      const updatedRequest = await tx.storeCreditRequest.update({
        where: { id: existing.id },
        data: {
          status: body.status,
          reviewNotes: body.reviewNotes === undefined ? undefined : body.reviewNotes,
          distributionAgentId:
            body.distributionAgentId === undefined ? undefined : nextDistributionAgentId,
          financierPartnerId:
            body.financierPartnerId === undefined ? undefined : nextFinancierPartnerId,
          financedAmountCents:
            body.financierPartnerId === undefined
              ? undefined
              : nextFinancierPartnerId
                ? Math.max(0, existing.requestedAmountCents - existing.depositCents)
                : 0,
          commissionRateBps:
            body.commissionRateBps === undefined ? undefined : nextCommissionRateBps,
          commissionCents:
            body.distributionAgentId === undefined && body.commissionRateBps === undefined
              ? undefined
              : nextDistributionAgentId
                ? calculateCommissionCents(existing.requestedAmountCents, nextCommissionRateBps)
                : 0,
          repaymentStatus,
          financedAt:
            body.financierPartnerId === undefined
              ? undefined
              : nextFinancierPartnerId
                ? existing.financedAt ?? now
                : null,
          fulfilledAt:
            body.status === undefined
              ? undefined
              : body.status === "FULFILLED"
                ? existing.fulfilledAt ?? now
                : null,
          paidAt:
            repaymentStatus === undefined
              ? undefined
              : repaymentStatus === "PAID"
                ? existing.paidAt ?? now
                : null
        },
        include: creditRequestInclude
      });

      const isFinancedOrApproved =
        Boolean(updatedRequest.financierPartnerId) &&
        (financierChanged ||
          updatedRequest.status === "APPROVED" ||
          updatedRequest.status === "FULFILLED" ||
          updatedRequest.repaymentStatus === "FINANCED" ||
          updatedRequest.repaymentStatus === "PARTIALLY_PAID");

      if (isFinancedOrApproved) {
        await generateInstallmentSchedule(tx, updatedRequest.id);
        return tx.storeCreditRequest.findUniqueOrThrow({
          where: { id: updatedRequest.id },
          include: creditRequestInclude
        });
      }

      return updatedRequest;
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "STORE_CREDIT_REQUEST",
      entityId: updated.id,
      type: "STORE_CREDIT_REQUEST_UPDATED",
      payload: updated
    });

    const statusChanged = body.status !== undefined && body.status !== existing.status;
    const repaymentChanged = updated.repaymentStatus !== existing.repaymentStatus;
    const financingChanged = updated.financierPartnerId !== existing.financierPartnerId;
    if (statusChanged || repaymentChanged || financingChanged) {
      await createNotification({
        userId: updated.requesterUserId,
        title: "Store request updated",
        body: `${updated.product.name} is now ${humanizeStatus(updated.status)}.`,
        type: "STORE",
        href: "/dashboard/intelli-store"
      }).catch(() => null);
    }

    ok(res, updated);
  } catch (error) {
    next(error);
  }
});

router.post("/intelli-store/credit-requests/:id/repayments", requireAuth("store:write"), async (req, res, next) => {
  try {
    assertCanManageStoreOperations(req.user);
    const requestId = z.string().parse(req.params.id);
    const body = repaymentCreateSchema.parse(req.body);
    const existing = await prisma.storeCreditRequest.findFirst({
      where: {
        id: requestId,
        ...creditRequestScopeForUser(req.user)
      },
      select: {
        id: true,
        financierPartnerId: true,
        repaymentStatus: true,
        financedAmountCents: true,
        requestedAmountCents: true,
        depositCents: true
      }
    });

    if (!existing) {
      throw new ApiHttpError(404, "STORE_CREDIT_REQUEST_NOT_FOUND", "Credit request does not exist or is outside this account.");
    }

    if (!existing.financierPartnerId) {
      throw new ApiHttpError(400, "STORE_CREDIT_NOT_FINANCED", "Repayments can only be posted after a request is financed.");
    }

    const updated = await prisma.$transaction(async (tx) => {
      await generateInstallmentSchedule(tx, existing.id);
      await allocateRepayment(tx, {
        ...body,
        requestId: existing.id,
        recordedByUserId: req.user?.id
      });

      return tx.storeCreditRequest.findUniqueOrThrow({
        where: { id: existing.id },
        include: creditRequestInclude
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "STORE_CREDIT_REQUEST",
      entityId: updated.id,
      type: "STORE_CREDIT_REPAYMENT_POSTED",
      payload: updated
    });

    await createNotification({
      userId: updated.requesterUserId,
      title: "Loan repayment posted",
      body: `A repayment has been recorded for ${updated.product.name}.`,
      type: "STORE",
      href: "/dashboard/intelli-store"
    }).catch(() => null);

    ok(res.status(201), updated);
  } catch (error) {
    next(error);
  }
});

router.get("/intelli-store/reports/sales", requireAuth("store:read"), async (req, res, next) => {
  try {
    const filters = reportQuerySchema.parse(req.query);
    const requests = await prisma.storeCreditRequest.findMany({
      where: {
        AND: [
          creditRequestScopeForUser(req.user),
          { status: "FULFILLED" },
          filters.startDate || filters.endDate
            ? {
                fulfilledAt: {
                  gte: filters.startDate ? new Date(filters.startDate) : undefined,
                  lte: filters.endDate ? new Date(filters.endDate) : undefined
                }
              }
            : {},
          filters.productId ? { productId: filters.productId } : {},
          filters.programmeId ? { programmeId: filters.programmeId } : {},
          filters.agentId ? { distributionAgentId: filters.agentId } : {},
          filters.financierPartnerId ? { financierPartnerId: filters.financierPartnerId } : {},
          filters.supplierId ? { product: { supplierId: filters.supplierId } } : {}
        ]
      },
      orderBy: { fulfilledAt: "desc" },
      include: creditRequestInclude
    });

    const rows = requests.map((request) => ({
      id: request.id,
      fulfilledAt: request.fulfilledAt,
      productId: request.productId,
      productName: request.product.name,
      supplierId: request.product.supplierId,
      supplierName: request.product.supplier?.name ?? request.product.sellerName ?? "Intelli-Store",
      programmeId: request.programmeId,
      programmeName: request.programme.name,
      vaId: request.distributionAgentId,
      vaName: request.distributionAgent?.name ?? "Unassigned",
      financierPartnerId: request.financierPartnerId,
      financierName: request.financierPartner?.name ?? "Not financed",
      customerName: request.customerName,
      groupName: request.groupName,
      quantity: request.quantity,
      grossSalesCents: request.requestedAmountCents,
      depositCents: request.depositCents,
      financedValueCents: request.financedAmountCents,
      commissionCents: request.commissionCents,
      repaymentStatus: request.repaymentStatus
    }));

    const summary = rows.reduce(
      (acc, row) => ({
        fulfilledRequests: acc.fulfilledRequests + 1,
        quantity: acc.quantity + row.quantity,
        grossSalesCents: acc.grossSalesCents + row.grossSalesCents,
        depositCents: acc.depositCents + row.depositCents,
        financedValueCents: acc.financedValueCents + row.financedValueCents,
        commissionCents: acc.commissionCents + row.commissionCents
      }),
      {
        fulfilledRequests: 0,
        quantity: 0,
        grossSalesCents: 0,
        depositCents: 0,
        financedValueCents: 0,
        commissionCents: 0
      }
    );

    ok(res, { summary, rows });
  } catch (error) {
    next(error);
  }
});

router.get("/intelli-store/reports/loan-portfolio", requireAuth("store:read"), async (req, res, next) => {
  try {
    const filters = reportQuerySchema.parse(req.query);
    const now = new Date();
    const requests = await prisma.storeCreditRequest.findMany({
      where: {
        AND: [
          creditRequestScopeForUser(req.user),
          { financierPartnerId: { not: null } },
          filters.startDate || filters.endDate
            ? {
                financedAt: {
                  gte: filters.startDate ? new Date(filters.startDate) : undefined,
                  lte: filters.endDate ? new Date(filters.endDate) : undefined
                }
              }
            : {},
          filters.productId ? { productId: filters.productId } : {},
          filters.programmeId ? { programmeId: filters.programmeId } : {},
          filters.agentId ? { distributionAgentId: filters.agentId } : {},
          filters.financierPartnerId ? { financierPartnerId: filters.financierPartnerId } : {},
          filters.supplierId ? { product: { supplierId: filters.supplierId } } : {},
          filters.status ? { OR: [{ status: filters.status }, { repaymentStatus: filters.status }] } : {}
        ]
      },
      orderBy: { financedAt: "desc" },
      include: creditRequestInclude
    });

    const agingForDays = (daysPastDue: number) => {
      if (daysPastDue <= 0) return "current" as const;
      if (daysPastDue <= 30) return "1-30" as const;
      if (daysPastDue <= 60) return "31-60" as const;
      if (daysPastDue <= 90) return "61-90" as const;
      return "90+" as const;
    };

    const emptyBuckets = () => ({
      currentCents: 0,
      days1To30Cents: 0,
      days31To60Cents: 0,
      days61To90Cents: 0,
      days90PlusCents: 0
    });

    const rows = requests.map((request) => {
      const bucketTotals = emptyBuckets();
      let principalCents = 0;
      let interestCents = 0;
      let totalDueCents = 0;
      let paidCents = 0;
      let overdueCents = 0;
      let oldestPastDueDays = 0;

      request.installments.forEach((installment) => {
        principalCents += installment.principalCents;
        interestCents += installment.interestCents;
        totalDueCents += installment.totalDueCents;
        paidCents += installment.paidCents;

        const outstandingCents = Math.max(0, installment.totalDueCents - installment.paidCents);
        if (outstandingCents <= 0) return;

        const pastDueDays = Math.floor((now.getTime() - installment.dueDate.getTime()) / 86_400_000);
        const bucket = agingForDays(pastDueDays);
        if (bucket === "current") bucketTotals.currentCents += outstandingCents;
        if (bucket === "1-30") bucketTotals.days1To30Cents += outstandingCents;
        if (bucket === "31-60") bucketTotals.days31To60Cents += outstandingCents;
        if (bucket === "61-90") bucketTotals.days61To90Cents += outstandingCents;
        if (bucket === "90+") bucketTotals.days90PlusCents += outstandingCents;
        if (pastDueDays > 0) {
          overdueCents += outstandingCents;
          oldestPastDueDays = Math.max(oldestPastDueDays, pastDueDays);
        }
      });

      const outstandingCents = Math.max(0, totalDueCents - paidCents);

      return {
        id: request.id,
        financedAt: request.financedAt,
        customerName: request.customerName,
        groupName: request.groupName,
        productId: request.productId,
        productName: request.product.name,
        supplierId: request.product.supplierId,
        supplierName: request.product.supplier?.name ?? request.product.sellerName ?? "Intelli-Store",
        programmeId: request.programmeId,
        programmeName: request.programme.name,
        vaId: request.distributionAgentId,
        vaName: request.distributionAgent?.name ?? "Unassigned",
        financierPartnerId: request.financierPartnerId,
        financierName: request.financierPartner?.name ?? "Not financed",
        status: request.status,
        repaymentStatus: request.repaymentStatus,
        principalCents,
        interestCents,
        totalDueCents,
        paidCents,
        outstandingCents,
        overdueCents,
        agingBucket: agingForDays(oldestPastDueDays),
        aging: bucketTotals
      };
    });

    const summary = rows.reduce(
      (acc, row) => ({
        principalCents: acc.principalCents + row.principalCents,
        interestCents: acc.interestCents + row.interestCents,
        totalDueCents: acc.totalDueCents + row.totalDueCents,
        paidCents: acc.paidCents + row.paidCents,
        outstandingCents: acc.outstandingCents + row.outstandingCents,
        overdueCents: acc.overdueCents + row.overdueCents,
        aging: {
          currentCents: acc.aging.currentCents + row.aging.currentCents,
          days1To30Cents: acc.aging.days1To30Cents + row.aging.days1To30Cents,
          days31To60Cents: acc.aging.days31To60Cents + row.aging.days31To60Cents,
          days61To90Cents: acc.aging.days61To90Cents + row.aging.days61To90Cents,
          days90PlusCents: acc.aging.days90PlusCents + row.aging.days90PlusCents
        }
      }),
      {
        principalCents: 0,
        interestCents: 0,
        totalDueCents: 0,
        paidCents: 0,
        outstandingCents: 0,
        overdueCents: 0,
        aging: emptyBuckets()
      }
    );

    ok(res, { summary, rows });
  } catch (error) {
    next(error);
  }
});

router.get("/intelli-store/booking-requests", requireAuth("store:read"), async (req, res, next) => {
  try {
    const requests = await prisma.agentBookingRequest.findMany({
      where: bookingRequestScopeForUser(req.user),
      orderBy: { createdAt: "desc" },
      include: bookingRequestInclude
    });

    ok(res, requests);
  } catch (error) {
    next(error);
  }
});

router.patch("/intelli-store/booking-requests/:id", requireAuth("store:write"), async (req, res, next) => {
  try {
    assertCanManageStoreOperations(req.user);
    const requestId = z.string().parse(req.params.id);
    const body = requestUpdateSchema.parse(req.body);
    const existing = await prisma.agentBookingRequest.findFirst({
      where: {
        id: requestId,
        ...bookingRequestScopeForUser(req.user)
      },
      select: { id: true }
    });

    if (!existing) {
      throw new ApiHttpError(404, "AGENT_BOOKING_REQUEST_NOT_FOUND", "Booking request does not exist or is outside this account.");
    }

    const updated = await prisma.agentBookingRequest.update({
      where: { id: existing.id },
      data: {
        status: body.status,
        reviewNotes: body.reviewNotes === undefined ? undefined : body.reviewNotes
      },
      include: bookingRequestInclude
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "AGENT_BOOKING_REQUEST",
      entityId: updated.id,
      type: "AGENT_BOOKING_REQUEST_UPDATED",
      payload: updated
    });

    ok(res, updated);
  } catch (error) {
    next(error);
  }
});

export { router as intelliStoreRouter };
