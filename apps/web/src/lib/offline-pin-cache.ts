import { apiFetch } from "./api";
import {
  getMeetingDeviceId,
  storeOfflineVerifiers,
  type OfflineVerifier
} from "./meeting-offline-store";

export interface OfflinePinCacheRefresh {
  deviceId: string;
  verifiers: OfflineVerifier[];
  skipped?: Array<{ memberId: string; fullName: string; reason: string }>;
  encryption?: {
    algorithm: string;
    deviceBound: boolean;
    expiresAt: string;
  };
}

export async function refreshOfflinePinCache(groupId: string, deviceId = getMeetingDeviceId()) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;

  const refreshed = await apiFetch<OfflinePinCacheRefresh>(`/groups/${groupId}/offline-devices/refresh`, {
    method: "POST",
    body: JSON.stringify({ deviceId })
  });

  if (!Array.isArray(refreshed?.verifiers)) {
    return {
      deviceId,
      verifiers: [],
      skipped: []
    } satisfies OfflinePinCacheRefresh;
  }

  await storeOfflineVerifiers(deviceId, refreshed.verifiers);
  return { ...refreshed, deviceId };
}
