import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "../config/env";

export const uploadRoot = fileURLToPath(new URL("../../uploads/", import.meta.url));

export function ensureUploadDirectory(path = uploadRoot) {
  mkdirSync(path, { recursive: true });
}

export function publicUploadUrl(pathname: string) {
  return `${env.API_PUBLIC_URL.replace(/\/$/, "")}/uploads/${pathname.replace(/^\/+/, "")}`;
}
