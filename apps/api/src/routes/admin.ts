import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { languagePreferences, permissions, roles, type Role } from "@intellicash/shared";
import { requireAuth } from "../middleware/auth";
import { appendAuditEvent } from "../services/audit-service";
import {
  partnerScopeForUser,
  programmeScopeForUser,
  scopeGroupWhere,
  villageAgentScopeForUser
} from "../services/account-scope";
import {
  getRolePermissionMap,
  normalizePermissionList,
  updateRolePermissionTemplate
} from "../services/role-permission-service";
import {
  generateAndQueueMemberPin,
  serializeMemberPinDelivery
} from "../services/member-pin-service";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatarUrl: true,
  languagePreference: true,
  partnerId: true,
  groupId: true,
  memberId: true,
  partner: { select: { id: true, name: true } },
  group: { select: { id: true, name: true, code: true } },
  member: { select: { id: true, fullName: true, phone: true } },
  createdAt: true
};

const accountProfiles: Record<
  Role,
  {
    accountType: string;
    requiredBinding: "GROUP" | "MEMBER" | "NONE" | "PARTNER" | "LENDER";
    dashboard: string;
    dataScope: string;
  }
> = {
  IWL_ADMIN: {
    accountType: "Admin",
    requiredBinding: "NONE",
    dashboard: "Full platform operations",
    dataScope: "All partners, programmes, groups, members, integrations, users, and audit events"
  },
  PARTNER_OFFICER: {
    accountType: "Partner",
    requiredBinding: "PARTNER",
    dashboard: "Partner portfolio dashboard",
    dataScope: "Programmes, groups, members, meetings, ledger entries, and reports linked to the partner"
  },
  GROUP_ACCOUNT: {
    accountType: "Group",
    requiredBinding: "GROUP",
    dashboard: "Group account dashboard",
    dataScope: "One assigned group, its members, meetings, ledger entries, votes, score, and store product requests"
  },
  MEMBER: {
    accountType: "Member",
    requiredBinding: "MEMBER",
    dashboard: "Member account dashboard",
    dataScope: "One member profile and that member's scoped group, ledger, meetings, votes, score, and store requests"
  },
  LENDER: {
    accountType: "Lender",
    requiredBinding: "LENDER",
    dashboard: "Lender portfolio dashboard",
    dataScope: "Programmes, groups, credit-readiness, ledger visibility, and store requests linked for financing"
  },
  READ_ONLY: {
    accountType: "Read only",
    requiredBinding: "NONE",
    dashboard: "Read-only oversight dashboard",
    dataScope: "Platform-wide read views without write operations"
  }
};

async function accessControlPayload() {
  const effectiveRolePermissions = await getRolePermissionMap();

  return {
    roles,
    permissions,
    rolePermissions: effectiveRolePermissions,
    accountProfiles: roles.map((role) => ({
      role,
      permissionCount: effectiveRolePermissions[role].length,
      ...accountProfiles[role]
    }))
  };
}

async function normalizeUserBinding(input: {
  role: Role;
  partnerId?: string | null;
  groupId?: string | null;
  memberId?: string | null;
}) {
  if (input.role === "IWL_ADMIN" || input.role === "READ_ONLY") {
    return { partnerId: null, groupId: null, memberId: null };
  }

  if (input.role === "PARTNER_OFFICER" || input.role === "LENDER") {
    if (!input.partnerId) {
      throw new ApiHttpError(400, "PARTNER_REQUIRED", "Partner and lender accounts require a partner/lender.");
    }

    const partner = await prisma.partner.findUnique({
      where: { id: input.partnerId },
      select: { id: true, type: true }
    });

    if (!partner) {
      throw new ApiHttpError(404, "PARTNER_NOT_FOUND", "Selected partner/lender does not exist.");
    }

    if (input.role === "LENDER" && partner.type !== "LENDER") {
      throw new ApiHttpError(400, "LENDER_REQUIRED", "Lender accounts must be bound to a lender partner.");
    }

    if (input.role === "PARTNER_OFFICER" && partner.type === "LENDER") {
      throw new ApiHttpError(400, "PARTNER_REQUIRED", "Partner officer accounts must be bound to a non-lender partner.");
    }

    return { partnerId: partner.id, groupId: null, memberId: null };
  }

  if (input.role === "GROUP_ACCOUNT") {
    if (!input.groupId) {
      throw new ApiHttpError(400, "GROUP_REQUIRED", "Group accounts require a group.");
    }

    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: { id: true }
    });

    if (!group) {
      throw new ApiHttpError(404, "GROUP_NOT_FOUND", "Selected group does not exist.");
    }

    return { partnerId: null, groupId: group.id, memberId: null };
  }

  if (!input.memberId) {
    throw new ApiHttpError(400, "MEMBER_REQUIRED", "Member accounts require a member.");
  }

  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    select: { id: true, groupId: true }
  });

  if (!member) {
    throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Selected member does not exist.");
  }

  if (input.groupId && input.groupId !== member.groupId) {
    throw new ApiHttpError(400, "MEMBER_GROUP_MISMATCH", "Selected member does not belong to the selected group.");
  }

  return { partnerId: null, groupId: member.groupId, memberId: member.id };
}

