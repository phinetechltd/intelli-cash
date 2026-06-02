import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { groupScopeForUser, programmeScopeForUser } from "../services/account-scope";
import { ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

function parsePayload(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function payloadMatchesPartner(payload: unknown, partnerId: string) {
  if (!payload || typeof payload !== "object") return false;
  const text = JSON.stringify(payload);
  return text.includes(`"partnerId":"${partnerId}"`) || text.includes(`"id":"${partnerId}"`);
}

type AuditEventWithActor = {
  id: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  type: string;
  payloadJson: string;
  hash: string;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string;
    role: string;
    partnerId: string | null;
    groupId: string | null;
    memberId: string | null;
  } | null;
};

router.get("/audit/events", requireAuth("audit:read"), async (req, res, next) => {
  try {
    const events = await prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: req.user?.role === "IWL_ADMIN" || req.user?.role === "READ_ONLY" ? 100 : 300,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            partnerId: true,
            groupId: true,
            memberId: true
          }
        }
      }
    });
    const scopedEvents =
      req.user?.role === "PARTNER_OFFICER" || req.user?.role === "LENDER"
        ? await scopedPartnerAuditEvents(req.user, events)
        : events;

    ok(
      res,
      scopedEvents.slice(0, 100).map((event) => ({
        ...event,
        payload: parsePayload(event.payloadJson)
      }))
    );
  } catch (error) {
    next(error);
  }
});

async function scopedPartnerAuditEvents(
  user: NonNullable<Express.Request["user"]>,
  events: AuditEventWithActor[]
) {
  if (!user.partnerId) return [];
  const partnerId = user.partnerId;

  const [programmes, groups, partnerUsers] = await Promise.all([
    prisma.programme.findMany({
      where: programmeScopeForUser(user),
      select: { id: true }
    }),
    prisma.group.findMany({
      where: groupScopeForUser(user),
      select: { id: true }
    }),
    prisma.user.findMany({
      where: { partnerId: user.partnerId },
      select: { id: true }
    })
  ]);
  const programmeIds = new Set(programmes.map((programme) => programme.id));
  const groupIds = new Set(groups.map((group) => group.id));
  const userIds = new Set(partnerUsers.map((partnerUser) => partnerUser.id));

  return events.filter((event) => {
    const payload = parsePayload(event.payloadJson);
    if (event.actor?.partnerId === partnerId || userIds.has(event.actor?.id ?? "")) return true;
    if (event.entityType === "PARTNER" && event.entityId === partnerId) return true;
    if (event.entityType === "PROGRAMME" && programmeIds.has(event.entityId)) return true;
    if (event.entityType === "GROUP" && groupIds.has(event.entityId)) return true;
    if (event.entityType === "PAYMENT" && payloadMatchesPartner(payload, partnerId)) return true;
    return false;
  });
}

export { router as auditRouter };
