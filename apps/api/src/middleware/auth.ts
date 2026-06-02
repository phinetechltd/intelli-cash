import type { NextFunction, Request, Response } from "express";
import { parse, serialize } from "cookie";
import type { Permission } from "@intellicash/shared";
import { permissionsForRoleFromStore } from "../services/role-permission-service";
import { apiKeyTokenPrefix } from "../domain/api-keys";
import { ApiHttpError } from "../lib/http";
import { createOpaqueToken, sha256, signValue, verifySignedValue } from "../lib/crypto";
import { prisma } from "../lib/prisma";

const sessionCookieName = "ic_session";
const sessionTtlMs = 1000 * 60 * 60 * 8;

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  languagePreference: string;
  partnerId: string | null;
  groupId: string | null;
  memberId: string | null;
  permissions: Permission[];
  partner?: { id: string; name: string } | null;
  group?: { id: string; name: string; code: string } | null;
  member?: { id: string; fullName: string; phone: string } | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionTokenHash?: string;
      apiKeyId?: string;
    }
  }
}

export async function createSession(userId: string) {
  const token = createOpaqueToken();
  const signature = signValue(token);
  const tokenHash = sha256(token);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + sessionTtlMs)
    }
  });

  return `${token}.${signature}`;
}

export function serializeSessionCookie(value: string) {
  return serialize(sessionCookieName, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlMs / 1000
  });
}

export function serializeExpiredSessionCookie() {
  return serialize(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function resolveUserFromRequest(req: Request) {
  const rawCookie = req.headers.cookie ? parse(req.headers.cookie)[sessionCookieName] : undefined;
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : undefined;

  if (bearer?.startsWith(apiKeyTokenPrefix)) {
    return resolveUserFromApiKey(req, bearer);
  }

  const credential = bearer ?? rawCookie;

  if (!credential) {
    return null;
  }

  const [token, signature] = credential.split(".");
  if (!token || !signature || !verifySignedValue(token, signature)) {
    return null;
  }

  const tokenHash = sha256(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          partner: { select: { id: true, name: true } },
          group: { select: { id: true, name: true, code: true } },
          member: { select: { id: true, fullName: true, phone: true } }
        }
      }
    }
  });

  if (!session || session.expiresAt.getTime() < Date.now() || session.user.status !== "ACTIVE") {
    return null;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() }
  });

  const permissions = await permissionsForRoleFromStore(session.user.role);

  req.sessionTokenHash = tokenHash;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    avatarUrl: session.user.avatarUrl,
    languagePreference: session.user.languagePreference,
    partnerId: session.user.partnerId,
    groupId: session.user.groupId,
    memberId: session.user.memberId,
    permissions,
    partner: session.user.partner,
    group: session.user.group,
    member: session.user.member
  };
}

async function resolveUserFromApiKey(req: Request, token: string) {
  const tokenHash = sha256(token);
  const apiKey = await prisma.apiKey.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          partner: { select: { id: true, name: true } },
          group: { select: { id: true, name: true, code: true } },
          member: { select: { id: true, fullName: true, phone: true } }
        }
      }
    }
  });

  if (!apiKey || apiKey.revokedAt || apiKey.user.status !== "ACTIVE") {
    return null;
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });

  const rolePermissions = await permissionsForRoleFromStore(apiKey.user.role);
  let keyScopes: Permission[] = [];
  try {
    const parsed = JSON.parse(apiKey.scopesJson);
    keyScopes = Array.isArray(parsed)
      ? parsed.filter((scope): scope is Permission => rolePermissions.includes(scope))
      : [];
  } catch {
    keyScopes = [];
  }

  req.apiKeyId = apiKey.id;
  return {
    id: apiKey.user.id,
    name: apiKey.user.name,
    email: apiKey.user.email,
    role: apiKey.user.role,
    avatarUrl: apiKey.user.avatarUrl,
    languagePreference: apiKey.user.languagePreference,
    partnerId: apiKey.user.partnerId,
    groupId: apiKey.user.groupId,
    memberId: apiKey.user.memberId,
    permissions: keyScopes,
    partner: apiKey.user.partner,
    group: apiKey.user.group,
    member: apiKey.user.member
  };
}

export function requireAuth(permission?: Permission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = await resolveUserFromRequest(req);

      if (!user) {
        throw new ApiHttpError(401, "UNAUTHENTICATED", "Authentication is required.");
      }

      if (permission && !user.permissions.includes(permission)) {
        throw new ApiHttpError(403, "FORBIDDEN", "You do not have permission for this action.");
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
