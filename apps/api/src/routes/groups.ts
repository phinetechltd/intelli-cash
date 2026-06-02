import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import {
  fundTypes,
  groupPhases,
  ledgerEntryTypes,
  meetingStepLabels,
  meetingSteps,
  memberRoles,
  resolutionTypes,
  type FundType,
  type LedgerEntryType,
  type MeetingStep
} from "@intellicash/shared";
import { assertMeetingStepOrder } from "../domain/meeting-workflow";
import { signLedgerEntry } from "../domain/ledger";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedUser } from "../middleware/auth";
import { appendAuditEvent } from "../services/audit-service";
import { createNotifications } from "../services/notification-service";
import {
  generateAndQueueMemberOtp,
  generateAndQueueMemberPin,
  serializeMemberPinDelivery,
  type MemberPinDeliveryPublic
} from "../services/member-pin-service";
import {
  assertGroupAccess,
  ledgerScopeForUser,
  memberScopeForUser,
  scopeGroupWhere
} from "../services/account-scope";
import { ApiHttpError, ok } from "../lib/http";
import { decryptJson, sha256 } from "../lib/crypto";
import { prisma } from "../lib/prisma";

const router = Router();
const credentialTransactionOptions = { timeout: 15_000 };

function routeParam(value: string | string[] | undefined, name: string) {
  if (typeof value === "string" && value.trim()) return value;
  throw new ApiHttpError(400, "INVALID_ROUTE_PARAM", `Missing route parameter: ${name}.`);
}

const groupCreateSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2),
  county: z.string().trim().min(2),
  phase: z.enum(groupPhases).default("MOBILISATION"),
  subCounty: z.string().trim().optional(),
  location: z.string().trim().optional(),
  composition: z.string().trim().optional(),
  objective: z.string().trim().optional(),
  contactPersonName: z.string().trim().optional(),
  contactPhone: z.string().trim().optional(),
  onboardingFeedback: z.string().trim().optional(),
  meetingDay: z.string().trim().optional(),
  gpsLatitude: z.number().optional(),
  gpsLongitude: z.number().optional(),
  gpsRadiusMeters: z.number().int().min(1).optional(),
  shareValueCents: z.number().int().min(1).optional(),
  maxSharesPerMemberPerMeeting: z.number().int().min(1).max(100).optional(),
  constitutionVersion: z.string().trim().optional(),
  cycleNumber: z.number().int().min(1).optional(),
  programmeIds: z.array(z.string()).default([]),
  villageAgentId: z.string().optional()
});

const groupUpdateSchema = groupCreateSchema.partial().extend({
  programmeIds: z.array(z.string()).optional()
});

const memberCreateSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  role: z.enum(memberRoles).default("MEMBER"),
  kycStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]).default("PENDING"),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
  nationalIdHash: z.string().optional()
});

const memberUpdateSchema = memberCreateSchema.partial();
const pinRequestSchema = z.object({}).strict();

const meetingCreateSchema = z.object({
  title: z.string().trim().min(2),
  scheduledAt: z.string().datetime(),
  gpsCompliant: z.boolean().default(false)
});

const meetingUpdateSchema = z.object({
  title: z.string().trim().min(2).optional(),
  scheduledAt: z.string().datetime().optional(),
  gpsCompliant: z.boolean().optional()
});

const meetingKeySubmissionSchema = z.object({
  memberId: z.string().optional(),
  pin: z.string().regex(/^\d{6}$/, "PIN must be 6 digits."),
  credentialType: z.enum(["DEFAULT_PIN", "CURRENT_OTP"]).optional(),
  deviceId: z.string().trim().min(2).max(120).optional(),
  capturedOfflineAt: z.string().datetime().optional()
});

const meetingKeySubmissionBatchSchema = z.object({
  submissions: z.array(meetingKeySubmissionSchema).min(1).max(12)
});

const meetingOpenSchema = z.object({
  gpsCompliant: z.boolean().default(false),
  keySubmissions: z.array(meetingKeySubmissionSchema).default([])
});

const attendanceSchema = z.object({
  memberId: z.string(),
  status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]).default("PRESENT")
});

const attendanceBatchItemSchema = attendanceSchema.extend({
  clientRequestId: z.string().trim().min(4).max(120).optional()
});

const meetingSealSchema = z.object({ minutes: z.string().optional() });

const ledgerCreateSchema = z.object({
  memberId: z.string().optional(),
  meetingId: z.string().optional(),
  fundAccountId: z.string(),
  type: z.enum(ledgerEntryTypes),
  amountCents: z.number().int().min(1),
  direction: z.enum(["CREDIT", "DEBIT"]),
  description: z.string().trim().min(2),
  externalReference: z.string().optional(),
  clientRequestId: z.string().trim().min(4).max(120).optional()
});

const meetingLedgerEntryTypes = [
  "SHARE_PURCHASE",
  "LOAN_REPAYMENT",
  "INTERNAL_LOAN_DISBURSEMENT",
  "SOCIAL_CONTRIBUTION",
  "SHARE_OUT_PAYOUT"
] as const;

const meetingLedgerEntrySchema = z.object({
  memberId: z.string(),
  type: z.enum(meetingLedgerEntryTypes),
  amountCents: z.number().int().min(1),
  description: z.string().trim().optional(),
  externalReference: z.string().optional(),
  clientRequestId: z.string().trim().min(4).max(120).optional()
});

const meetingLedgerBatchSchema = z.object({
  entries: z.array(meetingLedgerEntrySchema).min(1).max(250)
});

const offlineDevicePrepareSchema = z.object({
  deviceId: z.string().trim().min(2).max(120),
  cacheTtlHours: z.number().int().min(1).max(168).default(72),
  memberPins: z
    .array(
      z.object({
        memberId: z.string(),
        pin: z.string().regex(/^\d{6}$/)
      })
    )
    .min(1)
    .max(200)
});

const offlineDeviceRefreshSchema = z.object({
  deviceId: z.string().trim().min(2).max(120),
  cacheTtlHours: z.number().int().min(1).max(168).default(72)
});

const offlineDeviceStatusSchema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"])
});

const offlineSyncSchema = z.object({
  deviceId: z.string().trim().min(2).max(120),
  gpsCompliant: z.boolean().default(false),
  keySubmissions: z.array(meetingKeySubmissionSchema).default([]),
  attendance: z.array(attendanceBatchItemSchema).default([]),
  ledgerEntries: z.array(meetingLedgerEntrySchema).default([])
});

const shareOutPreviewSchema = z.object({
  poolAmountCents: z.number().int().min(1)
});

const shareOutPostSchema = shareOutPreviewSchema.extend({
  clientRequestPrefix: z.string().trim().min(3).max(80).optional(),
  description: z.string().trim().optional()
});

const otpBatchSchema = z.object({
  memberIds: z.array(z.string()).min(1).max(12)
});

const voteCreateSchema = z.object({
  meetingId: z.string().optional(),
  resolutionType: z.enum(resolutionTypes),
  motion: z.string().trim().min(2),
  result: z.enum(["PASSED", "FAILED", "TIED", "DEFERRED"]),
  quorumRequired: z.number().int().min(0).max(100),
  yesCount: z.number().int().min(0),
  noCount: z.number().int().min(0),
  abstainCount: z.number().int().min(0).default(0),
  totalEligible: z.number().int().min(1)
});

const officialMemberRoles = new Set(["CHAIRPERSON", "SECRETARY", "TREASURER", "MONEY_COUNTER", "KEY_HOLDER"]);

