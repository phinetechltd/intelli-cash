import { Router } from "express";
import { z } from "zod";
import { sha256 } from "../lib/crypto";
import { requireAuth } from "../middleware/auth";
import { appendAuditEvent } from "../services/audit-service";
import { ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

const webhookSchema = z.object({
  partnerId: z.string().optional(),
  url: z.string().url(),
  eventTypes: z.array(z.string()).min(1),
  secret: z.string().min(16)
});

router.post("/webhooks/subscribe", requireAuth("webhooks:write"), async (req, res, next) => {
  try {
    const body = webhookSchema.parse(req.body);
    const subscription = await prisma.webhookSubscription.create({
      data: {
        partnerId: body.partnerId,
        url: body.url,
        eventTypesJson: JSON.stringify(body.eventTypes),
        secretHash: sha256(body.secret)
      }
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "WEBHOOK_SUBSCRIPTION",
      entityId: subscription.id,
      type: "WEBHOOK_SUBSCRIBED",
      payload: {
        url: subscription.url,
        eventTypes: body.eventTypes,
        partnerId: body.partnerId ?? null
      }
    });

    ok(res.status(201), {
      ...subscription,
      eventTypes: JSON.parse(subscription.eventTypesJson)
    });
  } catch (error) {
    next(error);
  }
});

export { router as webhooksRouter };
