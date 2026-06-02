import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { languagePreferences } from "@intellicash/shared";
import { appendAuditEvent } from "../services/audit-service";
import {
  createSession,
  requireAuth,
  serializeExpiredSessionCookie,
  serializeSessionCookie
} from "../middleware/auth";
import { permissionsForRoleFromStore } from "../services/role-permission-service";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const profileUpdateSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    avatarUrl: z.string().url().nullable().optional(),
    languagePreference: z.enum(languagePreferences).optional()
  })
  .refine((body) => body.name !== undefined || body.avatarUrl !== undefined || body.languagePreference !== undefined, {
    message: "No profile fields provided."
  });

const passwordUpdateSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128)
});

async function serializeUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      partner: { select: { id: true, name: true } },
      group: { select: { id: true, name: true, code: true } },
      member: { select: { id: true, fullName: true, phone: true } }
    }
  });
  const permissions = await permissionsForRoleFromStore(user.role);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    permissions,
    avatarUrl: user.avatarUrl,
    languagePreference: user.languagePreference,
    partnerId: user.partnerId,
    groupId: user.groupId,
    memberId: user.memberId,
    partner: user.partner,
    group: user.group,
    member: user.member,
    createdAt: user.createdAt
  };
}

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    if (!user || user.status !== "ACTIVE") {
      throw new ApiHttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      throw new ApiHttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
    }

    const session = await createSession(user.id);
    const permissions = await permissionsForRoleFromStore(user.role);
    res.setHeader("Set-Cookie", serializeSessionCookie(session));

    await appendAuditEvent({
      actorUserId: user.id,
      entityType: "USER",
      entityId: user.id,
      type: "AUTH_LOGIN",
      payload: { email: user.email, role: user.role }
    });

    ok(res, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions,
      avatarUrl: user.avatarUrl,
      languagePreference: user.languagePreference,
      partnerId: user.partnerId,
      groupId: user.groupId,
      memberId: user.memberId
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", requireAuth(), async (req, res, next) => {
  try {
    if (req.sessionTokenHash) {
      await prisma.session.deleteMany({ where: { tokenHash: req.sessionTokenHash } });
    }

    if (req.user) {
      await appendAuditEvent({
        actorUserId: req.user.id,
        entityType: "USER",
        entityId: req.user.id,
        type: "AUTH_LOGOUT",
        payload: { email: req.user.email }
      });
    }

    res.setHeader("Set-Cookie", serializeExpiredSessionCookie());
    ok(res, { loggedOut: true });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth(), async (req, res) => {
  ok(res, req.user);
});

router.patch("/me", requireAuth(), async (req, res, next) => {
  try {
    const body = profileUpdateSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        name: body.name,
        avatarUrl: body.avatarUrl === undefined ? undefined : body.avatarUrl || null,
        languagePreference: body.languagePreference
      },
      select: { id: true, name: true, email: true, avatarUrl: true, languagePreference: true, role: true }
    });

    await appendAuditEvent({
      actorUserId: req.user!.id,
      entityType: "USER",
      entityId: user.id,
      type: "USER_PROFILE_UPDATED",
      payload: {
        email: user.email,
        role: user.role,
        name: user.name,
        avatarUrlSet: Boolean(user.avatarUrl),
        languagePreference: user.languagePreference
      }
    });

    ok(res, await serializeUser(user.id));
  } catch (error) {
    next(error);
  }
});

router.post("/me/password", requireAuth(), async (req, res, next) => {
  try {
    const body = passwordUpdateSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true, passwordHash: true, role: true }
    });

    if (!user) {
      throw new ApiHttpError(404, "USER_NOT_FOUND", "Signed-in account could not be found.");
    }

    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!valid) {
      throw new ApiHttpError(400, "CURRENT_PASSWORD_INVALID", "Current password is incorrect.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, 12) },
      select: { id: true }
    });

    await appendAuditEvent({
      actorUserId: user.id,
      entityType: "USER",
      entityId: user.id,
      type: "USER_PASSWORD_UPDATED",
      payload: { email: user.email, role: user.role }
    });

    ok(res, { updated: true });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
