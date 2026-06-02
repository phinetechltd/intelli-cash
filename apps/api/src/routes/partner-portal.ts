import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { fundTypes, memberRoles } from "@intellicash/shared";
import { appendAuditEvent } from "../services/audit-service";
import { requireAuth } from "../middleware/auth";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  createPaymentReference,
  initiateIncomingPayment,
  updateTransactionGatewayFields
} from "../services/payment-service";

const router = Router();

const paymentProviderSchema = z.enum(["MPESA_DARAJA", "PAYSTACK"]);
const contributionTypeSchema = z.enum(["INVESTMENT", "DONATION"]);

const signupRequestSchema = z.object({
  organizationName: z.string().min(2),
  organizationType: z.string().min(2).default("NGO"),
  requestedRole: z.enum(["PARTNER_OFFICER", "LENDER", "GROUP_ACCOUNT"]).default("PARTNER_OFFICER"),
  requestedPartnerType: z.string().min(2).default("NGO"),
  contactName: z.string().min(2),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(7).optional(),
  county: z.string().optional(),
  groupSubCounty: z.string().optional(),
  groupLocation: z.string().optional(),
  groupMeetingDay: z.string().optional(),
  groupObjective: z.string().optional(),
  estimatedMembers: z.number().int().min(1).max(10000).optional(),
  championRole: z.string().min(2).optional(),
  valueProposition: z.string().optional()
}).superRefine((body, context) => {
  if (body.requestedRole !== "GROUP_ACCOUNT") return;

  if (!body.county) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["county"],
      message: "County is required for group registration."
    });
  }

  if (!body.contactPhone) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contactPhone"],
      message: "Champion phone is required for group registration."
    });
  }
});

const signupDecisionSchema = z.object({
  password: z.string().min(12).optional(),
  reviewNotes: z.string().optional()
});

const signupAgentAssignmentSchema = z.object({
  villageAgentId: z.string().min(1),
  fieldVisitScheduledAt: z.string().datetime().optional(),
  notes: z.string().optional()
});

const fieldVisitDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  notes: z.string().optional(),
  visitedAt: z.string().datetime().optional()
});

const publicContributionSchema = z.object({
  type: contributionTypeSchema,
  provider: paymentProviderSchema,
  amountCents: z.number().int().min(100),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  phoneNumber: z.string().min(7).optional()
});

const signupRequestInclude = {
  createdPartner: true,
  assignedVillageAgent: true
} satisfies Prisma.PartnerSignupRequestInclude;

function projectFundingTotals(transactions: Array<{ amountCents: number; type: string; status: string }>) {
  return transactions
    .filter((transaction) => transaction.status === "COMPLETED")
    .reduce(
      (totals, transaction) => ({
        investmentCents:
          totals.investmentCents + (transaction.type === "INVESTMENT" ? transaction.amountCents : 0),
        donationCents: totals.donationCents + (transaction.type === "DONATION" ? transaction.amountCents : 0)
      }),
      { investmentCents: 0, donationCents: 0 }
    );
}

function compactOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function countyCode(county?: string | null) {
  const normalized = (county ?? "REG").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return (normalized || "REG").slice(0, 3).padEnd(3, "X");
}