async function queueMemberAccountPin(
  tx: Prisma.TransactionClient,
  memberId: string,
  actorUserId?: string | null
) {
  const member = await tx.member.findUnique({
    where: { id: memberId },
    select: { id: true, fullName: true, phone: true, pinSetAt: true }
  });

  if (!member) return null;

  const { delivery } = await generateAndQueueMemberPin(tx, member, {
    requestedByUserId: actorUserId,
    select: { id: true }
  });

  return delivery;
}

router.get("/users", requireAuth("users:read"), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: userSelect
    });

    ok(res, users);
  } catch (error) {
    next(error);
  }
});

router.get("/access-control", requireAuth("users:read"), async (_req, res, next) => {
  try {
    ok(res, await accessControlPayload());
  } catch (error) {
    next(error);
  }
});

const rolePermissionUpdateSchema = z.object({
  permissions: z.array(z.enum(permissions))
});

router.patch("/access-control/roles/:role/permissions", requireAuth("users:write"), async (req, res, next) => {
  try {
    const role = String(req.params.role ?? "");
    if (!roles.includes(role as Role)) {
      throw new ApiHttpError(404, "ROLE_NOT_FOUND", "Role does not exist.");
    }

    const body = rolePermissionUpdateSchema.parse(req.body);
    const before = await getRolePermissionMap();

    try {
      await updateRolePermissionTemplate(role as Role, normalizePermissionList(body.permissions));
    } catch (error) {
      throw new ApiHttpError(
        400,
        "ROLE_PERMISSION_GUARD",
        error instanceof Error ? error.message : "Role permission update is not allowed."
      );
    }

    const after = await getRolePermissionMap();

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "ROLE",
      entityId: role,
      type: "ROLE_PERMISSIONS_UPDATED",
      payload: {
        role,
        before: before[role as Role],
        after: after[role as Role]
      }
    });

    ok(res, await accessControlPayload());
  } catch (error) {
    next(error);
  }
});

const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(12),
  role: z.enum(roles),
  avatarUrl: z.string().url().optional(),
  languagePreference: z.enum(languagePreferences).optional(),
  partnerId: z.string().optional(),
  groupId: z.string().optional(),
  memberId: z.string().optional()
});

router.post("/users", requireAuth("users:write"), async (req, res, next) => {
  try {
    const body = userCreateSchema.parse(req.body);
    const { password, ...userInput } = body;
    const passwordHash = await bcrypt.hash(password, 12);
    const binding = await normalizeUserBinding(userInput);

    const { user, pinDelivery } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: userInput.name,
          email: userInput.email,
          role: userInput.role,
          avatarUrl: userInput.avatarUrl,
          languagePreference: userInput.languagePreference,
          ...binding,
          passwordHash
        },
        select: userSelect
      });

      const delivery =
        userInput.role === "MEMBER" && binding.memberId
          ? await queueMemberAccountPin(tx, binding.memberId, req.user?.id)
          : null;

      return { user: createdUser, pinDelivery: delivery };
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "USER",
      entityId: user.id,
      type: "USER_CREATED",
      payload: user
    });
    if (pinDelivery) {
      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "MEMBER",
        entityId: pinDelivery.memberId,
        type: "MEMBER_PIN_DELIVERY_QUEUED",
        payload: {
          memberId: pinDelivery.memberId,
          reason: "MEMBER_ACCOUNT_CREATED",
          delivery: serializeMemberPinDelivery(pinDelivery)
        }
      });
    }

    ok(res.status(201), user);
  } catch (error) {
    next(error);
  }
});

