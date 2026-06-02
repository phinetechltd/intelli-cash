import { hashPayload } from "../lib/crypto";

export function assertAppendOnlyOperation(operation: "create" | "update" | "delete") {
  if (operation !== "create") {
    throw new Error("Financial ledger entries are append-only and cannot be updated or deleted.");
  }
}

export function signLedgerEntry(payload: unknown) {
  return hashPayload(payload);
}
