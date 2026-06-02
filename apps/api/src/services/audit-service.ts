import type { AuditEventType } from "@intellicash/shared";
import { hashPayload } from "../lib/crypto";
import { prisma } from "../lib/prisma";

export async function appendAuditEvent(input: {
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  type: AuditEventType;
  payload: unknown;
}) {
  return prisma.auditEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.type,
      payloadJson: JSON.stringify(input.payload),
      hash: hashPayload(input.payload)
    }
  });
}