const userUpdateSchema = z.object({
  role: z.enum(roles).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  languagePreference: z.enum(languagePreferences).optional(),
  partnerId: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional()
});

router.patch("/users/:id", requireAuth("users:write"), async (req, res, next) => {
  try {
    const body = userUpdateSchema.parse(req.body);
    const userId = String(req.params.id ?? "");
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        partnerId: true,
        groupId: true,
        memberId: true
      }
    });

    if (!existing) {
      throw new ApiHttpError(404, "USER_NOT_FOUND", "User account does not exist.");
    }

    const role = (body.role ?? existing.role) as Role;
    const status = body.status ?? existing.status;
    const binding = await normalizeUserBinding({
      role,
      partnerId: body.partnerId === undefined ? existing.partnerId : body.partnerId,
      groupId: body.groupId === undefined ? existing.groupId : body.groupId,
      memberId: body.memberId === undefined ? existing.memberId : body.memberId
    });

    if ((existing.role === "IWL_ADMIN" || role === "IWL_ADMIN") && (role !== "IWL_ADMIN" || status !== "ACTIVE")) {
      const activeAdminCount = await prisma.user.count({
        where: {
          id: { not: existing.id },
          role: "IWL_ADMIN",
          status: "ACTIVE"
        }
      });

      if (activeAdminCount === 0) {
        throw new ApiHttpError(400, "LAST_ADMIN", "At least one active IWL admin account must remain.");
      }
    }

    const shouldQueueMemberPin =
      role === "MEMBER" &&
      Boolean(binding.memberId) &&
      (existing.role !== "MEMBER" || existing.memberId !== binding.memberId);

    const { user, pinDelivery } = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: existing.id },
        data: {
          role,
          status,
          avatarUrl: body.avatarUrl === undefined ? undefined : body.avatarUrl,
          languagePreference: body.languagePreference,
          ...binding
        },
        select: userSelect
      });

      const delivery =
        shouldQueueMemberPin && binding.memberId
          ? await queueMemberAccountPin(tx, binding.memberId, req.user?.id)
          : null;

      return { user: updatedUser, pinDelivery: delivery };
    });

    if (status !== "ACTIVE") {
      await prisma.session.deleteMany({ where: { userId: user.id } });
    }

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "USER",
      entityId: user.id,
      type: "USER_UPDATED",
      payload: {
        before: existing,
        after: user
      }
    });
    if (pinDelivery) {
      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "MEMBER",
        entityId: pinDelivery.memberId,
        type: "MEMBER_PIN_DELIVERY_QUEUED",
        payload: {
          memberId: pinDelivery.memberId,
          reason: "MEMBER_ACCOUNT_ASSIGNED",
          delivery: serializeMemberPinDelivery(pinDelivery)
        }
      });
    }

    ok(res, user);
  } catch (error) {
    next(error);
  }
});

router.get("/partners", requireAuth("partners:read"), async (req, res, next) => {
  try {
    const partners = await prisma.partner.findMany({
      where: partnerScopeForUser(req.user),
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            programmes: true,
            programmeLinks: true,
            users: true,
            webhookSubscriptions: true
          }
        }
      }
    });

    ok(res, partners);
  } catch (error) {
    next(error);
  }
});

const partnerSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(2),
  status: z.string().default("ACTIVE"),
  apiScope: z.string().default("PROGRAMME")
});

const partnerUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  type: z.string().min(2).optional(),
  status: z.string().min(2).optional(),
  apiScope: z.string().min(2).optional(),
  county: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  valueProposition: z.string().nullable().optional(),
  capacity: z.string().nullable().optional(),
  linkageType: z.string().nullable().optional()
});

router.post("/partners", requireAuth("partners:write"), async (req, res, next) => {
  try {
    const body = partnerSchema.parse(req.body);
    const partner = await prisma.partner.create({ data: body });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PARTNER",
      entityId: partner.id,
      type: "PARTNER_CREATED",
      payload: partner
    });

    ok(res.status(201), partner);
  } catch (error) {
    next(error);
  }
});

