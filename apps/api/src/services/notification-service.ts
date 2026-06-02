import { prisma } from "../lib/prisma";

export interface NotificationInput {
  userId?: string | null;
  title: string;
  body: string;
  type?: string;
  href?: string | null;
  createdAt?: Date;
}

function normalizeNotification(input: NotificationInput & { userId: string }) {
  return {
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: input.type ?? "INFO",
    href: input.href ?? null,
    createdAt: input.createdAt
  };
}

export async function createNotification(input: NotificationInput) {
  if (!input.userId) return null;

  return prisma.notification.create({
    data: normalizeNotification({ ...input, userId: input.userId })
  });
}

export async function createNotifications(inputs: NotificationInput[]) {
  const rows = inputs
    .filter((input): input is NotificationInput & { userId: string } => Boolean(input.userId))
    .map(normalizeNotification);

  if (rows.length === 0) return { count: 0 };

  return prisma.notification.createMany({ data: rows });
}
