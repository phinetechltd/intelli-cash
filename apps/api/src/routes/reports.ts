import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedUser } from "../middleware/auth";
import { ledgerScopeForUser, scopeGroupWhere } from "../services/account-scope";
import { ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

function hasPermission(user: AuthenticatedUser | undefined, permission: string) {
  return Boolean(user && (user.permissions as readonly string[]).includes(permission));
}

function canReadImportedKpis(user: AuthenticatedUser | undefined) {
  if (!user || !hasPermission(user, "programmes:read")) return false;
  return ["IWL_ADMIN", "READ_ONLY", "PARTNER_OFFICER", "LENDER"].includes(user.role);
}

function reportUserWhere(user?: AuthenticatedUser): Prisma.UserWhereInput {
  if (!user) return { id: "__no_access__" };

  if (["IWL_ADMIN", "READ_ONLY"].includes(user.role)) return {};

  if (user.partnerId) return { partnerId: user.partnerId };
  if (user.groupId) return { groupId: user.groupId };
  return { id: user.id };
}

function reportAccountScope(user?: AuthenticatedUser) {
  if (!user) {
    return {
      userId: null,
      name: "Unauthenticated",
      email: null,
      role: null,
      scopeType: "NONE",
      scopeId: null,
      scopeName: "No account scope",
      permissions: []
    };
  }

  if (user.member) {
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      scopeType: "MEMBER",
      scopeId: user.member.id,
      scopeName: `${user.member.fullName}${user.group ? ` in ${user.group.name}` : ""}`,
      permissions: user.permissions
    };
  }

  if (user.group) {
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      scopeType: "GROUP",
      scopeId: user.group.id,
      scopeName: `${user.group.name} (${user.group.code})`,
      permissions: user.permissions
    };
  }

  if (user.partner) {
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      scopeType: user.role === "LENDER" ? "LENDER" : "PARTNER",
      scopeId: user.partner.id,
      scopeName: user.partner.name,
      permissions: user.permissions
    };
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    scopeType: "PLATFORM",
    scopeId: null,
    scopeName: "Platform portfolio",
    permissions: user.permissions
  };
}

router.get("/reports/foundation", requireAuth("analytics:read"), async (req, res, next) => {
  try {
    const groupWhere = scopeGroupWhere(req.user);
    const accessibleGroups = await prisma.group.findMany({
      where: groupWhere,
      select: { county: true }
    });
    const scopedCounties = Array.from(new Set(accessibleGroups.map((group) => group.county)));
    const countyWhere = Object.keys(groupWhere).length > 0 ? { county: { in: scopedCounties } } : {};
    const userWhere = reportUserWhere(req.user);
    const canReadLedger = hasPermission(req.user, "ledger:read");
    const canReadUsers = hasPermission(req.user, "users:read");
    const canReadMeetings = hasPermission(req.user, "meetings:read");
    const canReadVotes = hasPermission(req.user, "votes:read");
    const canReadKpis = canReadImportedKpis(req.user);
    const [
      fundAccounts,
      ledgerEntries,
      users,
      meetings,
      votes,
      ftmaCountyVslaKpis,
      ftmaCountyVslaTrainingMetrics,
      ftmaCountyFscKpis
    ] = await Promise.all([
      canReadLedger
        ? prisma.fundAccount.findMany({
            where: { group: groupWhere },
            orderBy: [{ type: "asc" }, { balanceCents: "desc" }],
            include: {
              group: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  county: true,
                  phase: true,
                  sourceSystem: true,
                  programme: { select: { name: true } },
                  villageAgent: { select: { name: true } },
                  _count: { select: { members: true, meetings: true, votes: true } }
                }
              }
            }
          })
        : Promise.resolve([]),
      canReadLedger
        ? prisma.ledgerEntry.findMany({
            where: ledgerScopeForUser(req.user),
            orderBy: { createdAt: "desc" },
            include: {
              group: { select: { id: true, name: true, code: true, county: true, sourceSystem: true } },
              member: { select: { fullName: true } },
              fundAccount: { select: { type: true, currency: true } },
              meeting: { select: { title: true, status: true } }
            }
          })
        : Promise.resolve([]),
      canReadUsers
        ? prisma.user.findMany({
            where: userWhere,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              createdAt: true,
              partner: { select: { name: true } },
              group: { select: { id: true, name: true, code: true } },
              member: { select: { id: true, fullName: true } },
              sessions: { select: { expiresAt: true, lastUsedAt: true } },
              apiKeys: { select: { revokedAt: true, lastUsedAt: true } }
            }
          })
        : Promise.resolve([]),
      canReadMeetings
        ? prisma.meeting.findMany({
            where: { group: groupWhere },
            orderBy: { scheduledAt: "desc" },
            include: {
              group: { select: { id: true, name: true, code: true, county: true, phase: true, sourceSystem: true } },
              _count: { select: { attendance: true, ledgerEntries: true, votes: true } }
            }
          })
        : Promise.resolve([]),
      canReadVotes
        ? prisma.vote.findMany({
            where: { group: groupWhere },
            orderBy: { createdAt: "desc" },
            include: {
              group: { select: { id: true, name: true, code: true, county: true, phase: true, sourceSystem: true } }
            }
          })
        : Promise.resolve([]),
      canReadKpis
        ? prisma.ftmaCountyVslaKpi.findMany({ where: countyWhere, orderBy: { county: "asc" } })
        : Promise.resolve([]),
      canReadKpis
        ? prisma.ftmaCountyVslaTrainingMetric.findMany({ where: countyWhere, orderBy: { county: "asc" } })
        : Promise.resolve([]),
      canReadKpis
        ? prisma.ftmaCountyFscKpi.findMany({ where: countyWhere, orderBy: { county: "asc" } })
        : Promise.resolve([])
    ]);

    ok(res, {
      account: reportAccountScope(req.user),
      visibility: {
        fundAccounts: canReadLedger,
        ledgerEntries: canReadLedger,
        users: canReadUsers,
        meetings: canReadMeetings,
        votes: canReadVotes,
        importedKpis: canReadKpis
      },
      fundAccounts,
      ledgerEntries,
      users,
      meetings,
      votes,
      ftmaCountyVslaKpis: ftmaCountyVslaKpis.map((row) => ({
        ...row,
        savingsCents: Number(row.savingsCents),
        outstandingLoanCents: Number(row.outstandingLoanCents),
        socialFundCents: Number(row.socialFundCents)
      })),
      ftmaCountyVslaTrainingMetrics,
      ftmaCountyFscKpis
    });
  } catch (error) {
    next(error);
  }
});

export { router as reportsRouter };