router.patch("/partners/:id", requireAuth("partners:write"), async (req, res, next) => {
  try {
    const partnerId = z.string().parse(req.params.id);
    const body = partnerUpdateSchema.parse(req.body);
    const existing = await prisma.partner.findFirst({
      where: {
        AND: [{ id: partnerId }, partnerScopeForUser(req.user)]
      },
      include: {
        _count: {
          select: {
            programmes: true,
            programmeLinks: true,
            users: true,
            webhookSubscriptions: true
          }
        }
      }
    });

    if (!existing) {
      throw new ApiHttpError(404, "PARTNER_NOT_FOUND", "Partner does not exist or is outside this account.");
    }

    const partner = await prisma.partner.update({
      where: { id: existing.id },
      data: body,
      include: {
        _count: {
          select: {
            programmes: true,
            programmeLinks: true,
            users: true,
            webhookSubscriptions: true
          }
        }
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PARTNER",
      entityId: partner.id,
      type: "PARTNER_UPDATED",
      payload: {
        before: existing,
        after: partner
      }
    });

    ok(res, partner);
  } catch (error) {
    next(error);
  }
});

const programmeInclude = {
  partner: true,
  partnerLinks: {
    include: {
      partner: true
    },
    orderBy: { role: "asc" }
  },
  assets: {
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
          phase: true
        }
      }
    },
    orderBy: { createdAt: "asc" }
  },
  _count: {
    select: {
      groups: true,
      villageAgents: true,
      partnerLinks: true,
      groupLinks: true
    }
  }
} satisfies Prisma.ProgrammeInclude;

router.get("/programmes", requireAuth("programmes:read"), async (req, res, next) => {
  try {
    const programmes = await prisma.programme.findMany({
      where: programmeScopeForUser(req.user),
      orderBy: { createdAt: "desc" },
      include: programmeInclude
    });

    ok(res, programmes);
  } catch (error) {
    next(error);
  }
});

const publicProgrammeStatuses = ["DRAFT", "ONGOING", "PAUSED", "CLOSED"] as const;

const programmeSchema = z.object({
  partnerId: z.string().optional(),
  partnerIds: z.array(z.string()).optional(),
  lenderPartnerIds: z.array(z.string()).optional(),
  name: z.string().min(2),
  country: z.string().default("Kenya"),
  county: z.string().optional(),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  publicSlug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Public slug must use lowercase letters, numbers, and hyphens.")
    .nullable()
    .optional(),
  publicStatus: z.enum(publicProgrammeStatuses).default("DRAFT"),
  fundingGoalCents: z.number().int().min(0).default(0),
  fundingSummary: z.string().nullable().optional(),
  impactSummary: z.string().nullable().optional(),
  fundingDeadline: z.string().datetime().nullable().optional(),
  allowInvestments: z.boolean().default(true),
  allowDonations: z.boolean().default(true)
});

const programmeUpdateSchema = z.object({
  partnerId: z.string().nullable().optional(),
  partnerIds: z.array(z.string()).optional(),
  lenderPartnerIds: z.array(z.string()).optional(),
  name: z.string().min(2).optional(),
  country: z.string().min(2).optional(),
  county: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  publicSlug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Public slug must use lowercase letters, numbers, and hyphens.")
    .nullable()
    .optional(),
  publicStatus: z.enum(publicProgrammeStatuses).optional(),
  fundingGoalCents: z.number().int().min(0).optional(),
  fundingSummary: z.string().nullable().optional(),
  impactSummary: z.string().nullable().optional(),
  fundingDeadline: z.string().datetime().nullable().optional(),
  allowInvestments: z.boolean().optional(),
  allowDonations: z.boolean().optional()
});

function programmeLinkData(partnerIds: string[], lenderPartnerIds: string[]) {
  return [
    ...partnerIds.map((partnerId, index) => ({
      partnerId,
      role: index === 0 ? "IMPLEMENTING_PARTNER" : "PARTNER"
    })),
    ...lenderPartnerIds
      .filter((partnerId) => !partnerIds.includes(partnerId))
      .map((partnerId) => ({
        partnerId,
        role: "LENDER"
      }))
  ];
}

