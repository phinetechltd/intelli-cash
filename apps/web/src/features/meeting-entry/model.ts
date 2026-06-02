import type { GroupRow, LedgerEntry, MeetingRow, Member } from "../../types/dashboard";
import type { OfflineMeetingLedgerEntry } from "../../lib/meeting-offline-store";

export interface MeetingWithGroup extends MeetingRow {
  group: {
    id: string;
    name: string;
    code: string;
    county: string;
    shareValueCents?: number;
    maxSharesPerMemberPerMeeting?: number;
  };
}

export interface GroupDetail extends GroupRow {
  fundAccounts: Array<{ id: string; type: string; balanceCents: number; currency: string }>;
}

export interface UnlockRow {
  memberId: string;
  pin: string;
  credentialType: "DEFAULT_PIN" | "CURRENT_OTP";
}

export interface EntryAmounts {
  sharePurchase: string;
  loanRepayment: string;
  loanDisbursement: string;
  socialFund: string;
}

export const entryAmountFields: Array<{
  key: keyof EntryAmounts;
  label: string;
  shortLabel: string;
  presets: number[];
}> = [
  { key: "sharePurchase", label: "Share purchase", shortLabel: "Share purchase", presets: [100, 500, 1000] },
  { key: "loanRepayment", label: "Loan repayment", shortLabel: "Loan repayment", presets: [500, 1000, 2000] },
  {
    key: "loanDisbursement",
    label: "Loan disbursement",
    shortLabel: "Loan disbursement",
    presets: [1000, 5000, 10000]
  },
  { key: "socialFund", label: "Social fund", shortLabel: "Social fund", presets: [50, 100, 200] }
];

export interface ShareOutPreview {
  poolAmountCents: number;
  totalShareCents: number;
  roundingDifferenceCents: number;
  rows: Array<{
    memberId: string;
    member?: { fullName: string; role: string } | null;
    sharePurchaseCents: number;
    shareCount: number;
    percentage: number;
    payoutCents: number;
  }>;
}

export interface SyncConflict {
  kind: string;
  clientRequestId?: string | null;
  memberId?: string;
  code: string;
  message: string;
}

export const workflowSteps = [
  "Unlock",
  "Attendance",
  "Share purchase",
  "Loan repayment",
  "Loan disbursement",
  "Social fund",
  "Share-out",
  "Review",
  "Seal"
];

export const defaultUnlockRows: UnlockRow[] = Array.from({ length: 5 }, () => ({
  memberId: "",
  pin: "",
  credentialType: "DEFAULT_PIN"
}));

export function emptyAmounts(): EntryAmounts {
  return {
    sharePurchase: "",
    loanRepayment: "",
    loanDisbursement: "",
    socialFund: ""
  };
}

export function amountToCents(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

export function clientRequestId(meetingId: string, memberId: string, type: string) {
  return `${meetingId}-${memberId}-${type}-${Date.now()}`;
}

export function typedEntriesFromAmounts(
  meetingId: string,
  members: Member[],
  amounts: Record<string, EntryAmounts>,
  shareValueCents = 0
) {
  const entries: OfflineMeetingLedgerEntry[] = [];
  const membersById = new Map(members.map((member) => [member.id, member]));

  Object.entries(amounts).forEach(([memberId, row]) => {
    const member = membersById.get(memberId);
    const memberLabel = member?.fullName ?? "Member";
    const sharePurchase = amountToCents(row.sharePurchase);
    const loanRepayment = amountToCents(row.loanRepayment);
    const loanDisbursement = amountToCents(row.loanDisbursement);
    const socialFund = amountToCents(row.socialFund);

    if (sharePurchase > 0) {
      const shareCount =
        shareValueCents > 0 && sharePurchase % shareValueCents === 0
          ? sharePurchase / shareValueCents
          : null;
      entries.push({
        memberId,
        type: "SHARE_PURCHASE",
        amountCents: sharePurchase,
        description: shareCount ? `${memberLabel} bought ${shareCount} shares` : `${memberLabel} share purchase`,
        clientRequestId: clientRequestId(meetingId, memberId, "shares")
      });
    }
    if (loanRepayment > 0) {
      entries.push({
        memberId,
        type: "LOAN_REPAYMENT",
        amountCents: loanRepayment,
        description: `${memberLabel} loan repayment`,
        clientRequestId: clientRequestId(meetingId, memberId, "repayment")
      });
    }
    if (loanDisbursement > 0) {
      entries.push({
        memberId,
        type: "INTERNAL_LOAN_DISBURSEMENT",
        amountCents: loanDisbursement,
        description: `${memberLabel} loan disbursement`,
        clientRequestId: clientRequestId(meetingId, memberId, "disbursement")
      });
    }
    if (socialFund > 0) {
      entries.push({
        memberId,
        type: "SOCIAL_CONTRIBUTION",
        amountCents: socialFund,
        description: `${memberLabel} social fund`,
        clientRequestId: clientRequestId(meetingId, memberId, "social")
      });
    }
  });

  return entries;
}

export function totalLedgerCents(entries: LedgerEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.amountCents, 0);
}
