import { Router } from "express";
import { z } from "zod";
import type { Permission } from "@intellicash/shared";
import { apiKeyPresets, apiKeyTokenPrefix, findApiKeyPreset } from "../domain/api-keys";
import { requireAuth } from "../middleware/auth";
import { appendAuditEvent } from "../services/audit-service";
import { permissionsForRoleFromStore } from "../services/role-permission-service";
import { createOpaqueToken, sha256 } from "../lib/crypto";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";

const router = Router();

const apiKeyCreateSchema = z.object({
  name: z.string().min(2).max(80),
  preset: z.enum(["MOBILE_CORE"]).default("MOBILE_CORE")
});

function parseScopes(scopesJson: string) {
  try {
    const parsed = JSON.parse(scopesJson);
    return Array.isArray(parsed) ? parsed.filter((scope): scope is Permission => typeof scope === "string") : [];
  } catch {
    return [];
  }
}

async function serializeApiKey(apiKey: {
  id: string;
  name: string;
  scopesJson: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}, role: string) {
  const rolePermissions = await permissionsForRoleFromStore(role);
  const scopes = parseScopes(apiKey.scopesJson);

  return {
    id: apiKey.id,
    name: apiKey.name,
    scopes,
    effectiveScopes: scopes.filter((scope) => rolePermissions.includes(scope)),
    lastUsedAt: apiKey.lastUsedAt,
    createdAt: apiKey.createdAt,
    revokedAt: apiKey.revokedAt
  };
}

router.get("/api-keys/presets", requireAuth("api-keys:read"), async (_req, res, next) => {
  try {
    ok(res, apiKeyPresets);
  } catch (error) {
    next(error);
  }
});

router.get("/api-keys", requireAuth("api-keys:read"), async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: req.user?.id },
      orderBy: { createdAt: "desc" }
    });

    ok(res, await Promise.all(keys.map((key) => serializeApiKey(key, req.user?.role ?? ""))));
  } catch (error) {
    next(error);
  }
});

router.post("/api-keys", requireAuth("api-keys:write"), async (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiHttpError(401, "UNAUTHENTICATED", "Authentication is required.");
    }

    const body = apiKeyCreateSchema.parse(req.body);
    const preset = findApiKeyPreset(body.preset);

    if (!preset) {
      throw new ApiHttpError(404, "API_KEY_PRESET_NOT_FOUND", "API key preset is unknown.");
    }

    const token = `${apiKeyTokenPrefix}${createOpaqueToken()}`;
    const apiKey = await prisma.apiKey.create({
      data: {
        userId: req.user.id,
        name: body.name,
        tokenHash: sha256(token),
        scopesJson: JSON.stringify(preset.scopes)
      }
    });
    const serialized = await serializeApiKey(apiKey, req.user.role);

    await appendAuditEvent({
      actorUserId: req.user.id,
      entityType: "API_KEY",
      entityId: apiKey.id,
      type: "API_KEY_CREATED",
      payload: {
        id: apiKey.id,
        name: apiKey.name,
        preset: preset.id,
        scopes: serialized.scopes,
        effectiveScopes: serialized.effectiveScopes
      }
    });

    ok(res.status(201), {
      ...serialized,
      token
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/api-keys/:id", requireAuth("api-keys:write"), async (req, res, next) => {
  try {
    const apiKeyId = z.string().parse(req.params.id);
    const existing = await prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId: req.user?.id
      }
    });

    if (!existing) {
      throw new ApiHttpError(404, "API_KEY_NOT_FOUND", "API key does not exist for this account.");
    }

    const revoked = await prisma.apiKey.update({
      where: { id: existing.id },
      data: {
        revokedAt: existing.revokedAt ?? new Date()
      }
    });
    const serialized = await serializeApiKey(revoked, req.user?.role ?? "");

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "API_KEY",
      entityId: revoked.id,
      type: "API_KEY_REVOKED",
      payload: {
        id: revoked.id,
        name: revoked.name
      }
    });

    ok(res, serialized);
  } catch (error) {
    next(error);
  }
});

export { router as apiKeysRouter };