async function validatePartnerLinksForUser(user: Express.Request["user"], partnerIds: string[]) {
  const uniquePartnerIds = Array.from(new Set(partnerIds));
  if (uniquePartnerIds.length === 0) return uniquePartnerIds;

  const partners = await prisma.partner.findMany({
    where: {
      AND: [{ id: { in: uniquePartnerIds } }, partnerScopeForUser(user)]
    },
    select: { id: true }
  });

  if (partners.length !== uniquePartnerIds.length) {
    throw new ApiHttpError(404, "PARTNER_NOT_FOUND", "One or more selected partners/lenders do not exist or are outside this account.");
  }

  return uniquePartnerIds;
}

router.post("/programmes", requireAuth("programmes:write"), async (req, res, next) => {
  try {
    const body = programmeSchema.parse(req.body);
    const partnerIds = Array.from(new Set([body.partnerId, ...(body.partnerIds ?? [])].filter(Boolean))) as string[];
    const lenderPartnerIds = Array.from(new Set(body.lenderPartnerIds ?? []));
    const primaryPartnerId = partnerIds[0] ?? lenderPartnerIds[0];

    if (!primaryPartnerId) {
      throw new ApiHttpError(400, "PARTNER_REQUIRED", "A program requires at least one partner or lender.");
    }

    const allPartnerIds = Array.from(new Set([...partnerIds, ...lenderPartnerIds]));
    await validatePartnerLinksForUser(req.user, allPartnerIds);

    if (body.publicSlug) {
      const slugOwner = await prisma.programme.findUnique({
        where: { publicSlug: body.publicSlug },
        select: { id: true }
      });
      if (slugOwner) {
        throw new ApiHttpError(400, "PUBLIC_SLUG_TAKEN", "Public slug is already used by another program.");
      }
    }

    const programme = await prisma.programme.create({
      data: {
        name: body.name,
        country: body.country,
        county: body.county,
        description: body.description,
        coverImageUrl: body.coverImageUrl,
        publicSlug: body.publicSlug,
        publicStatus: body.publicStatus,
        fundingGoalCents: body.fundingGoalCents,
        fundingSummary: body.fundingSummary,
        impactSummary: body.impactSummary,
        fundingDeadline: body.fundingDeadline ? new Date(body.fundingDeadline) : null,
        allowInvestments: body.allowInvestments,
        allowDonations: body.allowDonations,
        partnerId: primaryPartnerId,
        partnerLinks: {
          create: programmeLinkData(partnerIds, lenderPartnerIds)
        }
      },
      include: programmeInclude
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PROGRAMME",
      entityId: programme.id,
      type: "PROGRAMME_CREATED",
      payload: programme
    });

    ok(res.status(201), programme);
  } catch (error) {
    next(error);
  }
});