const meetingLedgerRules: Record<
  (typeof meetingLedgerEntryTypes)[number],
  { fundType: FundType; direction: "CREDIT" | "DEBIT"; label: string }
> = {
  SHARE_PURCHASE: { fundType: "INTERNAL_LOAN", direction: "CREDIT", label: "Share purchase" },
  LOAN_REPAYMENT: { fundType: "INTERNAL_LOAN", direction: "CREDIT", label: "Loan repayment" },
  INTERNAL_LOAN_DISBURSEMENT: {
    fundType: "INTERNAL_LOAN",
    direction: "DEBIT",
    label: "Loan disbursement"
  },
  SOCIAL_CONTRIBUTION: { fundType: "SOCIAL", direction: "CREDIT", label: "Social fund contribution" },
  SHARE_OUT_PAYOUT: { fundType: "INTERNAL_LOAN", direction: "DEBIT", label: "Share-out payout" }
};

const memberSelect = {
  id: true,
  groupId: true,
  fullName: true,
  phone: true,
  role: true,
  kycStatus: true,
  status: true,
  joinedAt: true,
  createdAt: true,
  updatedAt: true,
  pinHash: true,
  pinSetAt: true,
  pinUpdatedAt: true,
  currentOtpHash: true,
  currentOtpIssuedAt: true,
  currentOtpExpiresAt: true
} satisfies Prisma.MemberSelect;

const nestedMemberSelect = {
  id: true,
  groupId: true,
  fullName: true,
  phone: true,
  role: true,
  kycStatus: true,
  status: true
} satisfies Prisma.MemberSelect;

