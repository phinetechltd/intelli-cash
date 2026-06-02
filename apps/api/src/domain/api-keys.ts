import type { Permission } from "@intellicash/shared";

export const apiKeyTokenPrefix = "ic_sk_";
export const mobileCoreApiKeyScopes = [
  "programmes:read",
  "groups:read",
  "members:read",
  "members:write",
  "meetings:read",
  "meetings:write",
  "meeting-keys:write",
  "ledger:read",
  "ledger:write",
  "votes:read",
  "votes:write",
  "store:read",
  "store:write"
] as const satisfies readonly Permission[];

export const apiKeyPresets = [
  {
    id: "MOBILE_CORE",
    name: "Mobile Core",
    description: "Field app and mobile backend access for groups, members, meetings, ledger, votes, and Intelli-Store.",
    scopes: [...mobileCoreApiKeyScopes]
  }
] as const;

export type ApiKeyPresetId = (typeof apiKeyPresets)[number]["id"];

export function findApiKeyPreset(id: string) {
  return apiKeyPresets.find((preset) => preset.id === id);
}