router.patch("/programmes/:id", requireAuth("programmes:write"), async (req, res, next) => {
  try {
    const programmeId = z.string().parse(req.params.id);
    const body = programmeUpdateSchema.parse(req.body);
    const existing = await prisma.programme.findFirst({
      where: {
        AND: [{ id: programmeId }, programmeScopeForUser(req.user)]
      },
      include: programmeInclude
    });

    if (!existing) {
      throw new ApiHttpError(404, "PROGRAMME_NOT_FOUND", "Program does not exist or is outside this account.");
    }

    if (body.publicSlug) {
      const slugOwner = await prisma.programme.findUnique({
        where: { publicSlug: body.publicSlug },
        select: { id: true }
      });
      if (slugOwner && slugOwner.id !== existing.id) {
        throw new ApiHttpError(400, "PUBLIC_SLUG_TAKEN", "Public slug is already used by another program.");
      }
    }

    const linksRequested =
      body.partnerId !== undefined ||
      body.partnerIds !== undefined ||
      body.lenderPartnerIds !== undefined;
    const currentPartnerIds =
      existing.partnerLinks
        ?.filter((link) => link.role !== "LENDER")
        .map((link) => link.partnerId) ?? [existing.partnerId];
    const currentLenderPartnerIds =
      existing.partnerLinks
        ?.filter((link) => link.role === "LENDER")
        .map((link) => link.partnerId) ?? [];
    const partnerIds = linksRequested
      ? Array.from(new Set([body.partnerId, ...(body.partnerIds ?? [])].filter(Boolean))) as string[]
      : currentPartnerIds;
    const lenderPartnerIds = linksRequested
      ? Array.from(new Set(body.lenderPartnerIds ?? currentLenderPartnerIds))
      : currentLenderPartnerIds;
    const primaryPartnerId = partnerIds[0] ?? lenderPartnerIds[0];

    if (linksRequested) {
      if (!primaryPartnerId) {
        throw new ApiHttpError(400, "PARTNER_REQUIRED", "A program requires at least one partner or lender.");
      }
      await validatePartnerLinksForUser(req.user, [...partnerIds, ...lenderPartnerIds]);
    }

    const programme = await prisma.$transaction(async (tx) => {
      await tx.programme.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          country: body.country,
          county: body.county === undefined ? undefined : body.county,
          description: body.description === undefined ? undefined : body.description,
          coverImageUrl: body.coverImageUrl === undefined ? undefined : body.coverImageUrl,
          publicSlug: body.publicSlug === undefined ? undefined : body.publicSlug,
          publicStatus: body.publicStatus,
          fundingGoalCents: body.fundingGoalCents,
          fundingSummary: body.fundingSummary === undefined ? undefined : body.fundingSummary,
          impactSummary: body.impactSummary === undefined ? undefined : body.impactSummary,
          fundingDeadline:
            body.fundingDeadline === undefined
              ? undefined
              : body.fundingDeadline
                ? new Date(body.fundingDeadline)
                : null,
          allowInvestments: body.allowInvestments,
          allowDonations: body.allowDonations,
          partnerId: linksRequested ? primaryPartnerId : undefined
        }
      });

      if (linksRequested) {
        await tx.programmePartner.deleteMany({ where: { programmeId: existing.id } });
        await tx.programmePartner.createMany({
          data: programmeLinkData(partnerIds, lenderPartnerIds).map((link) => ({
            programmeId: existing.id,
            ...link
          }))
        });
      }

      return tx.programme.findUniqueOrThrow({
        where: { id: existing.id },
        include: programmeInclude
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PROGRAMME",
      entityId: programme.id,
      type: "PROGRAMME_UPDATED",
      payload: {
        before: existing,
        after: programme
      }
    });

    ok(res, programme);
  } catch (error) {
    next(error);
  }
});

const programmeAssetSchema = z.object({
  type: z.enum(["IMAGE", "FILE"]),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PRIVATE"),
  title: z.string().min(2),
  description: z.string().optional(),
  url: z.string().url(),
  fileName: z.string().optional(),
  mimeType: z.string().optional()
});

const programmeAssetUpdateSchema = z.object({
  type: z.enum(["IMAGE", "FILE"]).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  url: z.string().url().optional(),
  fileName: z.string().nullable().optional(),
  mimeType: z.string().nullable().optional()
});

router.get("/programmes/:id/assets", requireAuth("programmes:read"), async (req, res, next) => {
  try {
    const programmeId = z.string().parse(req.params.id);
    const programme = await prisma.programme.findFirst({
      where: {
        AND: [{ id: programmeId }, programmeScopeForUser(req.user)]
      },
      select: { id: true }
    });

    if (!programme) {
      throw new ApiHttpError(404, "PROGRAMME_NOT_FOUND", "Program does not exist or is outside this account.");
    }

    const assets = await prisma.programmeAsset.findMany({
      where: { programmeId },
      orderBy: [{ type: "asc" }, { createdAt: "desc" }]
    });

    ok(res, assets);
  } catch (error) {
    next(error);
  }
});

