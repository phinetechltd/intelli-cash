import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

const notificationSelect = {
  id: true,
  title: true,
  body: true,
  type: true,
  href: true,
  readAt: true,
  createdAt: true
};

router.get("/notifications", requireAuth(), async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: notificationSelect
    });

    ok(res, notifications, {
      unreadCount: notifications.filter((notification) => !notification.readAt).length
    });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications/read-all", requireAuth(), async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() }
    });

    ok(res, { updated: result.count });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications/:notificationId/read", requireAuth(), async (req, res, next) => {
  try {
    const notificationId = z.string().min(1).parse(req.params.notificationId);
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: req.user!.id },
      select: { id: true }
    });

    if (!notification) {
      throw new ApiHttpError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
      select: notificationSelect
    });

    ok(res, updated);
  } catch (error) {
    next(error);
  }
});

export { router as notificationsRouter };
