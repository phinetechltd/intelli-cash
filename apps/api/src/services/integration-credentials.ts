import type { IntegrationProvider } from "@intellicash/shared";
import { decryptJson, encryptJson } from "../lib/crypto";
import { prisma } from "../lib/prisma";

export type CredentialMap = Record<string, string>;

export function sanitizeCredentials(input: Record<string, unknown>, allowedKeys: string[]) {
  const allowed = new Set(allowedKeys);
  const credentials: CredentialMap = {};

  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key) || typeof value !== "string") continue;

    const trimmed = value.trim();
    if (trimmed) credentials[key] = trimmed;
  }

  return credentials;
}

export function decryptCredentials(ciphertext?: string | null): CredentialMap {
  if (!ciphertext) return {};

  const payload = decryptJson<unknown>(ciphertext);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0
    )
  );
}

export async function getStoredCredentialContext() {
  const configs = await prisma.integrationConfig.findMany();
  const credentialsByProvider: Partial<Record<IntegrationProvider, CredentialMap>> = {};
  const metaByProvider: Partial<
    Record<IntegrationProvider, { credentialsUpdatedAt?: string | null; lastCheckedAt?: string | null }>
  > = {};

  for (const config of configs) {
    const provider = config.provider as IntegrationProvider;
    credentialsByProvider[provider] = decryptCredentials(config.credentialsJson);
    metaByProvider[provider] = {
      credentialsUpdatedAt: config.credentialsUpdatedAt?.toISOString() ?? null,
      lastCheckedAt: config.lastCheckedAt?.toISOString() ?? null
    };
  }

  return { credentialsByProvider, metaByProvider };
}

export function encryptCredentials(credentials: CredentialMap) {
  return encryptJson(credentials);
}