router.post("/programmes/:id/assets", requireAuth("programmes:write"), async (req, res, next) => {
  try {
    const programmeId = z.string().parse(req.params.id);
    const body = programmeAssetSchema.parse(req.body);
    const programme = await prisma.programme.findFirst({
      where: {
        AND: [{ id: programmeId }, programmeScopeForUser(req.user)]
      },
      select: { id: true }
    });

    if (!programme) {
      throw new ApiHttpError(404, "PROGRAMME_NOT_FOUND", "Program does not exist or is outside this account.");
    }

    const asset = await prisma.programmeAsset.create({
      data: {
        programmeId,
        ...body
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PROGRAMME",
      entityId: programmeId,
      type: "PROGRAMME_ASSET_CREATED",
      payload: asset
    });

    ok(res.status(201), asset);
  } catch (error) {
    next(error);
  }
});

router.patch("/programmes/:id/assets/:assetId", requireAuth("programmes:write"), async (req, res, next) => {
  try {
    const programmeId = z.string().parse(req.params.id);
    const assetId = z.string().parse(req.params.assetId);
    const body = programmeAssetUpdateSchema.parse(req.body);
    const programme = await prisma.programme.findFirst({
      where: {
        AND: [{ id: programmeId }, programmeScopeForUser(req.user)]
      },
      select: { id: true }
    });

    if (!programme) {
      throw new ApiHttpError(404, "PROGRAMME_NOT_FOUND", "Program does not exist or is outside this account.");
    }

    const existing = await prisma.programmeAsset.findFirst({
      where: { id: assetId, programmeId }
    });

    if (!existing) {
      throw new ApiHttpError(404, "PROGRAMME_ASSET_NOT_FOUND", "Program asset does not exist.");
    }

    const asset = await prisma.programmeAsset.update({
      where: { id: existing.id },
      data: {
        type: body.type,
        visibility: body.visibility,
        title: body.title,
        description: body.description === undefined ? undefined : body.description,
        url: body.url,
        fileName: body.fileName === undefined ? undefined : body.fileName,
        mimeType: body.mimeType === undefined ? undefined : body.mimeType
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PROGRAMME",
      entityId: programmeId,
      type: "PROGRAMME_ASSET_UPDATED",
      payload: {
        before: existing,
        after: asset
      }
    });

    ok(res, asset);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/village-agents",
  requireAuth("village-agents:read"),
  async (req, res, next) => {
    try {
      const agents = await prisma.villageAgent.findMany({
        where: villageAgentScopeForUser(req.user),
        orderBy: { createdAt: "desc" },
        include: {
          programme: {
            include: {
              partner: true
            }
          },
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
          _count: {
            select: { groups: true }
          }
        }
      });

      ok(res, agents);
    } catch (error) {
      next(error);
    }
  }
);

const villageAgentSchema = z.object({
  programmeId: z.string().optional(),
  name: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  gender: z.string().optional(),
  projectOfficer: z.string().optional(),
  county: z.string().optional(),
  location: z.string().optional(),
  feedback: z.string().optional(),
  digitalLiteracyScore: z.number().int().min(0).max(100).default(80),
  caseloadLimit: z.number().int().min(1).max(100).default(25),
  groupIds: z.array(z.string()).default([])
});

const villageAgentUpdateSchema = z.object({
  programmeId: z.string().nullable().optional(),
  name: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
  email: z.string().email().nullable().optional(),
  gender: z.string().nullable().optional(),
  projectOfficer: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  feedback: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  digitalLiteracyScore: z.number().int().min(0).max(100).optional(),
  caseloadLimit: z.number().int().min(1).max(100).optional(),
  groupIds: z.array(z.string()).optional()
});

const villageAgentInclude = {
  programme: {
    include: {
      partner: true
    }
  },
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
  _count: {
    select: { groups: true }
  }
} satisfies Prisma.VillageAgentInclude;

async function assertProgrammeWriteScope(user: Express.Request["user"], programmeId?: string | null) {
  if (!programmeId) return null;

  const programme = await prisma.programme.findFirst({
    where: {
      AND: [{ id: programmeId }, programmeScopeForUser(user)]
    },
    select: { id: true }
  });

  if (!programme) {
    throw new ApiHttpError(404, "PROGRAMME_NOT_FOUND", "Selected program does not exist or is outside this account.");
  }

  return programme.id;
}

async function validateAgentGroupAssignment(input: {
  user: Express.Request["user"];
  groupIds: string[];
  caseloadLimit: number;
}) {
  const groupIds = Array.from(new Set(input.groupIds));

  if (groupIds.length > input.caseloadLimit) {
    throw new ApiHttpError(400, "CASELOAD_LIMIT_EXCEEDED", "Assigned groups exceed this VA / CBT caseload limit.");
  }

  if (groupIds.length === 0) return groupIds;

  const groups = await prisma.group.findMany({
    where: scopeGroupWhere(input.user, { id: { in: groupIds } }),
    select: { id: true }
  });

  if (groups.length !== groupIds.length) {
    throw new ApiHttpError(404, "GROUP_NOT_FOUND", "One or more selected groups do not exist or are outside this account.");
  }

  return groupIds;
}

async function setAgentGroups(
  tx: Prisma.TransactionClient,
  agentId: string,
  groupIds: string[]
) {
  await tx.group.updateMany({
    where: {
      villageAgentId: agentId,
      id: { notIn: groupIds.length > 0 ? groupIds : ["__no_selected_groups__"] }
    },
    data: { villageAgentId: null }
  });

  if (groupIds.length > 0) {
    await tx.group.updateMany({
      where: { id: { in: groupIds } },
      data: { villageAgentId: agentId }
    });
  }
}

router.post(
  "/village-agents",
  requireAuth("village-agents:write"),
  async (req, res, next) => {
    try {
      const body = villageAgentSchema.parse(req.body);
      const { groupIds, programmeId, ...agentInput } = body;
      const scopedProgrammeId = await assertProgrammeWriteScope(req.user, programmeId);
      const assignmentIds = await validateAgentGroupAssignment({
        user: req.user,
        groupIds,
        caseloadLimit: agentInput.caseloadLimit
      });

      const agent = await prisma.$transaction(async (tx) => {
        const created = await tx.villageAgent.create({
          data: {
            ...agentInput,
            programmeId: scopedProgrammeId ?? undefined
          }
        });

        await setAgentGroups(tx, created.id, assignmentIds);

        return tx.villageAgent.findUniqueOrThrow({
          where: { id: created.id },
          include: villageAgentInclude
        });
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "VILLAGE_AGENT",
        entityId: agent.id,
        type: "VA_CREATED",
        payload: agent
      });

      ok(res.status(201), agent);
    } catch (error) {
      next(error);
    }
  }
);

router.patch(
  "/village-agents/:id",
  requireAuth("village-agents:write"),
  async (req, res, next) => {
    try {
      const agentId = z.string().parse(req.params.id);
      const body = villageAgentUpdateSchema.parse(req.body);
      const existing = await prisma.villageAgent.findFirst({
        where: {
          AND: [{ id: agentId }, villageAgentScopeForUser(req.user)]
        },
        select: {
          id: true,
          caseloadLimit: true
        }
      });

      if (!existing) {
        throw new ApiHttpError(404, "VILLAGE_AGENT_NOT_FOUND", "VA / CBT does not exist or is outside this account.");
      }

      const scopedProgrammeId =
        body.programmeId === undefined
          ? undefined
          : await assertProgrammeWriteScope(req.user, body.programmeId);
      const nextCaseloadLimit = body.caseloadLimit ?? existing.caseloadLimit;
      const assignmentIds =
        body.groupIds === undefined
          ? undefined
          : await validateAgentGroupAssignment({
              user: req.user,
              groupIds: body.groupIds,
              caseloadLimit: nextCaseloadLimit
            });

      const updated = await prisma.$transaction(async (tx) => {
        await tx.villageAgent.update({
          where: { id: existing.id },
          data: {
            programmeId: body.programmeId === undefined ? undefined : scopedProgrammeId,
            name: body.name,
            phone: body.phone,
            email: body.email === undefined ? undefined : body.email,
            gender: body.gender === undefined ? undefined : body.gender,
            projectOfficer: body.projectOfficer === undefined ? undefined : body.projectOfficer,
            county: body.county === undefined ? undefined : body.county,
            location: body.location === undefined ? undefined : body.location,
            feedback: body.feedback === undefined ? undefined : body.feedback,
            status: body.status,
            digitalLiteracyScore: body.digitalLiteracyScore,
            caseloadLimit: body.caseloadLimit
          }
        });

        if (assignmentIds) {
          await setAgentGroups(tx, existing.id, assignmentIds);
        }

        return tx.villageAgent.findUniqueOrThrow({
          where: { id: existing.id },
          include: villageAgentInclude
        });
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "VILLAGE_AGENT",
        entityId: updated.id,
        type: "VA_UPDATED",
        payload: {
          action: "UPDATED",
          agentId: updated.id,
          groupIds: updated.groups.map((group) => group.id)
        }
      });

      ok(res, updated);
    } catch (error) {
      next(error);
    }
  }
);

export { router as adminRouter };