async function generateGroupCode(tx: Prisma.TransactionClient, county?: string | null) {
  const prefix = `IWL-${countyCode(county)}`;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `${prefix}-${suffix}`;
    const existing = await tx.group.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function memberRoleFromChampionRole(role?: string | null) {
  const normalized = role?.trim().replace(/\s+/g, "_").toUpperCase();
  return memberRoles.includes(normalized as (typeof memberRoles)[number])
    ? (normalized as (typeof memberRoles)[number])
    : "CHAIRPERSON";
}

function groupOnboardingFeedback(request: {
  estimatedMembers: number | null;
  championRole: string | null;
  valueProposition: string | null;
}) {
  const parts = [
    request.estimatedMembers ? `Estimated members: ${request.estimatedMembers}` : null,
    request.championRole ? `Champion role: ${request.championRole}` : null,
    request.valueProposition ? `Registration note: ${request.valueProposition}` : null
  ].filter(Boolean);

  return parts.length ? parts.join("\n") : undefined;
}

function serializeProgramme(programme: Awaited<ReturnType<typeof loadPublicProgrammes>>[number]) {
  const totals = projectFundingTotals(programme.walletTransactions);
  return {
    ...programme,
    walletTransactions: undefined,
    fundingRaisedCents: totals.investmentCents + totals.donationCents,
    investmentCents: totals.investmentCents,
    donationCents: totals.donationCents
  };
}

async function loadPublicProgrammes(where: { id?: string; publicSlug?: string } = {}) {
  return prisma.programme.findMany({
    where: {
      ...where,
      publicStatus: "ONGOING"
    },
    orderBy: { createdAt: "desc" },
    include: {
      partner: true,
      partnerLinks: {
        include: { partner: true },
        orderBy: { role: "asc" }
      },
      assets: {
        where: { visibility: "PUBLIC" },
        orderBy: [{ type: "asc" }, { createdAt: "desc" }]
      },
      groupLinks: {
        include: {
          group: {
            select: {
              id: true,
              name: true,
              code: true,
              county: true,
              phase: true,
              _count: { select: { members: true } }
            }
          }
        }
      },
      walletTransactions: {
        where: {
          type: { in: ["INVESTMENT", "DONATION"] },
          status: "COMPLETED"
        },
        select: { amountCents: true, type: true, status: true }
      },
      _count: {
        select: {
          groups: true,
          villageAgents: true,
          groupLinks: true,
          partnerLinks: true
        }
      }
    }
  });
}

router.post("/partner-signup-requests", async (req, res, next) => {
  try {
    const body = signupRequestSchema.parse(req.body);
    const requestedRole = body.requestedRole;
    const requestedPartnerType =
      requestedRole === "LENDER"
        ? "LENDER"
        : requestedRole === "GROUP_ACCOUNT"
          ? "GROUP_ACCOUNT"
          : body.requestedPartnerType;
    const request = await prisma.partnerSignupRequest.create({
      data: {
        ...body,
        requestedRole,
        requestedPartnerType,
        contactPhone: compactOptional(body.contactPhone),
        county: compactOptional(body.county),
        groupSubCounty: compactOptional(body.groupSubCounty),
        groupLocation: compactOptional(body.groupLocation),
        groupMeetingDay: compactOptional(body.groupMeetingDay),
        groupObjective: compactOptional(body.groupObjective),
        championRole: compactOptional(body.championRole),
        fieldVisitStatus: requestedRole === "GROUP_ACCOUNT" ? "PENDING_ASSIGNMENT" : "NOT_REQUIRED",
        valueProposition: compactOptional(body.valueProposition)
      }
    });

    await appendAuditEvent({
      actorUserId: null,
      entityType: "PARTNER_SIGNUP_REQUEST",
      entityId: request.id,
      type: "PARTNER_SIGNUP_REQUESTED",
      payload: {
        organizationName: request.organizationName,
        requestedRole: request.requestedRole,
        organizationType: request.organizationType,
        contactEmail: request.contactEmail
      }
    });

    ok(res.status(201), request);
  } catch (error) {
    next(error);
  }
});

router.get("/partner-signup-requests", requireAuth("signup-requests:read"), async (_req, res, next) => {
  try {
    const requests = await prisma.partnerSignupRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: signupRequestInclude
    });

    ok(res, requests);
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/partner-signup-requests/:id/assign-agent",
  requireAuth("signup-requests:approve"),
  async (req, res, next) => {
    try {
      const body = signupAgentAssignmentSchema.parse(req.body);
      const requestId = z.string().parse(req.params.id);
      const [request, agent] = await Promise.all([
        prisma.partnerSignupRequest.findUnique({ where: { id: requestId } }),
        prisma.villageAgent.findUnique({ where: { id: body.villageAgentId } })
      ]);

      if (!request) {
        throw new ApiHttpError(404, "SIGNUP_REQUEST_NOT_FOUND", "Signup request does not exist.");
      }
      if (request.requestedRole !== "GROUP_ACCOUNT") {
        throw new ApiHttpError(400, "FIELD_VISIT_NOT_REQUIRED", "Only group applications need a field visit.");
      }
      if (request.status !== "PENDING") {
        throw new ApiHttpError(400, "SIGNUP_REQUEST_REVIEWED", "Signup request has already been reviewed.");
      }
      if (!agent || agent.status !== "ACTIVE") {
        throw new ApiHttpError(404, "VILLAGE_AGENT_NOT_FOUND", "Selected VA / CBT does not exist or is not active.");
      }

      const updated = await prisma.partnerSignupRequest.update({
        where: { id: request.id },
        data: {
          assignedVillageAgentId: agent.id,
          fieldVisitStatus: "PENDING_VISIT",
          fieldVisitScheduledAt: body.fieldVisitScheduledAt ? new Date(body.fieldVisitScheduledAt) : null,
          fieldVisitNotes: compactOptional(body.notes) ?? request.fieldVisitNotes
        },
        include: signupRequestInclude
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "PARTNER_SIGNUP_REQUEST",
        entityId: updated.id,
        type: "PARTNER_SIGNUP_AGENT_ASSIGNED",
        payload: {
          requestId: updated.id,
          assignedVillageAgentId: agent.id,
          agentName: agent.name,
          fieldVisitScheduledAt: updated.fieldVisitScheduledAt
        }
      });

      ok(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/partner-signup-requests/:id/field-visit",
  requireAuth("signup-requests:approve"),
  async (req, res, next) => {
    try {
      const body = fieldVisitDecisionSchema.parse(req.body);
      const requestId = z.string().parse(req.params.id);
      const request = await prisma.partnerSignupRequest.findUnique({ where: { id: requestId } });

      if (!request) {
        throw new ApiHttpError(404, "SIGNUP_REQUEST_NOT_FOUND", "Signup request does not exist.");
      }
      if (request.requestedRole !== "GROUP_ACCOUNT") {
        throw new ApiHttpError(400, "FIELD_VISIT_NOT_REQUIRED", "Only group applications need a field visit.");
      }
      if (request.status !== "PENDING") {
        throw new ApiHttpError(400, "SIGNUP_REQUEST_REVIEWED", "Signup request has already been reviewed.");
      }
      if (!request.assignedVillageAgentId) {
        throw new ApiHttpError(400, "FIELD_AGENT_REQUIRED", "Assign a VA / CBT before recording the field visit.");
      }

      const updated = await prisma.partnerSignupRequest.update({
        where: { id: request.id },
        data: {
          fieldVisitStatus: body.status,
          fieldVisitNotes: compactOptional(body.notes) ?? request.fieldVisitNotes,
          fieldVisitedAt: body.visitedAt ? new Date(body.visitedAt) : new Date(),
          fieldVisitReviewedByUserId: req.user?.id
        },
        include: signupRequestInclude
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "PARTNER_SIGNUP_REQUEST",
        entityId: updated.id,
        type: "PARTNER_SIGNUP_FIELD_VISIT_RECORDED",
        payload: {
          requestId: updated.id,
          assignedVillageAgentId: updated.assignedVillageAgentId,
          fieldVisitStatus: updated.fieldVisitStatus,
          fieldVisitedAt: updated.fieldVisitedAt
        }
      });

      ok(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/partner-signup-requests/:id/approve",
  requireAuth("signup-requests:approve"),
  async (req, res, next) => {
    try {
      const body = signupDecisionSchema.parse(req.body);
      const requestId = z.string().parse(req.params.id);
      const passwordHash = await bcrypt.hash(body.password ?? "IntellicashDemo#2026", 12);
      const request = await prisma.partnerSignupRequest.findUnique({ where: { id: requestId } });

      if (!request) {
        throw new ApiHttpError(404, "SIGNUP_REQUEST_NOT_FOUND", "Signup request does not exist.");
      }
      if (request.status !== "PENDING") {
        throw new ApiHttpError(400, "SIGNUP_REQUEST_REVIEWED", "Signup request has already been reviewed.");
      }

      const result = await prisma.$transaction(async (tx) => {
        if (request.requestedRole === "GROUP_ACCOUNT") {
          if (!request.county || !request.contactPhone) {
            throw new ApiHttpError(400, "GROUP_SIGNUP_INCOMPLETE", "Group registration needs county and champion phone.");
          }
          if (!request.assignedVillageAgentId || request.fieldVisitStatus !== "APPROVED") {
            throw new ApiHttpError(
              400,
              "GROUP_FIELD_VISIT_REQUIRED",
              "Group applications must be assigned to a VA / CBT and approved after a field visit before account creation."
            );
          }

          const group = await tx.group.create({
            data: {
              villageAgentId: request.assignedVillageAgentId,
              name: request.organizationName,
              code: await generateGroupCode(tx, request.county),
              phase: "MOBILISATION",
              county: request.county,
              subCounty: request.groupSubCounty,
              location: request.groupLocation,
              composition: request.organizationType,
              objective: request.groupObjective ?? request.valueProposition,
              contactPersonName: request.contactName,
              contactPhone: request.contactPhone,
              onboardingFeedback: groupOnboardingFeedback(request),
              meetingDay: request.groupMeetingDay,
              fundAccounts: {
                create: fundTypes.map((type) => ({ type, balanceCents: 0 }))
              }
            }
          });

          const member = await tx.member.create({
            data: {
              groupId: group.id,
              fullName: request.contactName,
              phone: request.contactPhone,
              role: memberRoleFromChampionRole(request.championRole),
              kycStatus: "PENDING",
              status: "ACTIVE"
            },
            select: {
              id: true,
              groupId: true,
              fullName: true,
              phone: true,
              role: true,
              kycStatus: true,
              status: true
            }
          });

          const user = await tx.user.create({
            data: {
              name: request.contactName,
              email: request.contactEmail,
              passwordHash,
              role: "GROUP_ACCOUNT",
              groupId: group.id,
              memberId: member.id,
              status: "ACTIVE"
            },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              groupId: true,
              memberId: true
            }
          });

          const reviewedRequest = await tx.partnerSignupRequest.update({
            where: { id: request.id },
            data: {
              status: "APPROVED",
              reviewNotes: body.reviewNotes,
              reviewedAt: new Date(),
              reviewedByUserId: req.user?.id,
              createdGroupId: group.id,
              createdMemberId: member.id,
              createdUserId: user.id
            },
            include: signupRequestInclude
          });

          return { group, member, assignedVillageAgentId: request.assignedVillageAgentId, user, request: reviewedRequest };
        }

        const partner = await tx.partner.create({
          data: {
            name: request.organizationName,
            type: request.requestedRole === "LENDER" ? "LENDER" : request.requestedPartnerType,
            status: "ACTIVE",
            apiScope: "PROGRAMME",
            county: request.county,
            contactName: request.contactName,
            contactPhone: request.contactPhone,
            valueProposition: request.valueProposition
          }
        });

        await tx.partnerWallet.create({
          data: {
            partnerId: partner.id,
            currency: "KES"
          }
        });

        const user = await tx.user.create({
          data: {
            name: request.contactName,
            email: request.contactEmail,
            passwordHash,
            role: request.requestedRole,
            partnerId: partner.id,
            status: "ACTIVE"
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            partnerId: true
          }
        });

        const reviewedRequest = await tx.partnerSignupRequest.update({
          where: { id: request.id },
          data: {
            status: "APPROVED",
            reviewNotes: body.reviewNotes,
            reviewedAt: new Date(),
            reviewedByUserId: req.user?.id,
            createdPartnerId: partner.id,
            createdUserId: user.id
          },
          include: signupRequestInclude
        });

        return { partner, user, request: reviewedRequest };
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "PARTNER_SIGNUP_REQUEST",
        entityId: request.id,
        type: "PARTNER_SIGNUP_APPROVED",
        payload: result
      });

      ok(res, result);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/partner-signup-requests/:id/reject",
  requireAuth("signup-requests:approve"),
  async (req, res, next) => {
    try {
      const body = signupDecisionSchema.parse(req.body);
      const requestId = z.string().parse(req.params.id);
      const request = await prisma.partnerSignupRequest.findUnique({ where: { id: requestId } });

      if (!request) {
        throw new ApiHttpError(404, "SIGNUP_REQUEST_NOT_FOUND", "Signup request does not exist.");
      }
      if (request.status !== "PENDING") {
        throw new ApiHttpError(400, "SIGNUP_REQUEST_REVIEWED", "Signup request has already been reviewed.");
      }

      const rejected = await prisma.partnerSignupRequest.update({
        where: { id: request.id },
        data: {
          status: "REJECTED",
          reviewNotes: body.reviewNotes,
          reviewedAt: new Date(),
          reviewedByUserId: req.user?.id
        },
        include: signupRequestInclude
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "PARTNER_SIGNUP_REQUEST",
        entityId: rejected.id,
        type: "PARTNER_SIGNUP_REJECTED",
        payload: rejected
      });

      ok(res, rejected);
    } catch (error) {
      next(error);
    }
  }
);

router.get("/public/programmes", async (_req, res, next) => {
  try {
    const programmes = await loadPublicProgrammes();
    ok(res, programmes.map(serializeProgramme));
  } catch (error) {
    next(error);
  }
});

router.get("/public/programmes/:slug", async (req, res, next) => {
  try {
    const programmes = await loadPublicProgrammes({ publicSlug: z.string().parse(req.params.slug) });
    const programme = programmes[0];
    if (!programme) throw new ApiHttpError(404, "PROJECT_NOT_FOUND", "Public project does not exist.");

    ok(res, serializeProgramme(programme));
  } catch (error) {
    next(error);
  }
});

router.post("/public/programmes/:id/contributions", async (req, res, next) => {
  try {
    const programmeId = z.string().parse(req.params.id);
    const body = publicContributionSchema.parse(req.body);
    const programme = await prisma.programme.findFirst({
      where: { id: programmeId, publicStatus: "ONGOING" },
      select: {
        id: true,
        name: true,
        allowInvestments: true,
        allowDonations: true
      }
    });

    if (!programme) throw new ApiHttpError(404, "PROJECT_NOT_FOUND", "Public project does not exist.");
    if (body.type === "INVESTMENT" && !programme.allowInvestments) {
      throw new ApiHttpError(400, "INVESTMENTS_DISABLED", "This project is not accepting investments.");
    }
    if (body.type === "DONATION" && !programme.allowDonations) {
      throw new ApiHttpError(400, "DONATIONS_DISABLED", "This project is not accepting donations.");
    }

    const internalReference = createPaymentReference(body.type === "INVESTMENT" ? "INV" : "DON");
    const transaction = await prisma.partnerWalletTransaction.create({
      data: {
        programmeId: programme.id,
        type: body.type,
        provider: body.provider,
        source: "DIRECT",
        status: "PENDING",
        amountCents: body.amountCents,
        currency: "KES",
        description: `${body.type.toLowerCase()} for ${programme.name}`,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        phoneNumber: body.phoneNumber,
        internalReference
      }
    });

    const gateway = await initiateIncomingPayment({
      provider: body.provider,
      amountCents: body.amountCents,
      internalReference,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      phoneNumber: body.phoneNumber,
      description: `${body.type.toLowerCase()} for ${programme.name}`,
      metadata: { programmeId: programme.id, type: body.type, public: true }
    });
    const updated = await updateTransactionGatewayFields(transaction.id, gateway);

    await appendAuditEvent({
      actorUserId: null,
      entityType: "PAYMENT",
      entityId: updated.id,
      type: "PAYMENT_INITIATED",
      payload: updated
    });

    ok(res.status(201), updated);
  } catch (error) {
    next(error);
  }
});

export { router as partnerPortalRouter };
