import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { appendAuditEvent } from "../services/audit-service";
import { getIntegrationAdapter, getIntegrationHealth } from "../domain/integrations";
import { requireAuth } from "../middleware/auth";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  decryptCredentials,
  encryptCredentials,
  getStoredCredentialContext,
  sanitizeCredentials
} from "../services/integration-credentials";

const router = Router();
const credentialSchema = z.object({
  credentials: z.record(z.string()).default({})
});

router.get(
  "/integrations/GOOGLE_MAPS/public-config",
  requireAuth("integrations:read"),
  async (_req, res, next) => {
    try {
      const adapter = getIntegrationAdapter("GOOGLE_MAPS");

      if (!adapter) {
        throw new ApiHttpError(404, "INTEGRATION_NOT_FOUND", "Integration provider is unknown.");
      }

      const config = await prisma.integrationConfig.upsert({
        where: { provider: adapter.provider },
        create: {
          provider: adapter.provider,
          displayName: adapter.displayName,
          requiredEnvJson: JSON.stringify(adapter.requiredEnv)
        },
        update: {
          displayName: adapter.displayName,
          requiredEnvJson: JSON.stringify(adapter.requiredEnv)
        }
      });
      const credentials = decryptCredentials(config.credentialsJson);
      const storedKey = credentials.GOOGLE_MAPS_BROWSER_API_KEY;
      const envKey = env.GOOGLE_MAPS_BROWSER_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      const apiKey = storedKey || envKey || "";

      ok(res, {
        provider: adapter.provider,
        displayName: adapter.displayName,
        configured: Boolean(apiKey),
        apiKey: apiKey || null,
        source: storedKey ? "stored" : envKey ? "env" : "none"
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/integrations/health", requireAuth("integrations:read"), async (req, res, next) => {
  try {
    const { credentialsByProvider, metaByProvider } = await getStoredCredentialContext();
    const health = getIntegrationHealth(credentialsByProvider, metaByProvider);
    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "INTEGRATION",
      entityId: "health",
      type: "INTEGRATION_HEALTH_CHECKED",
      payload: {
        configured: health.configured,
        total: health.total
      }
    });

    ok(res, health);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/integrations/:provider/status",
  requireAuth("integrations:read"),
  async (req, res, next) => {
    try {
      const adapter = getIntegrationAdapter(String(req.params.provider ?? ""));

      if (!adapter) {
        throw new ApiHttpError(404, "INTEGRATION_NOT_FOUND", "Integration provider is unknown.");
      }

      const checkedAt = new Date();
      const config = await prisma.integrationConfig.upsert({
        where: { provider: adapter.provider },
        create: {
          provider: adapter.provider,
          displayName: adapter.displayName,
          requiredEnvJson: JSON.stringify(adapter.requiredEnv),
          lastCheckedAt: checkedAt
        },
        update: { lastCheckedAt: checkedAt }
      });

      ok(
        res,
        adapter.buildStatus(decryptCredentials(config.credentialsJson), {
          credentialsUpdatedAt: config.credentialsUpdatedAt?.toISOString() ?? null,
          lastCheckedAt: checkedAt.toISOString()
        })
      );
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/integrations/:provider/credentials",
  requireAuth("integrations:write"),
  async (req, res, next) => {
    try {
      const adapter = getIntegrationAdapter(String(req.params.provider ?? ""));

      if (!adapter) {
        throw new ApiHttpError(404, "INTEGRATION_NOT_FOUND", "Integration provider is unknown.");
      }

      const body = credentialSchema.parse(req.body);
      const incomingCredentials = sanitizeCredentials(body.credentials, adapter.requiredEnv);

      if (Object.keys(incomingCredentials).length === 0) {
        throw new ApiHttpError(
          400,
          "NO_CREDENTIALS",
          "At least one supported credential value is required."
        );
      }

      const updatedAt = new Date();
      const existing = await prisma.integrationConfig.findUnique({
        where: { provider: adapter.provider }
      });
      const credentials = {
        ...decryptCredentials(existing?.credentialsJson),
        ...incomingCredentials
      };
      const config = await prisma.integrationConfig.upsert({
        where: { provider: adapter.provider },
        create: {
          provider: adapter.provider,
          displayName: adapter.displayName,
          requiredEnvJson: JSON.stringify(adapter.requiredEnv),
          credentialsJson: encryptCredentials(credentials),
          credentialsUpdatedAt: updatedAt
        },
        update: {
          credentialsJson: encryptCredentials(credentials),
          credentialsUpdatedAt: updatedAt,
          requiredEnvJson: JSON.stringify(adapter.requiredEnv)
        }
      });

      const status = adapter.buildStatus(credentials, {
        credentialsUpdatedAt: updatedAt.toISOString(),
        lastCheckedAt: config.lastCheckedAt?.toISOString() ?? null
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "INTEGRATION",
        entityId: adapter.provider,
        type: "INTEGRATION_CREDENTIALS_UPDATED",
        payload: {
          provider: adapter.provider,
          credentialKeys: Object.keys(credentials),
          configured: status.configured
        }
      });

      ok(res, status);
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/integrations/:provider/credentials",
  requireAuth("integrations:write"),
  async (req, res, next) => {
    try {
      const adapter = getIntegrationAdapter(String(req.params.provider ?? ""));

      if (!adapter) {
        throw new ApiHttpError(404, "INTEGRATION_NOT_FOUND", "Integration provider is unknown.");
      }

      await prisma.integrationConfig.updateMany({
        where: { provider: adapter.provider },
        data: {
          credentialsJson: null,
          credentialsUpdatedAt: null
        }
      });

      const status = adapter.buildStatus({}, { credentialsUpdatedAt: null });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "INTEGRATION",
        entityId: adapter.provider,
        type: "INTEGRATION_CREDENTIALS_UPDATED",
        payload: {
          provider: adapter.provider,
          credentialKeys: [],
          configured: status.configured,
          cleared: true
        }
      });

      ok(res, status);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/integrations/:provider/test",
  requireAuth("integrations:test"),
  async (req, res, next) => {
    try {
      const adapter = getIntegrationAdapter(String(req.params.provider ?? ""));

      if (!adapter) {
        throw new ApiHttpError(404, "INTEGRATION_NOT_FOUND", "Integration provider is unknown.");
      }

      const checkedAt = new Date();
      const config = await prisma.integrationConfig.upsert({
        where: { provider: adapter.provider },
        create: {
          provider: adapter.provider,
          displayName: adapter.displayName,
          requiredEnvJson: JSON.stringify(adapter.requiredEnv),
          lastCheckedAt: checkedAt
        },
        update: { lastCheckedAt: checkedAt }
      });
      const credentials = decryptCredentials(config.credentialsJson);
      const result = await adapter.test(credentials, {
        credentialsUpdatedAt: config.credentialsUpdatedAt?.toISOString() ?? null,
        lastCheckedAt: checkedAt.toISOString()
      });

      ok(res, result);
    } catch (error) {
      next(error);
    }
  }
);

export { router as integrationsRouter };
