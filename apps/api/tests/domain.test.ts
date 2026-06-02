import { describe, expect, it } from "vitest";
import { hasPermission, permissionsForRole } from "../src/domain/authorization";
import { calculateCreditScore } from "../src/domain/credit-score";
import { assertAppendOnlyOperation, signLedgerEntry } from "../src/domain/ledger";
import { assertMeetingStepOrder, canAdvanceMeetingStep } from "../src/domain/meeting-workflow";
import { getIntegrationAdapter, getIntegrationHealth } from "../src/domain/integrations";
import {
  canApproveIntelliAuditScope,
  detectEvidenceSignals,
  isUnsafeAuditRequest,
  normalizeReportStandard
} from "../src/domain/intelliaudit";

describe("authorization", () => {
  it("grants all permissions to IWL admin", () => {
    expect(hasPermission("IWL_ADMIN", "groups:write")).toBe(true);
    expect(hasPermission("IWL_ADMIN", "integrations:test")).toBe(true);
  });

  it("keeps partner officers read-oriented", () => {
    expect(hasPermission("PARTNER_OFFICER", "analytics:read")).toBe(true);
    expect(hasPermission("PARTNER_OFFICER", "audit:read")).toBe(true);
    expect(hasPermission("PARTNER_OFFICER", "intelliaudit:write")).toBe(true);
    expect(hasPermission("PARTNER_OFFICER", "groups:write")).toBe(false);
    expect(hasPermission("PARTNER_OFFICER", "members:write")).toBe(false);
    expect(permissionsForRole("UNKNOWN")).toEqual([]);
  });

  it("lets group accounts manage scoped group operations without payment rails", () => {
    expect(hasPermission("GROUP_ACCOUNT", "members:write")).toBe(true);
    expect(hasPermission("GROUP_ACCOUNT", "meetings:write")).toBe(true);
    expect(hasPermission("GROUP_ACCOUNT", "ledger:write")).toBe(true);
    expect(hasPermission("GROUP_ACCOUNT", "votes:write")).toBe(true);
    expect(hasPermission("GROUP_ACCOUNT", "payments:write")).toBe(false);
    expect(hasPermission("MEMBER", "payments:read")).toBe(false);
    expect(hasPermission("READ_ONLY", "payments:read")).toBe(false);
  });
});

describe("credit score", () => {
  it("calculates a weighted IWL score", () => {
    const score = calculateCreditScore({
      savingsConsistency: 90,
      repaymentRate: 80,
      attendanceRate: 100,
      constitutionCompliance: 70,
      socialFundHealth: 60,
      cycleAge: 50,
      securityCompliance: 100
    });

    expect(score.score).toBe(80);
    expect(score.breakdown.repaymentRate).toBe(20);
  });
});

describe("meeting workflow", () => {
  it("enforces the 8-step order", () => {
    expect(
      canAdvanceMeetingStep("OPENING_AND_3_KEY_SECURITY", "MINUTES_REVIEW")
    ).toBe(true);

    expect(() =>
      assertMeetingStepOrder(["OPENING_AND_3_KEY_SECURITY"], "SHARE_PURCHASE")
    ).toThrow(/Expected next meeting step/);
  });
});

describe("ledger", () => {
  it("rejects update/delete operations", () => {
    expect(() => assertAppendOnlyOperation("update")).toThrow(/append-only/);
    expect(signLedgerEntry({ amountCents: 100 })).toHaveLength(64);
  });
});

describe("integrations", () => {
  it("reports feature-gated sandbox configuration", () => {
    const health = getIntegrationHealth();
    const adapter = getIntegrationAdapter("MPESA_DARAJA");

    expect(health.total).toBeGreaterThan(0);
    expect(adapter?.buildStatus().missingEnv).toContain("MPESA_CONSUMER_KEY");
  });
});

describe("intelliaudit", () => {
  it("flags duplicates, large transactions, and missing source documents", () => {
    const signals = detectEvidenceSignals([
      {
        id: "record-1",
        documentId: "document-1",
        hash: "same-hash",
        amountCents: 150000000,
        reference: "BANK-1"
      },
      {
        id: "record-2",
        documentId: null,
        hash: "same-hash",
        amountCents: 150000000,
        reference: "BANK-1"
      }
    ]);

    expect(signals.map((signal) => signal.category)).toEqual(
      expect.arrayContaining(["DUPLICATE_RECORDS", "UNUSUAL_TRANSACTION", "MISSING_DOCUMENTATION"])
    );
  });

  it("blocks unsafe audit manipulation requests and normalizes report standards", () => {
    expect(isUnsafeAuditRequest("Please fabricate a clean audit report")).toBe(true);
    expect(isUnsafeAuditRequest("Explain the current variance")).toBe(false);
    expect(normalizeReportStandard("CGAP")).toBe("CGAP");
    expect(normalizeReportStandard("UNKNOWN")).toBe("IFRS");
  });

  it("allows scoped owner approval but not unrelated scopes", () => {
    expect(
      canApproveIntelliAuditScope(
        { id: "user-1", role: "PARTNER_OFFICER", partnerId: "partner-1", groupId: null },
        { scopeType: "PARTNER", scopeId: "partner-1" }
      )
    ).toBe(true);
    expect(
      canApproveIntelliAuditScope(
        { id: "user-1", role: "PARTNER_OFFICER", partnerId: "partner-1", groupId: null },
        { scopeType: "PARTNER", scopeId: "partner-2" }
      )
    ).toBe(false);
  });
});