const groupInclude = {
  programme: { include: { partner: true } },
  programmeLinks: {
    include: {
      programme: {
        include: {
          partner: true,
          partnerLinks: { include: { partner: true } },
          _count: { select: { groups: true, villageAgents: true, partnerLinks: true, groupLinks: true } }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  },
  villageAgent: true,
  fundAccounts: { orderBy: { type: "asc" } },
  creditScores: { orderBy: { computedAt: "desc" }, take: 1 },
  _count: { select: { members: true, meetings: true, votes: true, ledgerEntries: true } }
} satisfies Prisma.GroupInclude;

function serializeMember<
  T extends {
    pinHash?: string | null;
    pinSetAt?: Date | null;
    currentOtpHash?: string | null;
    currentOtpIssuedAt?: Date | null;
    currentOtpExpiresAt?: Date | null;
  }
>(member: T, delivery?: MemberPinDeliveryPublic | null) {
  const { pinHash: _pinHash, currentOtpHash: _currentOtpHash, ...safeMember } = member;
  const serialized = {
    ...safeMember,
    pinSet: Boolean(_pinHash),
    defaultPinSet: Boolean(_pinHash),
    pinSetAt: member.pinSetAt ?? null,
    currentOtpSet: Boolean(_currentOtpHash && member.currentOtpExpiresAt && member.currentOtpExpiresAt > new Date()),
    currentOtpIssuedAt: member.currentOtpIssuedAt ?? null,
    currentOtpExpiresAt: member.currentOtpExpiresAt ?? null
  };

  return delivery ? { ...serialized, pinDelivery: serializeMemberPinDelivery(delivery) } : serialized;
}

function meetingInclude(user?: AuthenticatedUser) {
  const memberDetailScope = user?.role === "MEMBER" ? { memberId: user.memberId ?? "__no_access__" } : undefined;

  return {
    group: {
      select: {
        id: true,
        name: true,
        code: true,
        county: true,
        gpsLatitude: true,
        gpsLongitude: true,
        gpsRadiusMeters: true,
        shareValueCents: true,
        maxSharesPerMemberPerMeeting: true
      }
    },
    steps: { orderBy: { createdAt: "asc" } },
    attendance: {
      where: memberDetailScope,
      include: { member: { select: nestedMemberSelect } }
    },
    keySubmissions: {
      where: memberDetailScope,
      orderBy: { verifiedAt: "asc" },
      select: {
        id: true,
        meetingId: true,
        memberId: true,
        deviceId: true,
        capturedOfflineAt: true,
        credentialType: true,
        verifiedAt: true,
        member: { select: nestedMemberSelect },
        capturedByUser: { select: { id: true, name: true, role: true } }
      }
    }
  } satisfies Prisma.MeetingInclude;
}

function meetingKeyMemberId(
  user: AuthenticatedUser | undefined,
  submission: z.infer<typeof meetingKeySubmissionSchema>
) {
  if (submission.memberId) return submission.memberId;
  if (user?.role === "MEMBER" && user.memberId) return user.memberId;

  throw new ApiHttpError(400, "MEMBER_REQUIRED", "A meeting key submission requires a member.");
}

async function verifyMeetingCredential(
  submission: z.infer<typeof meetingKeySubmissionSchema>,
  member: {
    pinHash: string | null;
    currentOtpHash: string | null;
    currentOtpExpiresAt: Date | null;
  }
) {
  if (submission.capturedOfflineAt && submission.credentialType === "CURRENT_OTP") {
    throw new ApiHttpError(400, "OFFLINE_OTP_NOT_ALLOWED", "Offline meeting unlocks must use the saved default PIN.");
  }

  const allowDefaultPin = !submission.credentialType || submission.credentialType === "DEFAULT_PIN";
  const allowCurrentOtp =
    !submission.capturedOfflineAt && (!submission.credentialType || submission.credentialType === "CURRENT_OTP");

  if (allowDefaultPin && member.pinHash && (await bcrypt.compare(submission.pin, member.pinHash))) {
    return "DEFAULT_PIN";
  }

  if (
    allowCurrentOtp &&
    member.currentOtpHash &&
    member.currentOtpExpiresAt &&
    member.currentOtpExpiresAt > new Date() &&
    (await bcrypt.compare(submission.pin, member.currentOtpHash))
  ) {
    return "CURRENT_OTP";
  }

  throw new ApiHttpError(400, "INVALID_MEMBER_CREDENTIAL", "One or more meeting PINs or OTPs are invalid.");
}

async function recordMeetingKeySubmission(
  tx: Prisma.TransactionClient,
  user: AuthenticatedUser | undefined,
  groupId: string,
  meetingId: string,
  submission: z.infer<typeof meetingKeySubmissionSchema>
) {
  const memberId = meetingKeyMemberId(user, submission);

  if (user?.role === "MEMBER" && user.memberId !== memberId) {
    throw new ApiHttpError(403, "FORBIDDEN", "Members can only submit their own meeting key.");
  }

  const member = await tx.member.findFirst({
    where: { id: memberId, groupId, status: "ACTIVE" },
    select: {
      id: true,
      fullName: true,
      pinHash: true,
      currentOtpHash: true,
      currentOtpExpiresAt: true
    }
  });

  if (!member) {
    throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member does not exist or is outside this group.");
  }

  const credentialType = await verifyMeetingCredential(submission, member);
  const capturedOfflineAt = submission.capturedOfflineAt ? new Date(submission.capturedOfflineAt) : undefined;
  const verifiedAt = new Date();

  const keySubmission = await tx.meetingKeySubmission.upsert({
    where: { meetingId_memberId: { meetingId, memberId } },
    create: {
      meetingId,
      memberId,
      capturedByUserId: user?.id ?? null,
      deviceId: submission.deviceId,
      capturedOfflineAt,
      credentialType,
      verifiedAt
    },
    update: {
      capturedByUserId: user?.id ?? null,
      deviceId: submission.deviceId,
      capturedOfflineAt,
      credentialType,
      verifiedAt
    },
    include: {
      member: { select: nestedMemberSelect },
      capturedByUser: { select: { id: true, name: true, role: true } }
    }
  });

  if (credentialType === "CURRENT_OTP") {
    await tx.member.update({
      where: { id: member.id },
      data: { currentOtpHash: null, currentOtpIssuedAt: null, currentOtpExpiresAt: null },
      select: { id: true }
    });
  }

  return keySubmission;
}

async function evaluateMeetingUnlock(tx: Prisma.TransactionClient, meetingId: string) {
  const submissions = await tx.meetingKeySubmission.findMany({
    where: { meetingId },
    include: { member: { select: { id: true, role: true, status: true } } }
  });
  const activeSubmissions = submissions.filter((submission) => submission.member.status === "ACTIVE");
  const distinctMemberIds = new Set(activeSubmissions.map((submission) => submission.memberId));
  const distinctOfficialIds = new Set(
    activeSubmissions
      .filter((submission) => officialMemberRoles.has(submission.member.role))
      .map((submission) => submission.memberId)
  );
  const officialsVerified = distinctOfficialIds.size;
  const membersVerified = distinctMemberIds.size;
  const canOpen = officialsVerified >= 3 || membersVerified >= 5;
  const unlockStatus =
    officialsVerified >= 3 ? "OFFICIALS_VERIFIED" : membersVerified >= 5 ? "FIVE_MEMBERS_VERIFIED" : "PENDING";

  return {
    canOpen,
    unlockStatus,
    officialsVerified,
    membersVerified,
    requiredOfficials: 3,
    requiredMembers: 5,
    message: canOpen ? "Meeting unlock policy satisfied." : "Meeting requires 3 officials or 5 active members."
  };
}

async function assertMeetingInGroup(tx: Prisma.TransactionClient, groupId: string, meetingId: string) {
  const meeting = await tx.meeting.findFirst({ where: { id: meetingId, groupId } });
  if (!meeting) throw new ApiHttpError(404, "MEETING_NOT_FOUND", "Meeting does not exist or is outside this group.");
  return meeting;
}

async function createMeetingSteps(tx: Prisma.TransactionClient, meetingId: string) {
  for (const step of meetingSteps) {
    await tx.meetingStepRecord.upsert({
      where: { meetingId_step: { meetingId, step } },
      create: {
        meetingId,
        step,
        name: meetingStepLabels[step as MeetingStep],
        status: "PENDING"
      },
      update: {}
    });
  }
}

async function activateMeeting(
  tx: Prisma.TransactionClient,
  user: AuthenticatedUser | undefined,
  groupId: string,
  meetingId: string,
  gpsCompliant: boolean,
  unlockStatus: string
) {
  await createMeetingSteps(tx, meetingId);
  await tx.meetingStepRecord.updateMany({
    where: { meetingId },
    data: { status: "PENDING", completedAt: null }
  });
  await tx.meetingStepRecord.update({
    where: { meetingId_step: { meetingId, step: meetingSteps[0] } },
    data: { status: "ACTIVE", completedAt: null }
  });

  const meeting = await tx.meeting.update({
    where: { id: meetingId },
    data: {
      status: "IN_PROGRESS",
      openedAt: new Date(),
      gpsCompliant,
      unlockStatus
    },
    include: meetingInclude(user)
  });

  return meeting;
}

async function notifyMeetingActive(groupId: string, title: string) {
  const activeMemberUsers = await prisma.user.findMany({
    where: { groupId, role: { in: ["GROUP_ACCOUNT", "MEMBER"] }, status: "ACTIVE" },
    select: { id: true }
  });

  await createNotifications(
    activeMemberUsers.map((account) => ({
      userId: account.id,
      title: "Meeting is active",
      body: `${title} has started.`,
      href: "/dashboard/meetings"
    }))
  );
}

async function resolveFundAccount(tx: Prisma.TransactionClient, groupId: string, fundType: FundType) {
  const fundAccount = await tx.fundAccount.findUnique({
    where: { groupId_type: { groupId, type: fundType } }
  });

  if (!fundAccount) {
    throw new ApiHttpError(404, "FUND_ACCOUNT_NOT_FOUND", `No ${fundType} fund account exists for this group.`);
  }

  return fundAccount;
}

async function appendLedgerEntry(
  tx: Prisma.TransactionClient,
  input: {
    groupId: string;
    memberId?: string | null;
    meetingId?: string | null;
    fundAccountId: string;
    type: LedgerEntryType;
    amountCents: number;
    direction: "CREDIT" | "DEBIT";
    description: string;
    externalReference?: string | null;
    clientRequestId?: string | null;
  }
) {
  if (input.clientRequestId) {
    const existing = await tx.ledgerEntry.findUnique({
      where: { clientRequestId: input.clientRequestId },
      include: {
        member: { select: nestedMemberSelect },
        meeting: { select: { id: true, title: true, status: true } },
        fundAccount: { select: { id: true, type: true, currency: true } }
      }
    });
    if (existing) return existing;
  }

  const fundAccount = await tx.fundAccount.findFirst({
    where: { id: input.fundAccountId, groupId: input.groupId }
  });
  if (!fundAccount) {
    throw new ApiHttpError(404, "FUND_ACCOUNT_NOT_FOUND", "Fund account does not exist or is outside this group.");
  }

  if (input.memberId) {
    const member = await tx.member.findFirst({ where: { id: input.memberId, groupId: input.groupId }, select: { id: true } });
    if (!member) {
      throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member does not exist or is outside this group.");
    }
  }

  if (input.meetingId) await assertMeetingInGroup(tx, input.groupId, input.meetingId);

  const nextBalance =
    input.direction === "CREDIT"
      ? fundAccount.balanceCents + input.amountCents
      : fundAccount.balanceCents - input.amountCents;

  if (nextBalance < 0) {
    throw new ApiHttpError(400, "INSUFFICIENT_FUND_BALANCE", "This debit would make the fund balance negative.");
  }

  const payload = {
    groupId: input.groupId,
    memberId: input.memberId ?? null,
    meetingId: input.meetingId ?? null,
    fundAccountId: input.fundAccountId,
    type: input.type,
    amountCents: input.amountCents,
    currency: fundAccount.currency,
    direction: input.direction,
    description: input.description,
    externalReference: input.externalReference ?? null,
    clientRequestId: input.clientRequestId ?? null
  };

  await tx.fundAccount.update({
    where: { id: fundAccount.id },
    data: { balanceCents: nextBalance }
  });

  const ledgerEntry = await tx.ledgerEntry.create({
    data: {
      ...payload,
      signature: signLedgerEntry(payload)
    },
    include: {
      member: { select: nestedMemberSelect },
      meeting: { select: { id: true, title: true, status: true } },
      fundAccount: { select: { id: true, type: true, currency: true } }
    }
  });

  if (input.meetingId) {
    const transactionTotal = await tx.ledgerEntry.count({ where: { meetingId: input.meetingId } });
    await tx.meeting.update({
      where: { id: input.meetingId },
      data: { transactionTotal }
    });
  }

  return ledgerEntry;
}

async function appendMeetingLedgerEntry(
  tx: Prisma.TransactionClient,
  groupId: string,
  meetingId: string,
  entry: z.infer<typeof meetingLedgerEntrySchema>
) {
  const rule = meetingLedgerRules[entry.type];
  const fundAccount = await resolveFundAccount(tx, groupId, rule.fundType);

  return appendLedgerEntry(tx, {
    groupId,
    memberId: entry.memberId,
    meetingId,
    fundAccountId: fundAccount.id,
    type: entry.type,
    amountCents: entry.amountCents,
    direction: rule.direction,
    description: entry.description ?? rule.label,
    externalReference: entry.externalReference,
    clientRequestId: entry.clientRequestId
  });
}

async function computeShareOutPreview(
  tx: Prisma.TransactionClient,
  groupId: string,
  poolAmountCents: number
) {
  const lastShareOut = await tx.ledgerEntry.findFirst({
    where: { groupId, type: "SHARE_OUT_PAYOUT" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  const cycleWhere: Prisma.LedgerEntryWhereInput = {
    groupId,
    type: "SHARE_PURCHASE",
    direction: "CREDIT",
    ...(lastShareOut ? { createdAt: { gt: lastShareOut.createdAt } } : {})
  };
  const rows = await tx.ledgerEntry.groupBy({
    by: ["memberId"],
    where: cycleWhere,
    _sum: { amountCents: true }
  });
  const memberIds = rows.map((row) => row.memberId).filter((id): id is string => Boolean(id));
  const members = await tx.member.findMany({
    where: { id: { in: memberIds } },
    select: nestedMemberSelect
  });
  const membersById = new Map(members.map((member) => [member.id, member]));
  const totalShareCents = rows.reduce((sum, row) => sum + (row._sum.amountCents ?? 0), 0);
  let allocated = 0;
  const preview = rows
    .filter((row) => row.memberId && (row._sum.amountCents ?? 0) > 0)
    .map((row, index, filteredRows) => {
      const sharePurchaseCents = row._sum.amountCents ?? 0;
      const payoutCents =
        index === filteredRows.length - 1
          ? poolAmountCents - allocated
          : Math.floor((poolAmountCents * sharePurchaseCents) / totalShareCents);
      allocated += payoutCents;
      const member = membersById.get(row.memberId!);

      return {
        memberId: row.memberId!,
        member,
        sharePurchaseCents,
        shareCount: sharePurchaseCents,
        percentage: totalShareCents > 0 ? sharePurchaseCents / totalShareCents : 0,
        payoutCents
      };
    });

  return {
    poolAmountCents,
    totalShareCents,
    roundingDifferenceCents: poolAmountCents - preview.reduce((sum, row) => sum + row.payoutCents, 0),
    rows: preview
  };
}

function buildOfflineVerifier(deviceId: string, memberId: string, pin: string) {
  return sha256(`${deviceId}:${memberId}:${pin}`);
}

function extractDefaultPinFromDelivery(ciphertext: string) {
  try {
    const payload = decryptJson<{ pin?: string; body?: string; purpose?: string }>(ciphertext);
    const candidate = typeof payload.pin === "string" ? payload.pin : payload.body?.match(/\b\d{6}\b/)?.[0];
    return candidate && /^\d{6}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

async function buildAutomaticOfflineVerifiers(tx: Prisma.TransactionClient, groupId: string, deviceId: string) {
  const members = await tx.member.findMany({
    where: { groupId, status: "ACTIVE", pinHash: { not: null } },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      role: true,
      pinHash: true,
      pinUpdatedAt: true,
      pinDeliveries: {
        where: { purpose: "DEFAULT_PIN" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { messageCiphertext: true, createdAt: true }
      }
    }
  });
  const verifiers = [];
  const skipped = [];

  for (const member of members) {
    let matchedPin: string | null = null;
    for (const delivery of member.pinDeliveries) {
      const pin = extractDefaultPinFromDelivery(delivery.messageCiphertext);
      if (pin && member.pinHash && (await bcrypt.compare(pin, member.pinHash))) {
        matchedPin = pin;
        break;
      }
    }

    if (!matchedPin) {
      skipped.push({
        memberId: member.id,
        fullName: member.fullName,
        reason: "PIN_DELIVERY_NOT_AVAILABLE"
      });
      continue;
    }

    verifiers.push({
      memberId: member.id,
      fullName: member.fullName,
      role: member.role,
      verifier: buildOfflineVerifier(deviceId, member.id, matchedPin),
      pinUpdatedAt: member.pinUpdatedAt
    });
  }

  return { verifiers, skipped };
}

router.get("/meetings", requireAuth("meetings:read"), async (req, res, next) => {
  try {
    const meetings = await prisma.meeting.findMany({
      where: { group: scopeGroupWhere(req.user) },
      orderBy: { scheduledAt: "desc" },
      include: meetingInclude(req.user)
    });
    ok(res, meetings);
  } catch (error) {
    next(error);
  }
});

router.get("/groups", requireAuth("groups:read"), async (req, res, next) => {
  try {
    const groups = await prisma.group.findMany({
      where: scopeGroupWhere(req.user),
      orderBy: { createdAt: "desc" },
      include: groupInclude
    });
    ok(res, groups);
  } catch (error) {
    next(error);
  }
});

router.post("/groups", requireAuth("groups:write"), async (req, res, next) => {
  try {
    const payload = groupCreateSchema.parse(req.body);
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: payload.name,
          code: payload.code,
          county: payload.county,
          phase: payload.phase,
          subCounty: payload.subCounty,
          location: payload.location,
          composition: payload.composition,
          objective: payload.objective,
          contactPersonName: payload.contactPersonName,
          contactPhone: payload.contactPhone,
          onboardingFeedback: payload.onboardingFeedback,
          meetingDay: payload.meetingDay,
          gpsLatitude: payload.gpsLatitude,
          gpsLongitude: payload.gpsLongitude,
          gpsRadiusMeters: payload.gpsRadiusMeters,
          shareValueCents: payload.shareValueCents,
          maxSharesPerMemberPerMeeting: payload.maxSharesPerMemberPerMeeting,
          constitutionVersion: payload.constitutionVersion,
          cycleNumber: payload.cycleNumber,
          villageAgentId: payload.villageAgentId,
          programmeId: payload.programmeIds[0] ?? undefined,
          fundAccounts: {
            create: fundTypes.map((type) => ({ type }))
          },
          programmeLinks: {
            create: payload.programmeIds.map((programmeId) => ({ programmeId }))
          }
        },
        include: groupInclude
      });

      return created;
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "GROUP",
      entityId: group.id,
      type: "GROUP_CREATED",
      payload: { groupId: group.id, code: group.code }
    });

    ok(res.status(201), group);
  } catch (error) {
    next(error);
  }
});

router.get("/groups/:id", requireAuth("groups:read"), async (req, res, next) => {
  try {
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const group = await prisma.group.findFirst({
      where: scopeGroupWhere(req.user, { id: routeParam(req.params.id, "id") }),
      include: groupInclude
    });
    if (!group) throw new ApiHttpError(404, "GROUP_NOT_FOUND", "Group does not exist or is outside this account.");
    ok(res, group);
  } catch (error) {
    next(error);
  }
});

router.patch("/groups/:id", requireAuth("groups:write"), async (req, res, next) => {
  try {
    const payload = groupUpdateSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const group = await prisma.$transaction(async (tx) => {
      const updateData: Prisma.GroupUpdateInput = {
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.code ? { code: payload.code } : {}),
        ...(payload.county ? { county: payload.county } : {}),
        ...(payload.phase ? { phase: payload.phase } : {}),
        ...(payload.subCounty !== undefined ? { subCounty: payload.subCounty } : {}),
        ...(payload.location !== undefined ? { location: payload.location } : {}),
        ...(payload.composition !== undefined ? { composition: payload.composition } : {}),
        ...(payload.objective !== undefined ? { objective: payload.objective } : {}),
        ...(payload.contactPersonName !== undefined ? { contactPersonName: payload.contactPersonName } : {}),
        ...(payload.contactPhone !== undefined ? { contactPhone: payload.contactPhone } : {}),
        ...(payload.onboardingFeedback !== undefined ? { onboardingFeedback: payload.onboardingFeedback } : {}),
        ...(payload.meetingDay !== undefined ? { meetingDay: payload.meetingDay } : {}),
        ...(payload.gpsLatitude !== undefined ? { gpsLatitude: payload.gpsLatitude } : {}),
        ...(payload.gpsLongitude !== undefined ? { gpsLongitude: payload.gpsLongitude } : {}),
        ...(payload.gpsRadiusMeters !== undefined ? { gpsRadiusMeters: payload.gpsRadiusMeters } : {}),
        ...(payload.shareValueCents !== undefined ? { shareValueCents: payload.shareValueCents } : {}),
        ...(payload.maxSharesPerMemberPerMeeting !== undefined ? { maxSharesPerMemberPerMeeting: payload.maxSharesPerMemberPerMeeting } : {}),
        ...(payload.constitutionVersion !== undefined ? { constitutionVersion: payload.constitutionVersion } : {}),
        ...(payload.cycleNumber !== undefined ? { cycleNumber: payload.cycleNumber } : {}),
        ...(payload.villageAgentId !== undefined ? { villageAgent: payload.villageAgentId ? { connect: { id: payload.villageAgentId } } : { disconnect: true } } : {}),
        ...(payload.programmeIds ? { programme: payload.programmeIds[0] ? { connect: { id: payload.programmeIds[0] } } : { disconnect: true } } : {})
      };

      if (payload.programmeIds) {
        await tx.programmeGroup.deleteMany({ where: { groupId: routeParam(req.params.id, "id") } });
        await tx.programmeGroup.createMany({
          data: payload.programmeIds.map((programmeId) => ({ groupId: routeParam(req.params.id, "id"), programmeId }))
        });
      }

      return tx.group.update({
        where: { id: routeParam(req.params.id, "id") },
        data: updateData,
        include: groupInclude
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "GROUP",
      entityId: group.id,
      type: "GROUP_UPDATED",
      payload: { groupId: group.id, code: group.code }
    });

    ok(res, group);
  } catch (error) {
    next(error);
  }
});

router.get("/groups/:id/members", requireAuth("members:read"), async (req, res, next) => {
  try {
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const members = await prisma.member.findMany({
      where: memberScopeForUser(req.user, { groupId: routeParam(req.params.id, "id") }),
      orderBy: { joinedAt: "asc" },
      select: memberSelect
    });
    ok(res, members.map((member) => serializeMember(member)));
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/members", requireAuth("members:write"), async (req, res, next) => {
  try {
    const payload = memberCreateSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const result = await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: { ...payload, groupId: routeParam(req.params.id, "id") },
        select: memberSelect
      });
      return generateAndQueueMemberPin(tx, member, {
        requestedByUserId: req.user?.id,
        select: memberSelect
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "MEMBER",
      entityId: result.member.id,
      type: "MEMBER_REGISTERED",
      payload: { groupId: routeParam(req.params.id, "id"), memberId: result.member.id }
    });

    ok(res.status(201), serializeMember(result.member, result.delivery));
  } catch (error) {
    next(error);
  }
});

router.patch("/groups/:id/members/:memberId", requireAuth("members:write"), async (req, res, next) => {
  try {
    const payload = memberUpdateSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const member = await prisma.member.findFirst({
      where: { id: routeParam(req.params.memberId, "memberId"), groupId: routeParam(req.params.id, "id") },
      select: { id: true }
    });
    if (!member) throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member does not exist or is outside this group.");

    const updated = await prisma.member.update({
      where: { id: routeParam(req.params.memberId, "memberId") },
      data: payload,
      select: memberSelect
    });
    ok(res, serializeMember(updated));
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/members/:memberId/pin", requireAuth("members:write"), async (req, res, next) => {
  try {
    pinRequestSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const existing = await prisma.member.findFirst({
      where: { id: routeParam(req.params.memberId, "memberId"), groupId: routeParam(req.params.id, "id") },
      select: memberSelect
    });
    if (!existing) throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member does not exist or is outside this group.");

    const result = await prisma.$transaction((tx) =>
      generateAndQueueMemberPin(tx, existing, {
        requestedByUserId: req.user?.id,
        select: memberSelect
      })
    );
    ok(res, serializeMember(result.member, result.delivery));
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/members/:memberId/otp", requireAuth("meeting-keys:write"), async (req, res, next) => {
  try {
    pinRequestSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const existing = await prisma.member.findFirst({
      where: memberScopeForUser(req.user, { id: routeParam(req.params.memberId, "memberId"), groupId: routeParam(req.params.id, "id") }),
      select: memberSelect
    });
    if (!existing) throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member does not exist or is outside this group.");

    const result = await prisma.$transaction((tx) =>
      generateAndQueueMemberOtp(tx, existing, {
        requestedByUserId: req.user?.id,
        select: memberSelect
      })
    );
    ok(res, serializeMember(result.member, result.delivery));
  } catch (error) {
    next(error);
  }
});

router.post("/members/me/pin", requireAuth("meeting-keys:write"), async (req, res, next) => {
  try {
    pinRequestSchema.parse(req.body);
    if (!req.user?.memberId || !req.user.groupId) {
      throw new ApiHttpError(400, "MEMBER_ACCOUNT_REQUIRED", "This action requires a member account.");
    }
    const existing = await prisma.member.findFirst({
      where: { id: req.user.memberId, groupId: req.user.groupId },
      select: memberSelect
    });
    if (!existing) throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member account was not found.");

    const result = await prisma.$transaction((tx) =>
      generateAndQueueMemberPin(tx, existing, {
        requestedByUserId: req.user?.id,
        select: memberSelect
      })
    );
    ok(res, serializeMember(result.member, result.delivery));
  } catch (error) {
    next(error);
  }
});

router.post("/members/me/otp", requireAuth("meeting-keys:write"), async (req, res, next) => {
  try {
    pinRequestSchema.parse(req.body);
    if (!req.user?.memberId || !req.user.groupId) {
      throw new ApiHttpError(400, "MEMBER_ACCOUNT_REQUIRED", "This action requires a member account.");
    }
    const existing = await prisma.member.findFirst({
      where: { id: req.user.memberId, groupId: req.user.groupId },
      select: memberSelect
    });
    if (!existing) throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member account was not found.");

    const result = await prisma.$transaction((tx) =>
      generateAndQueueMemberOtp(tx, existing, {
        requestedByUserId: req.user?.id,
        select: memberSelect
      })
    );
    ok(res, serializeMember(result.member, result.delivery));
  } catch (error) {
    next(error);
  }
});

router.get("/groups/:id/meetings", requireAuth("meetings:read"), async (req, res, next) => {
  try {
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const meetings = await prisma.meeting.findMany({
      where: { groupId: routeParam(req.params.id, "id") },
      orderBy: { scheduledAt: "desc" },
      include: meetingInclude(req.user)
    });
    ok(res, meetings);
  } catch (error) {
    next(error);
  }
});

router.get("/groups/:id/meetings/:meetingId", requireAuth("meetings:read"), async (req, res, next) => {
  try {
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const meeting = await prisma.meeting.findFirst({
      where: { id: routeParam(req.params.meetingId, "meetingId"), groupId: routeParam(req.params.id, "id") },
      include: meetingInclude(req.user)
    });
    if (!meeting) throw new ApiHttpError(404, "MEETING_NOT_FOUND", "Meeting does not exist or is outside this group.");
    ok(res, meeting);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings", requireAuth("meetings:write"), async (req, res, next) => {
  try {
    const payload = meetingCreateSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const meeting = await prisma.$transaction(async (tx) => {
      const created = await tx.meeting.create({
        data: {
          groupId: routeParam(req.params.id, "id"),
          title: payload.title,
          status: "SCHEDULED",
          scheduledAt: new Date(payload.scheduledAt),
          gpsCompliant: payload.gpsCompliant
        }
      });
      await createMeetingSteps(tx, created.id);
      return tx.meeting.findUniqueOrThrow({
        where: { id: created.id },
        include: meetingInclude(req.user)
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "MEETING",
      entityId: meeting.id,
      type: "MEETING_SCHEDULED",
      payload: { groupId: routeParam(req.params.id, "id"), meetingId: meeting.id }
    });

    ok(res.status(201), meeting);
  } catch (error) {
    next(error);
  }
});

router.patch("/groups/:id/meetings/:meetingId", requireAuth("meetings:write"), async (req, res, next) => {
  try {
    const payload = meetingUpdateSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const existing = await prisma.meeting.findFirst({
      where: { id: routeParam(req.params.meetingId, "meetingId"), groupId: routeParam(req.params.id, "id") }
    });
    if (!existing) throw new ApiHttpError(404, "MEETING_NOT_FOUND", "Meeting does not exist or is outside this group.");
    if (!["SCHEDULED", "KEY_UNLOCK_PENDING"].includes(existing.status)) {
      throw new ApiHttpError(400, "MEETING_LOCKED", "Only scheduled meetings can be edited.");
    }

    const meeting = await prisma.meeting.update({
      where: { id: routeParam(req.params.meetingId, "meetingId") },
      data: {
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.scheduledAt ? { scheduledAt: new Date(payload.scheduledAt) } : {}),
        ...(payload.gpsCompliant !== undefined ? { gpsCompliant: payload.gpsCompliant } : {})
      },
      include: meetingInclude(req.user)
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "MEETING",
      entityId: meeting.id,
      type: "MEETING_UPDATED",
      payload: { groupId: routeParam(req.params.id, "id"), meetingId: meeting.id }
    });

    ok(res, meeting);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/otp-batch", requireAuth("meeting-keys:write"), async (req, res, next) => {
  try {
    const payload = otpBatchSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    await prisma.$transaction((tx) => assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId")));
    const results = await prisma.$transaction(async (tx) => {
      const members = await tx.member.findMany({
        where: { id: { in: payload.memberIds }, groupId: routeParam(req.params.id, "id"), status: "ACTIVE" },
        select: memberSelect
      });
      if (members.length !== payload.memberIds.length) {
        throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "One or more selected members are outside this group.");
      }
      return Promise.all(
        members.map((member) =>
          generateAndQueueMemberOtp(tx, member, {
            requestedByUserId: req.user?.id,
            select: memberSelect
          })
        )
      );
    }, credentialTransactionOptions);
    ok(res, results.map((result) => serializeMember(result.member, result.delivery)));
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/key-submissions", requireAuth("meeting-keys:write"), async (req, res, next) => {
  try {
    const payload = meetingKeySubmissionBatchSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const result = await prisma.$transaction(async (tx) => {
      await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      const submissions = [];
      for (const submission of payload.submissions) {
        submissions.push(
          await recordMeetingKeySubmission(tx, req.user, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"), submission)
        );
      }
      const unlock = await evaluateMeetingUnlock(tx, routeParam(req.params.meetingId, "meetingId"));
      return { submissions, ...unlock };
    }, credentialTransactionOptions);

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "MEETING",
      entityId: routeParam(req.params.meetingId, "meetingId"),
      type: "MEETING_KEY_SUBMITTED",
      payload: { groupId: routeParam(req.params.id, "id"), meetingId: routeParam(req.params.meetingId, "meetingId"), count: payload.submissions.length }
    });

    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/open", requireAuth("meetings:write"), async (req, res, next) => {
  try {
    const payload = meetingOpenSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const meeting = await prisma.$transaction(async (tx) => {
      const existing = await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      if (existing.status === "SEALED") throw new ApiHttpError(400, "MEETING_SEALED", "A sealed meeting cannot be reopened.");
      for (const submission of payload.keySubmissions) {
        await recordMeetingKeySubmission(tx, req.user, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"), submission);
      }
      const unlock = await evaluateMeetingUnlock(tx, routeParam(req.params.meetingId, "meetingId"));
      if (!unlock.canOpen) {
        throw new ApiHttpError(400, "MEETING_UNLOCK_INCOMPLETE", unlock.message, unlock);
      }
      return activateMeeting(tx, req.user, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"), payload.gpsCompliant, unlock.unlockStatus);
    }, credentialTransactionOptions);

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "MEETING",
      entityId: meeting.id,
      type: "MEETING_OPENED",
      payload: { groupId: routeParam(req.params.id, "id"), meetingId: meeting.id, unlockStatus: meeting.unlockStatus }
    });
    await notifyMeetingActive(routeParam(req.params.id, "id"), meeting.title);

    ok(res, meeting);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/attendance", requireAuth("meetings:write"), async (req, res, next) => {
  try {
    const payload = attendanceSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const attendance = await prisma.$transaction(async (tx) => {
      await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      const member = await tx.member.findFirst({
        where: { id: payload.memberId, groupId: routeParam(req.params.id, "id") },
        select: { id: true }
      });
      if (!member) throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member does not exist or is outside this group.");
      return tx.attendance.upsert({
        where: { meetingId_memberId: { meetingId: routeParam(req.params.meetingId, "meetingId"), memberId: payload.memberId } },
        create: { meetingId: routeParam(req.params.meetingId, "meetingId"), memberId: payload.memberId, status: payload.status },
        update: { status: payload.status, recordedAt: new Date() },
        include: { member: { select: nestedMemberSelect } }
      });
    });
    ok(res, attendance);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/steps/:step/complete", requireAuth("meetings:write"), async (req, res, next) => {
  try {
    const step = routeParam(req.params.step, "step") as MeetingStep;
    if (!meetingSteps.includes(step)) throw new ApiHttpError(400, "INVALID_MEETING_STEP", "Unknown meeting step.");
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const result = await prisma.$transaction(async (tx) => {
      const meeting = await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      if (meeting.status !== "IN_PROGRESS") {
        throw new ApiHttpError(400, "MEETING_NOT_ACTIVE", "Meeting must be active before completing workflow steps.");
      }
      const completed = await tx.meetingStepRecord.findMany({
        where: { meetingId: routeParam(req.params.meetingId, "meetingId"), status: "COMPLETED" },
        orderBy: { createdAt: "asc" },
        select: { step: true }
      });
      assertMeetingStepOrder(completed.map((row) => row.step as MeetingStep), step);
      const updated = await tx.meetingStepRecord.update({
        where: { meetingId_step: { meetingId: routeParam(req.params.meetingId, "meetingId"), step } },
        data: { status: "COMPLETED", completedAt: new Date() }
      });
      const nextStep = meetingSteps[meetingSteps.indexOf(step) + 1];
      if (nextStep) {
        await tx.meetingStepRecord.update({
          where: { meetingId_step: { meetingId: routeParam(req.params.meetingId, "meetingId"), step: nextStep } },
          data: { status: "ACTIVE" }
        });
      }
      return updated;
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "MEETING",
      entityId: routeParam(req.params.meetingId, "meetingId"),
      type: "MEETING_STEP_COMPLETED",
      payload: { groupId: routeParam(req.params.id, "id"), meetingId: routeParam(req.params.meetingId, "meetingId"), step }
    });

    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/seal", requireAuth("meetings:write"), async (req, res, next) => {
  try {
    const payload = meetingSealSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const meeting = await prisma.$transaction(async (tx) => {
      const existing = await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      if (existing.status !== "IN_PROGRESS") {
        throw new ApiHttpError(400, "MEETING_NOT_ACTIVE", "Only active meetings can be sealed.");
      }
      const completedCount = await tx.meetingStepRecord.count({
        where: { meetingId: routeParam(req.params.meetingId, "meetingId"), status: "COMPLETED" }
      });
      if (completedCount < meetingSteps.length) {
        throw new ApiHttpError(400, "MEETING_WORKFLOW_INCOMPLETE", "Complete every meeting step before sealing.");
      }
      const [ledgerCount, voteCount] = await Promise.all([
        tx.ledgerEntry.count({ where: { meetingId: routeParam(req.params.meetingId, "meetingId") } }),
        tx.vote.count({ where: { meetingId: routeParam(req.params.meetingId, "meetingId") } })
      ]);
      return tx.meeting.update({
        where: { id: routeParam(req.params.meetingId, "meetingId") },
        data: {
          status: "SEALED",
          closedAt: new Date(),
          minutes: payload.minutes,
          transactionTotal: ledgerCount + voteCount
        },
        include: meetingInclude(req.user)
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "MEETING",
      entityId: meeting.id,
      type: "MEETING_SEALED",
      payload: { groupId: routeParam(req.params.id, "id"), meetingId: meeting.id }
    });

    ok(res, meeting);
  } catch (error) {
    next(error);
  }
});

router.get("/groups/:id/offline-devices", requireAuth("meetings:read"), async (req, res, next) => {
  try {
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const devices = await prisma.offlineDevice.findMany({
      where: { groupId: routeParam(req.params.id, "id") },
      orderBy: { updatedAt: "desc" }
    });
    ok(res, devices);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/offline-devices/prepare", requireAuth("meeting-keys:write"), async (req, res, next) => {
  try {
    const payload = offlineDevicePrepareSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const cacheExpiresAt = new Date(Date.now() + payload.cacheTtlHours * 60 * 60 * 1000);
    const prepared = await prisma.$transaction(async (tx) => {
      const verifiers = [];
      for (const item of payload.memberPins) {
        const member = await tx.member.findFirst({
          where: { id: item.memberId, groupId: routeParam(req.params.id, "id"), status: "ACTIVE" },
          select: { id: true, fullName: true, phone: true, role: true, pinHash: true }
        });
        if (!member || !member.pinHash || !(await bcrypt.compare(item.pin, member.pinHash))) {
          throw new ApiHttpError(400, "INVALID_MEMBER_CREDENTIAL", "One or more default PINs are invalid.");
        }
        verifiers.push({
          memberId: member.id,
          fullName: member.fullName,
          role: member.role,
          verifier: buildOfflineVerifier(payload.deviceId, member.id, item.pin)
        });
      }

      const device = await tx.offlineDevice.upsert({
        where: { groupId_deviceId: { groupId: routeParam(req.params.id, "id"), deviceId: payload.deviceId } },
        create: {
          groupId: routeParam(req.params.id, "id"),
          userId: req.user?.id ?? null,
          deviceId: payload.deviceId,
          status: "ACTIVE",
          cacheExpiresAt,
          lastPreparedAt: new Date()
        },
        update: {
          userId: req.user?.id ?? null,
          status: "ACTIVE",
          cacheExpiresAt,
          lastPreparedAt: new Date()
        }
      });

      return { device, verifiers };
    }, credentialTransactionOptions);

    ok(res, {
      ...prepared,
      encryption: { algorithm: "SHA-256", deviceBound: true, expiresAt: cacheExpiresAt }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/offline-devices/refresh", requireAuth("meeting-keys:write"), async (req, res, next) => {
  try {
    const payload = offlineDeviceRefreshSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const cacheExpiresAt = new Date(Date.now() + payload.cacheTtlHours * 60 * 60 * 1000);
    const refreshed = await prisma.$transaction(async (tx) => {
      const { verifiers, skipped } = await buildAutomaticOfflineVerifiers(tx, routeParam(req.params.id, "id"), payload.deviceId);
      const device = await tx.offlineDevice.upsert({
        where: { groupId_deviceId: { groupId: routeParam(req.params.id, "id"), deviceId: payload.deviceId } },
        create: {
          groupId: routeParam(req.params.id, "id"),
          userId: req.user?.id ?? null,
          deviceId: payload.deviceId,
          status: "ACTIVE",
          cacheExpiresAt,
          lastPreparedAt: new Date()
        },
        update: {
          userId: req.user?.id ?? null,
          status: "ACTIVE",
          cacheExpiresAt,
          lastPreparedAt: new Date()
        }
      });

      return { device, verifiers, skipped };
    }, credentialTransactionOptions);

    ok(res, {
      ...refreshed,
      encryption: { algorithm: "SHA-256", deviceBound: true, expiresAt: cacheExpiresAt }
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/groups/:id/offline-devices/:deviceId", requireAuth("groups:write"), async (req, res, next) => {
  try {
    const payload = offlineDeviceStatusSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const device = await prisma.offlineDevice.update({
      where: { groupId_deviceId: { groupId: routeParam(req.params.id, "id"), deviceId: routeParam(req.params.deviceId, "deviceId") } },
      data: { status: payload.status }
    });
    ok(res, device);
  } catch (error) {
    next(error);
  }
});

router.get("/groups/:id/ledger", requireAuth("ledger:read"), async (req, res, next) => {
  try {
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const meetingId = typeof req.query.meetingId === "string" ? req.query.meetingId : undefined;
    const ledger = await prisma.ledgerEntry.findMany({
      where: ledgerScopeForUser(req.user, { groupId: routeParam(req.params.id, "id"), ...(meetingId ? { meetingId } : {}) }),
      orderBy: { createdAt: "desc" },
      include: {
        group: { select: { id: true, name: true, code: true, county: true } },
        member: { select: nestedMemberSelect },
        meeting: { select: { id: true, title: true, status: true } },
        fundAccount: { select: { id: true, type: true, currency: true } }
      }
    });
    ok(res, ledger);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/ledger", requireAuth("ledger:write"), async (req, res, next) => {
  try {
    const payload = ledgerCreateSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const ledgerEntry = await prisma.$transaction(async (tx) =>
      appendLedgerEntry(tx, {
        groupId: routeParam(req.params.id, "id"),
        memberId: payload.memberId,
        meetingId: payload.meetingId,
        fundAccountId: payload.fundAccountId,
        type: payload.type,
        amountCents: payload.amountCents,
        direction: payload.direction,
        description: payload.description,
        externalReference: payload.externalReference,
        clientRequestId: payload.clientRequestId
      })
    );

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "LEDGER_ENTRY",
      entityId: ledgerEntry.id,
      type: "LEDGER_ENTRY_APPENDED",
      payload: { groupId: routeParam(req.params.id, "id"), ledgerEntryId: ledgerEntry.id }
    });

    ok(res.status(201), ledgerEntry);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/ledger/batch", requireAuth("ledger:write"), async (req, res, next) => {
  try {
    const payload = meetingLedgerBatchSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const entries = await prisma.$transaction(async (tx) => {
      await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      const created = [];
      for (const entry of payload.entries) {
        created.push(await appendMeetingLedgerEntry(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"), entry));
      }
      return created;
    });
    ok(res.status(201), entries);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/offline-sync", requireAuth("ledger:write"), async (req, res, next) => {
  try {
    const payload = offlineSyncSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const result = await prisma.$transaction(async (tx) => {
      await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      const device = await tx.offlineDevice.findUnique({
        where: { groupId_deviceId: { groupId: routeParam(req.params.id, "id"), deviceId: payload.deviceId } }
      });
      if (!device || device.status !== "ACTIVE" || device.cacheExpiresAt < new Date()) {
        throw new ApiHttpError(400, "OFFLINE_DEVICE_NOT_ACTIVE", "This offline device is not active for sync.");
      }

      const synced: Array<{ kind: string; id: string }> = [];
      const conflicts: Array<{ kind: string; clientRequestId?: string | null; memberId?: string; code: string; message: string }> = [];

      for (const submission of payload.keySubmissions) {
        try {
          const saved = await recordMeetingKeySubmission(tx, req.user, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"), {
            ...submission,
            deviceId: submission.deviceId ?? payload.deviceId
          });
          synced.push({ kind: "keySubmission", id: saved.id });
        } catch (error) {
          conflicts.push({
            kind: "keySubmission",
            memberId: submission.memberId,
            code: error instanceof ApiHttpError ? error.code : "KEY_SYNC_FAILED",
            message: error instanceof Error ? error.message : "Meeting key could not be verified."
          });
        }
      }

      for (const item of payload.attendance) {
        try {
          const member = await tx.member.findFirst({
            where: { id: item.memberId, groupId: routeParam(req.params.id, "id") },
            select: { id: true }
          });
          if (!member) throw new ApiHttpError(404, "MEMBER_NOT_FOUND", "Member does not exist or is outside this group.");
          const saved = await tx.attendance.upsert({
            where: { meetingId_memberId: { meetingId: routeParam(req.params.meetingId, "meetingId"), memberId: item.memberId } },
            create: { meetingId: routeParam(req.params.meetingId, "meetingId"), memberId: item.memberId, status: item.status },
            update: { status: item.status, recordedAt: new Date() }
          });
          synced.push({ kind: "attendance", id: saved.id });
        } catch (error) {
          conflicts.push({
            kind: "attendance",
            clientRequestId: item.clientRequestId,
            memberId: item.memberId,
            code: error instanceof ApiHttpError ? error.code : "ATTENDANCE_SYNC_FAILED",
            message: error instanceof Error ? error.message : "Attendance could not be synced."
          });
        }
      }

      for (const entry of payload.ledgerEntries) {
        try {
          if (entry.clientRequestId) {
            const existing = await tx.ledgerEntry.findUnique({
              where: { clientRequestId: entry.clientRequestId },
              select: { id: true }
            });
            if (existing) {
              throw new ApiHttpError(409, "DUPLICATE_CLIENT_REQUEST", "This offline entry was already synced.");
            }
          }
          const saved = await appendMeetingLedgerEntry(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"), entry);
          synced.push({ kind: "ledgerEntry", id: saved.id });
        } catch (error) {
          conflicts.push({
            kind: "ledgerEntry",
            clientRequestId: entry.clientRequestId,
            memberId: entry.memberId,
            code: error instanceof ApiHttpError ? error.code : "LEDGER_SYNC_FAILED",
            message: error instanceof Error ? error.message : "Ledger entry could not be synced."
          });
        }
      }

      await tx.offlineDevice.update({
        where: { id: device.id },
        data: { lastSyncedAt: new Date() }
      });

      if (conflicts.length > 0) {
        await tx.meeting.update({
          where: { id: routeParam(req.params.meetingId, "meetingId") },
          data: { status: "SYNC_CONFLICT" }
        });
      }

      return { synced, conflicts };
    }, credentialTransactionOptions);

    ok(res, result);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/share-out/preview", requireAuth("ledger:read"), async (req, res, next) => {
  try {
    const payload = shareOutPreviewSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const preview = await prisma.$transaction(async (tx) => {
      await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      return computeShareOutPreview(tx, routeParam(req.params.id, "id"), payload.poolAmountCents);
    });
    ok(res, preview);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/meetings/:meetingId/share-out/post", requireAuth("ledger:write"), async (req, res, next) => {
  try {
    const payload = shareOutPostSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const result = await prisma.$transaction(async (tx) => {
      await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"));
      const preview = await computeShareOutPreview(tx, routeParam(req.params.id, "id"), payload.poolAmountCents);
      const entries = [];
      for (const row of preview.rows) {
        if (row.payoutCents <= 0) continue;
        entries.push(
          await appendMeetingLedgerEntry(tx, routeParam(req.params.id, "id"), routeParam(req.params.meetingId, "meetingId"), {
            memberId: row.memberId,
            type: "SHARE_OUT_PAYOUT",
            amountCents: row.payoutCents,
            description: payload.description ?? "Reviewed share-out payout",
            clientRequestId: payload.clientRequestPrefix
              ? `${payload.clientRequestPrefix}-${row.memberId}`
              : `shareout-${routeParam(req.params.meetingId, "meetingId")}-${row.memberId}`
          })
        );
      }
      return { preview, entries };
    });
    ok(res.status(201), result);
  } catch (error) {
    next(error);
  }
});

router.get("/groups/:id/votes", requireAuth("votes:read"), async (req, res, next) => {
  try {
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const votes = await prisma.vote.findMany({
      where: { groupId: routeParam(req.params.id, "id") },
      orderBy: { createdAt: "desc" },
      include: { meeting: { select: { id: true, title: true, status: true } } }
    });
    ok(res, votes);
  } catch (error) {
    next(error);
  }
});

router.post("/groups/:id/votes", requireAuth("votes:write"), async (req, res, next) => {
  try {
    const payload = voteCreateSchema.parse(req.body);
    await assertGroupAccess(req.user, routeParam(req.params.id, "id"));
    const vote = await prisma.$transaction(async (tx) => {
      if (payload.meetingId) await assertMeetingInGroup(tx, routeParam(req.params.id, "id"), payload.meetingId);
      const hashPayload = {
        groupId: routeParam(req.params.id, "id"),
        ...payload
      };
      return tx.vote.create({
        data: {
          groupId: routeParam(req.params.id, "id"),
          meetingId: payload.meetingId,
          resolutionType: payload.resolutionType,
          motion: payload.motion,
          result: payload.result,
          quorumRequired: payload.quorumRequired,
          yesCount: payload.yesCount,
          noCount: payload.noCount,
          abstainCount: payload.abstainCount,
          totalEligible: payload.totalEligible,
          hash: signLedgerEntry(hashPayload)
        },
        include: { meeting: { select: { id: true, title: true, status: true } } }
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "VOTE",
      entityId: vote.id,
      type: "VOTE_RECORDED",
      payload: { groupId: routeParam(req.params.id, "id"), voteId: vote.id }
    });

    ok(res.status(201), vote);
  } catch (error) {
    next(error);
  }
});

export { router as groupsRouter };

