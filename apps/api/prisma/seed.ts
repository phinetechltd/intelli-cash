import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  demoAccounts,
  demoPassword,
  fundTypes,
  integrationProviders,
  meetingStepLabels,
  meetingSteps,
  rolePermissions
} from "@intellicash/shared";
import { intelliAuditStandardReferences } from "../src/domain/intelliaudit";
import { encryptJson } from "../src/lib/crypto";

const prisma = new PrismaClient();

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function signLedgerPayload(payload: unknown) {
  return sha256(JSON.stringify(payload));
}

function seedMemberPin(index: number) {
  return String(index + 1).repeat(6);
}

function buildMeetingStepRecords(
  meetingId: string,
  completedCount: number,
  activeStepIndex: number | null,
  completedAt: Date
) {
  return meetingSteps.map((step, index) => ({
    meetingId,
    step,
    name: meetingStepLabels[step],
    status: index < completedCount ? "COMPLETED" : activeStepIndex === index ? "ACTIVE" : "PENDING",
    completedAt: index < completedCount ? completedAt : null
  }));
}

function buildAttendanceRows(
  meetingId: string,
  members: Array<{ id: string }>,
  options: { lateIndexes?: number[]; absentIndexes?: number[] } = {}
) {
  const lateIndexes = new Set(options.lateIndexes ?? []);
  const absentIndexes = new Set(options.absentIndexes ?? []);

  return members.map((member, index) => ({
    meetingId,
    memberId: member.id,
    status: absentIndexes.has(index) ? "ABSENT" : lateIndexes.has(index) ? "LATE" : "PRESENT"
  }));
}

function buildMeetingKeyRows(
  meetingId: string,
  members: Array<{ id: string }>,
  capturedByUserId: string,
  verifiedAtBase: string,
  options: { count?: number; deviceId?: string; offline?: boolean; credentialTypes?: string[] } = {}
) {
  const count = options.count ?? 3;
  const verifiedAt = new Date(verifiedAtBase);

  return members.slice(0, count).map((member, index) => {
    const capturedAt = new Date(verifiedAt.getTime() + index * 60_000);

    return {
      meetingId,
      memberId: member.id,
      capturedByUserId,
      deviceId: options.deviceId ?? "seed-mobile-device",
      credentialType: options.credentialTypes?.[index] ?? "DEFAULT_PIN",
      capturedOfflineAt: options.offline ? capturedAt : null,
      verifiedAt: capturedAt
    };
  });
}

function demoAccount(role: (typeof demoAccounts)[number]["role"]) {
  return demoAccounts.find((account) => account.role === role)!;
}

export async function seedDatabase() {
  await prisma.intelliAuditOfflineAction.deleteMany();
  await prisma.intelliAuditReportAuditReference.deleteMany();
  await prisma.intelliAuditReportApproval.deleteMany();
  await prisma.intelliAuditReportDraft.deleteMany();
  await prisma.intelliAuditRecommendation.deleteMany();
  await prisma.intelliAuditFinding.deleteMany();
  await prisma.intelliAuditMessage.deleteMany();
  await prisma.intelliAuditConversation.deleteMany();
  await prisma.intelliAuditReconciliationItem.deleteMany();
  await prisma.intelliAuditReconciliationBatch.deleteMany();
  await prisma.intelliAuditConnectorSyncRun.deleteMany();
  await prisma.intelliAuditExtractedRecord.deleteMany();
  await prisma.intelliAuditSourceDocument.deleteMany();
  await prisma.intelliAuditEvidenceSource.deleteMany();
  await prisma.intelliAuditStandardReference.deleteMany();
  await prisma.paymentWebhookEvent.deleteMany();
  await prisma.webhookSubscription.deleteMany();
  await prisma.partnerWalletTransaction.deleteMany();
  await prisma.partnerWallet.deleteMany();
  await prisma.partnerSignupRequest.deleteMany();
  await prisma.storeCreditRepayment.deleteMany();
  await prisma.storeCreditInstallment.deleteMany();
  await prisma.agentBookingRequest.deleteMany();
  await prisma.storeCreditRequest.deleteMany();
  await prisma.storeProductProgrammeAgent.deleteMany();
  await prisma.storeProductProgramme.deleteMany();
  await prisma.storeProduct.deleteMany();
  await prisma.storeSupplier.deleteMany();
  await prisma.ftmaPartnerLinkage.deleteMany();
  await prisma.ftmaCountyFscKpi.deleteMany();
  await prisma.ftmaCountyVslaTrainingMetric.deleteMany();
  await prisma.ftmaCountyVslaKpi.deleteMany();
  await prisma.ftmaImportBatch.deleteMany();
  await prisma.integrationConfig.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.creditScore.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.offlineDevice.deleteMany();
  await prisma.fundAccount.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.memberPinDelivery.deleteMany();
  await prisma.meetingKeySubmission.deleteMany();
  await prisma.meetingStepRecord.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.member.deleteMany();
  await prisma.programmeGroup.deleteMany();
  await prisma.group.deleteMany();
  await prisma.villageAgent.deleteMany();
  await prisma.programmePartner.deleteMany();
  await prisma.programmeAsset.deleteMany();
  await prisma.programme.deleteMany();
  await prisma.rolePermissionTemplate.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.partner.deleteMany();

  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const programmeCoverUrl =
    "https://images.unsplash.com/photo-1521791055366-0d553872125f?auto=format&fit=crop&w=1400&q=80";
  const fieldGalleryUrl =
    "https://images.unsplash.com/photo-1542626991-cbc4e32524cc?auto=format&fit=crop&w=900&q=80";
  const auditGalleryUrl =
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80";
  const sampleReportUrl =
    "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
  const eggIncubatorUrl =
    "https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=1200&q=80";
  const avatarUrl = (seed: string) =>
    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=00c853&textColor=031109`;

  await prisma.rolePermissionTemplate.createMany({
    data: Object.entries(rolePermissions).map(([role, permissions]) => ({
      role,
      permissionsJson: JSON.stringify(permissions)
    }))
  });

  await prisma.intelliAuditStandardReference.createMany({
    data: intelliAuditStandardReferences.map((reference) => ({
      key: reference.key,
      name: reference.name,
      category: reference.category,
      jurisdiction: reference.jurisdiction,
      sourceUrl: reference.sourceUrl,
      summary: reference.summary
    }))
  });

  const partner = await prisma.partner.create({
    data: {
      name: "FLOURISH VSLA Programme",
      type: "NGO",
      status: "ACTIVE",
      apiScope: "PROGRAMME"
    }
  });

  const programme = await prisma.programme.create({
    data: {
      partnerId: partner.id,
      name: "Agreement SF 00112775",
      country: "Kenya",
      county: "Kiambu",
      description: "Pilot programme for digitally managed IWL savings groups.",
      publicSlug: "agreement-sf-00112775",
      publicStatus: "ONGOING",
      fundingGoalCents: 750000000,
      fundingSummary: "Scale digital passbooks, secure meeting workflows, and credit-readiness reporting for Kiambu savings groups.",
      impactSummary: "Supports women-led VSLAs with transparent records, stronger governance, and responsible access to finance.",
      fundingDeadline: new Date("2026-12-31T21:00:00.000Z"),
      coverImageUrl: programmeCoverUrl,
      allowInvestments: true,
      allowDonations: true
    }
  });

  await prisma.programmeAsset.createMany({
    data: [
      {
        programmeId: programme.id,
        type: "IMAGE",
        visibility: "PUBLIC",
        title: "Kiambu field onboarding",
        description: "Public project image for partner and donor review.",
        url: fieldGalleryUrl
      },
      {
        programmeId: programme.id,
        type: "IMAGE",
        visibility: "PRIVATE",
        title: "Audit preparation desk",
        description: "Internal audit preparation gallery item for signed-in partner accounts.",
        url: auditGalleryUrl
      },
      {
        programmeId: programme.id,
        type: "FILE",
        visibility: "PUBLIC",
        title: "Public programme brief",
        description: "Shareable project overview for website visitors.",
        url: sampleReportUrl,
        fileName: "programme-brief.pdf",
        mimeType: "application/pdf"
      },
      {
        programmeId: programme.id,
        type: "FILE",
        visibility: "PRIVATE",
        title: "Partner audit and field report",
        description: "Private audit/report file for partner and lender dashboard access.",
        url: sampleReportUrl,
        fileName: "partner-audit-report.pdf",
        mimeType: "application/pdf"
      }
    ]
  });

  const storeSupplier = await prisma.storeSupplier.create({
    data: {
      name: "Intelli-Store Agribusiness Desk",
      status: "ACTIVE",
      contactName: "Amina Otieno",
      contactPhone: "+254700000120",
      contactEmail: "suppliers@intellicash.co.ke",
      county: "Kiambu",
      location: "Ruiru supply hub",
      notes: "Seed supplier for poultry enterprise assets and setup support."
    }
  });

  const storeProduct = await prisma.storeProduct.create({
    data: {
      name: "Solar Egg Incubator",
      slug: "solar-egg-incubator",
      category: "AGRI_EQUIPMENT",
      status: "ACTIVE",
      supplierId: storeSupplier.id,
      description:
        "A smallholder-ready egg incubator for poultry groups that want to expand chick production without paying the full price upfront.",
      imageUrl: eggIncubatorUrl,
      sellerName: "Intelli-Store Agribusiness Desk",
      priceCents: 8500000,
      depositCents: 850000,
      currency: "KES",
      creditSummary: "Request programme-backed credit, then fulfilment is reviewed before delivery.",
      fulfilmentSummary: "Delivery and setup are coordinated with the assigned programme team and local VA / CBT.",
      inventoryCount: 12,
      programmeLinks: {
        create: {
          programmeId: programme.id,
          creditTerms: "10% deposit request, programme review, then staged repayment after approval.",
          depositRateBps: 1000,
          installmentCount: 6,
          installmentFrequency: "MONTHLY",
          flatInterestRateBps: 1200,
          gracePeriodDays: 30
        }
      }
    }
  });

  const lenderPartner = await prisma.partner.create({
    data: {
      name: "KCB Foundation Lending Desk",
      type: "LENDER",
      status: "ACTIVE",
      apiScope: "PROGRAMME",
      county: "Kiambu",
      valueProposition: "Credit line and graduation finance for mature VSLA groups."
    }
  });

  await prisma.programmePartner.createMany({
    data: [
      {
        programmeId: programme.id,
        partnerId: partner.id,
        role: "IMPLEMENTING_PARTNER"
      },
      {
        programmeId: programme.id,
        partnerId: lenderPartner.id,
        role: "LENDER"
      }
    ]
  });

  await prisma.partnerWallet.createMany({
    data: [
      {
        partnerId: partner.id,
        balanceCents: 12000000,
        heldCents: 0,
        currency: "KES"
      },
      {
        partnerId: lenderPartner.id,
        balanceCents: 25000000,
        heldCents: 0,
        currency: "KES"
      }
    ]
  });

  const partnerWallet = await prisma.partnerWallet.findUnique({ where: { partnerId: partner.id } });
  const lenderWallet = await prisma.partnerWallet.findUnique({ where: { partnerId: lenderPartner.id } });

  if (!partnerWallet || !lenderWallet) {
    throw new Error("Seed partner wallets were not created");
  }

  await prisma.partnerWalletTransaction.createMany({
    data: [
      {
        walletId: partnerWallet.id,
        partnerId: partner.id,
        programmeId: programme.id,
        type: "DONATION",
        provider: "INTERNAL",
        source: "DIRECT",
        status: "COMPLETED",
        amountCents: 3000000,
        currency: "KES",
        description: "Seed donation for Kiambu pilot readiness",
        internalReference: "DON-SEED-FLOURISH",
        completedAt: new Date("2026-05-21T09:00:00.000Z")
      },
      {
        walletId: lenderWallet.id,
        partnerId: lenderPartner.id,
        programmeId: programme.id,
        type: "INVESTMENT",
        provider: "INTERNAL",
        source: "DIRECT",
        status: "COMPLETED",
        amountCents: 5000000,
        currency: "KES",
        description: "Seed investment commitment for credit graduation",
        internalReference: "INV-SEED-KCB",
        completedAt: new Date("2026-05-22T09:00:00.000Z")
      }
    ]
  });

  const admin = await prisma.user.create({
    data: {
      name: demoAccount("IWL_ADMIN").name,
      email: demoAccount("IWL_ADMIN").email,
      passwordHash,
      role: "IWL_ADMIN",
      avatarUrl: avatarUrl(demoAccount("IWL_ADMIN").name),
      languagePreference: "ENGLISH",
      status: "ACTIVE"
    }
  });

  await prisma.user.createMany({
    data: [
      {
        name: demoAccount("PARTNER_OFFICER").name,
        email: demoAccount("PARTNER_OFFICER").email,
        passwordHash,
        role: "PARTNER_OFFICER",
        partnerId: partner.id,
        avatarUrl: avatarUrl(demoAccount("PARTNER_OFFICER").name),
        languagePreference: "KISWAHILI",
        status: "ACTIVE"
      },
      {
        name: demoAccount("LENDER").name,
        email: demoAccount("LENDER").email,
        passwordHash,
        role: "LENDER",
        partnerId: lenderPartner.id,
        avatarUrl: avatarUrl(demoAccount("LENDER").name),
        languagePreference: "ENGLISH",
        status: "ACTIVE"
      },
      {
        name: demoAccount("READ_ONLY").name,
        email: demoAccount("READ_ONLY").email,
        passwordHash,
        role: "READ_ONLY",
        avatarUrl: avatarUrl(demoAccount("READ_ONLY").name),
        languagePreference: "ENGLISH",
        status: "ACTIVE"
      }
    ]
  });

  const va = await prisma.villageAgent.create({
    data: {
      programmeId: programme.id,
      name: "Grace Wanjiku",
      phone: "+254700000101",
      email: "grace.wanjiku@intellicash.co.ke",
      gender: "Female",
      projectOfficer: "Kiambu Field Desk",
      county: "Kiambu",
      location: "Ruiru and Thika",
      feedback: "Book Grace for onboarding, poultry enterprise coaching, and digital records training.",
      digitalLiteracyScore: 91,
      caseloadLimit: 20
    }
  });

  const seedProductProgramme = await prisma.storeProductProgramme.findUnique({
    where: {
      productId_programmeId: {
        productId: storeProduct.id,
        programmeId: programme.id
      }
    }
  });

  if (seedProductProgramme) {
    await prisma.storeProductProgrammeAgent.create({
      data: {
        productProgrammeId: seedProductProgramme.id,
        villageAgentId: va.id,
        isPrimary: true
      }
    });
  }

  const group = await prisma.group.create({
    data: {
      programmeId: programme.id,
      villageAgentId: va.id,
      name: "Tujijenge Women VSLA",
      code: "IWL-KBU-0001",
      phase: "INTENSIVE",
      county: "Kiambu",
      subCounty: "Ruiru",
      meetingDay: "Wednesday",
      gpsLatitude: -1.1465,
      gpsLongitude: 36.9585,
      gpsRadiusMeters: 50,
      constitutionVersion: "IWLSGS-1.0",
      cycleNumber: 1
    }
  });

  const secondGroup = await prisma.group.create({
    data: {
      programmeId: programme.id,
      villageAgentId: va.id,
      name: "Umoja Savings Group",
      code: "IWL-KBU-0002",
      phase: "DEVELOPMENT",
      county: "Kiambu",
      subCounty: "Thika",
      meetingDay: "Friday",
      gpsLatitude: -1.0333,
      gpsLongitude: 37.0693,
      cycleNumber: 1
    }
  });

  await prisma.programmeGroup.createMany({
    data: [
      {
        programmeId: programme.id,
        groupId: group.id,
        role: "PRIMARY"
      },
      {
        programmeId: programme.id,
        groupId: secondGroup.id,
        role: "PRIMARY"
      }
    ]
  });

  const seedMembers: Array<[string, string, string]> = [
    ["Mary Njeri", "+254700000201", "CHAIRPERSON"],
    ["Faith Achieng", "+254700000202", "SECRETARY"],
    ["Agnes Muthoni", "+254700000203", "TREASURER"],
    ["Beatrice Wambui", "+254700000204", "KEY_HOLDER"],
    ["Nancy Atieno", "+254700000205", "MEMBER"],
    ["Jane Wairimu", "+254700000206", "MEMBER"]
  ];

  const members = await Promise.all(
    seedMembers.map(async ([fullName, phone, role], index) =>
      prisma.member.create({
        data: {
          groupId: group.id,
          fullName,
          phone,
          role,
          kycStatus: "VERIFIED",
          nationalIdHash: sha256(`${fullName}-${phone}`),
          pinHash: await bcrypt.hash(seedMemberPin(index), 12),
          pinSetAt: new Date(),
          pinUpdatedAt: new Date()
        }
      })
    )
  );

  await prisma.memberPinDelivery.createMany({
    data: members.map((member, index) => ({
      memberId: member.id,
      requestedByUserId: null,
      provider: "AFRICAS_TALKING",
      channel: "SMS",
      phone: member.phone,
      status: "QUEUED",
      messagePreview: `Seed meeting PIN SMS queued to ${member.phone.slice(0, 4)}******${member.phone.slice(-3)}.`,
      messageCiphertext: encryptJson({
        channel: "SMS",
        phone: member.phone,
        body: `Your Intelli Cash meeting PIN is ${seedMemberPin(index)}. Keep it private; it is required for offline meeting unlock.`
      })
    }))
  });

  await prisma.user.createMany({
    data: [
      {
        name: demoAccount("GROUP_ACCOUNT").name,
        email: demoAccount("GROUP_ACCOUNT").email,
        passwordHash,
        role: "GROUP_ACCOUNT",
        groupId: group.id,
        avatarUrl: avatarUrl(demoAccount("GROUP_ACCOUNT").name),
        languagePreference: "KIEMBU",
        status: "ACTIVE"
      },
      {
        name: demoAccount("MEMBER").name,
        email: demoAccount("MEMBER").email,
        passwordHash,
        role: "MEMBER",
        groupId: group.id,
        memberId: members[0]!.id,
        avatarUrl: avatarUrl(demoAccount("MEMBER").name),
        languagePreference: "GIKUYU",
        status: "ACTIVE"
      }
    ]
  });

  const secondGroupMembers = await Promise.all(
    [
      {
        groupId: secondGroup.id,
        fullName: "Rose Mwende",
        phone: "+254700000301",
        role: "CHAIRPERSON",
        kycStatus: "VERIFIED",
        nationalIdHash: sha256("Rose Mwende")
      },
      {
        groupId: secondGroup.id,
        fullName: "Caroline Akoth",
        phone: "+254700000302",
        role: "SECRETARY",
        kycStatus: "VERIFIED",
        nationalIdHash: sha256("Caroline Akoth")
      }
    ].map((data) => prisma.member.create({ data }))
  );

  const fundAccounts = await Promise.all(
    fundTypes.map((type) =>
      prisma.fundAccount.create({
        data: {
          groupId: group.id,
          type,
          balanceCents:
            type === "INTERNAL_LOAN" ? 18600000 : type === "SOCIAL" ? 4200000 : 0
        }
      })
    )
  );

  await Promise.all(
    fundTypes.map((type) =>
      prisma.fundAccount.create({
        data: {
          groupId: secondGroup.id,
          type,
          balanceCents:
            type === "INTERNAL_LOAN" ? 9500000 : type === "SOCIAL" ? 2100000 : 0
        }
      })
    )
  );

  const meeting = await prisma.meeting.create({
    data: {
      groupId: group.id,
      title: "Week 9 Digital Meeting",
      status: "IN_PROGRESS",
      scheduledAt: new Date("2026-05-20T07:00:00.000Z"),
      openedAt: new Date("2026-05-20T07:08:00.000Z"),
      unlockStatus: "THREE_KEYS_VERIFIED",
      gpsCompliant: true,
      transactionTotal: 14,
      minutes: "Previous minutes approved by simple majority."
    }
  });

  const week7Meeting = await prisma.meeting.create({
    data: {
      groupId: group.id,
      title: "Week 7 Social Fund Review",
      status: "SEALED",
      scheduledAt: new Date("2026-05-06T07:00:00.000Z"),
      openedAt: new Date("2026-05-06T07:06:00.000Z"),
      closedAt: new Date("2026-05-06T09:04:00.000Z"),
      unlockStatus: "THREE_KEYS_VERIFIED",
      gpsCompliant: true,
      transactionTotal: 11,
      minutes: "Social grants reviewed and three member welfare cases recorded."
    }
  });

  const week8Meeting = await prisma.meeting.create({
    data: {
      groupId: group.id,
      title: "Week 8 Loan Repayment Clinic",
      status: "SEALED",
      scheduledAt: new Date("2026-05-13T07:00:00.000Z"),
      openedAt: new Date("2026-05-13T07:05:00.000Z"),
      closedAt: new Date("2026-05-13T09:20:00.000Z"),
      unlockStatus: "THREE_KEYS_VERIFIED",
      gpsCompliant: true,
      transactionTotal: 16,
      minutes: "Members reconciled loan balances and approved the poultry stock motion."
    }
  });

  const week10Meeting = await prisma.meeting.create({
    data: {
      groupId: group.id,
      title: "Week 10 Store Credit Planning",
      status: "SCHEDULED",
      scheduledAt: new Date("2026-06-03T07:00:00.000Z"),
      unlockStatus: "PENDING",
      gpsCompliant: false,
      transactionTotal: 0,
      minutes: "Agenda: store requests, share purchases, and loan repayment follow-up."
    }
  });

  const loanDeskMeeting = await prisma.meeting.create({
    data: {
      groupId: group.id,
      title: "Week 10 Afternoon Loan Desk",
      status: "KEY_UNLOCK_PENDING",
      scheduledAt: new Date("2026-06-03T13:30:00.000Z"),
      unlockStatus: "TWO_KEYS_VERIFIED",
      gpsCompliant: true,
      transactionTotal: 0,
      minutes: "Two keys captured; one key holder still pending."
    }
  });

  const offlineSyncMeeting = await prisma.meeting.create({
    data: {
      groupId: group.id,
      title: "Offline Field Sync Drill",
      status: "SYNC_CONFLICT",
      scheduledAt: new Date("2026-06-04T08:00:00.000Z"),
      openedAt: new Date("2026-06-04T08:03:00.000Z"),
      unlockStatus: "THREE_KEYS_VERIFIED",
      gpsCompliant: false,
      transactionTotal: 4,
      minutes: "Offline unlock captured with default PINs; field device requires sync review."
    }
  });

  const week11Meeting = await prisma.meeting.create({
    data: {
      groupId: group.id,
      title: "Week 11 Share Purchase Round",
      status: "SCHEDULED",
      scheduledAt: new Date("2026-06-10T07:00:00.000Z"),
      unlockStatus: "PENDING",
      gpsCompliant: false,
      transactionTotal: 0,
      minutes: "Agenda: weekly shares, social fund, and new loan applications."
    }
  });

  const secondGroupMeeting = await prisma.meeting.create({
    data: {
      groupId: secondGroup.id,
      title: "Development Phase Meeting",
      status: "SEALED",
      scheduledAt: new Date("2026-05-17T07:00:00.000Z"),
      openedAt: new Date("2026-05-17T07:05:00.000Z"),
      closedAt: new Date("2026-05-17T09:10:00.000Z"),
      unlockStatus: "THREE_KEYS_VERIFIED",
      gpsCompliant: true,
      transactionTotal: 8,
      minutes: "Meeting sealed after treasurer balance announcement."
    }
  });

  const secondGroupUpcomingMeeting = await prisma.meeting.create({
    data: {
      groupId: secondGroup.id,
      title: "Friday Market Follow-up",
      status: "SCHEDULED",
      scheduledAt: new Date("2026-06-05T07:30:00.000Z"),
      unlockStatus: "PENDING",
      gpsCompliant: false,
      transactionTotal: 0,
      minutes: "Agenda: market stall savings and member attendance review."
    }
  });

  await prisma.meetingStepRecord.createMany({
    data: [
      ...buildMeetingStepRecords(week7Meeting.id, meetingSteps.length, null, new Date("2026-05-06T08:45:00.000Z")),
      ...buildMeetingStepRecords(week8Meeting.id, meetingSteps.length, null, new Date("2026-05-13T08:50:00.000Z")),
      ...buildMeetingStepRecords(meeting.id, 5, 5, new Date("2026-05-20T08:00:00.000Z")),
      ...buildMeetingStepRecords(week10Meeting.id, 0, null, new Date("2026-06-03T07:00:00.000Z")),
      ...buildMeetingStepRecords(loanDeskMeeting.id, 0, 0, new Date("2026-06-03T13:30:00.000Z")),
      ...buildMeetingStepRecords(offlineSyncMeeting.id, 4, null, new Date("2026-06-04T08:40:00.000Z")),
      ...buildMeetingStepRecords(week11Meeting.id, 0, null, new Date("2026-06-10T07:00:00.000Z")),
      ...buildMeetingStepRecords(secondGroupMeeting.id, meetingSteps.length, null, new Date("2026-05-17T08:40:00.000Z")),
      ...buildMeetingStepRecords(secondGroupUpcomingMeeting.id, 0, null, new Date("2026-06-05T07:30:00.000Z"))
    ]
  });

  await prisma.attendance.createMany({
    data: [
      ...buildAttendanceRows(week7Meeting.id, members, { absentIndexes: [5] }),
      ...buildAttendanceRows(week8Meeting.id, members, { lateIndexes: [2] }),
      ...buildAttendanceRows(meeting.id, members, { lateIndexes: [5] }),
      ...buildAttendanceRows(offlineSyncMeeting.id, members.slice(0, 4), { lateIndexes: [3] }),
      ...buildAttendanceRows(secondGroupMeeting.id, secondGroupMembers)
    ]
  });

  await prisma.meetingKeySubmission.createMany({
    data: [
      ...buildMeetingKeyRows(week7Meeting.id, members, admin.id, "2026-05-06T07:01:00.000Z", {
        credentialTypes: ["DEFAULT_PIN", "DEFAULT_PIN", "CURRENT_OTP"]
      }),
      ...buildMeetingKeyRows(week8Meeting.id, members, admin.id, "2026-05-13T07:01:00.000Z", {
        credentialTypes: ["CURRENT_OTP", "DEFAULT_PIN", "DEFAULT_PIN"]
      }),
      ...buildMeetingKeyRows(meeting.id, members, admin.id, "2026-05-20T07:01:00.000Z"),
      ...buildMeetingKeyRows(loanDeskMeeting.id, members, admin.id, "2026-06-03T13:31:00.000Z", {
        count: 2,
        credentialTypes: ["DEFAULT_PIN", "CURRENT_OTP"]
      }),
      ...buildMeetingKeyRows(offlineSyncMeeting.id, members, admin.id, "2026-06-04T08:01:00.000Z", {
        offline: true,
        deviceId: "seed-offline-device",
        credentialTypes: ["DEFAULT_PIN", "DEFAULT_PIN", "DEFAULT_PIN"]
      }),
      ...buildMeetingKeyRows(secondGroupMeeting.id, secondGroupMembers, admin.id, "2026-05-17T07:01:00.000Z", {
        count: 2
      })
    ]
  });

  const internalFund = fundAccounts.find((account) => account.type === "INTERNAL_LOAN");
  const socialFund = fundAccounts.find((account) => account.type === "SOCIAL");

  if (!internalFund || !socialFund) {
    throw new Error("Seed fund accounts were not created");
  }

  const ledgerRows = [
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: week7Meeting.id,
      fundAccountId: internalFund.id,
      type: "SHARE_PURCHASE",
      amountCents: 200000,
      direction: "CREDIT",
      description: "Mary Njeri bought 4 shares",
      createdAt: new Date("2026-05-06T07:45:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: week7Meeting.id,
      fundAccountId: socialFund.id,
      type: "SOCIAL_CONTRIBUTION",
      amountCents: 50000,
      direction: "CREDIT",
      description: "Mary Njeri social fund contribution",
      createdAt: new Date("2026-05-06T07:50:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: week7Meeting.id,
      fundAccountId: internalFund.id,
      type: "LOAN_REPAYMENT",
      amountCents: 150000,
      direction: "CREDIT",
      description: "Mary Njeri loan repayment",
      createdAt: new Date("2026-05-06T08:05:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: week7Meeting.id,
      fundAccountId: internalFund.id,
      type: "INTERNAL_LOAN_DISBURSEMENT",
      amountCents: 1000000,
      direction: "DEBIT",
      description: "Mary Njeri poultry stock loan disbursement",
      createdAt: new Date("2026-05-06T08:25:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[1]!.id,
      meetingId: week7Meeting.id,
      fundAccountId: socialFund.id,
      type: "SOCIAL_GRANT",
      amountCents: 100000,
      direction: "DEBIT",
      description: "Faith Achieng emergency social grant",
      createdAt: new Date("2026-05-06T08:35:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: week8Meeting.id,
      fundAccountId: internalFund.id,
      type: "SHARE_PURCHASE",
      amountCents: 300000,
      direction: "CREDIT",
      description: "Mary Njeri bought 6 shares",
      createdAt: new Date("2026-05-13T07:42:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: week8Meeting.id,
      fundAccountId: socialFund.id,
      type: "SOCIAL_CONTRIBUTION",
      amountCents: 50000,
      direction: "CREDIT",
      description: "Mary Njeri social fund contribution",
      createdAt: new Date("2026-05-13T07:50:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: week8Meeting.id,
      fundAccountId: internalFund.id,
      type: "LOAN_REPAYMENT",
      amountCents: 200000,
      direction: "CREDIT",
      description: "Mary Njeri loan repayment",
      createdAt: new Date("2026-05-13T08:10:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[2]!.id,
      meetingId: week8Meeting.id,
      fundAccountId: internalFund.id,
      type: "SHARE_PURCHASE",
      amountCents: 250000,
      direction: "CREDIT",
      description: "Agnes Muthoni bought 5 shares",
      createdAt: new Date("2026-05-13T08:15:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: meeting.id,
      fundAccountId: internalFund.id,
      type: "SHARE_PURCHASE",
      amountCents: 250000,
      direction: "CREDIT",
      description: "Mary Njeri bought 5 shares",
      createdAt: new Date("2026-05-20T07:44:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: meeting.id,
      fundAccountId: socialFund.id,
      type: "SOCIAL_CONTRIBUTION",
      amountCents: 50000,
      direction: "CREDIT",
      description: "Mary Njeri social fund contribution",
      createdAt: new Date("2026-05-20T07:49:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: meeting.id,
      fundAccountId: internalFund.id,
      type: "LOAN_REPAYMENT",
      amountCents: 200000,
      direction: "CREDIT",
      description: "Mary Njeri loan repayment",
      createdAt: new Date("2026-05-20T08:20:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[1]!.id,
      meetingId: meeting.id,
      fundAccountId: socialFund.id,
      type: "SOCIAL_CONTRIBUTION",
      amountCents: 50000,
      direction: "CREDIT",
      description: "Social fund contribution",
      createdAt: new Date("2026-05-20T08:05:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[4]!.id,
      meetingId: meeting.id,
      fundAccountId: internalFund.id,
      type: "LOAN_REPAYMENT",
      amountCents: 800000,
      direction: "CREDIT",
      description: "Internal loan repayment",
      createdAt: new Date("2026-05-20T08:28:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[3]!.id,
      meetingId: offlineSyncMeeting.id,
      fundAccountId: internalFund.id,
      type: "SHARE_PURCHASE",
      amountCents: 150000,
      direction: "CREDIT",
      description: "Beatrice Wambui bought 3 shares offline",
      createdAt: new Date("2026-06-04T08:22:00.000Z")
    },
    {
      groupId: group.id,
      memberId: members[0]!.id,
      meetingId: offlineSyncMeeting.id,
      fundAccountId: socialFund.id,
      type: "SOCIAL_CONTRIBUTION",
      amountCents: 50000,
      direction: "CREDIT",
      description: "Mary Njeri offline social fund contribution",
      createdAt: new Date("2026-06-04T08:30:00.000Z")
    }
  ];

  await prisma.ledgerEntry.createMany({
    data: ledgerRows.map((row) => ({
      ...row,
      signature: signLedgerPayload(row)
    }))
  });

  const votePayload = {
    groupId: group.id,
    meetingId: meeting.id,
    resolutionType: "INTERNAL_LOAN_APPROVAL",
    motion: "Approve Jane Wairimu loan request for poultry stock",
    result: "PASSED",
    quorumRequired: 75,
    yesCount: 5,
    noCount: 0,
    abstainCount: 1,
    totalEligible: 6
  };

  await prisma.vote.create({
    data: {
      ...votePayload,
      hash: signLedgerPayload(votePayload)
    }
  });

  await prisma.creditScore.createMany({
    data: [
      {
        groupId: group.id,
        score: 82,
        breakdownJson: JSON.stringify({
          savingsConsistency: 17,
          repaymentRate: 22,
          attendanceRate: 13,
          constitutionCompliance: 14,
          socialFundHealth: 8,
          cycleAge: 5,
          securityCompliance: 3
        })
      },
      {
        groupId: secondGroup.id,
        score: 76,
        breakdownJson: JSON.stringify({
          savingsConsistency: 15,
          repaymentRate: 20,
          attendanceRate: 12,
          constitutionCompliance: 12,
          socialFundHealth: 7,
          cycleAge: 7,
          securityCompliance: 3
        })
      }
    ]
  });

  const demoUsers = await prisma.user.findMany({
    where: {
      email: {
        in: demoAccounts.map((account) => account.email)
      }
    },
    select: { id: true, email: true }
  });
  const userByEmail = new Map(demoUsers.map((user) => [user.email, user]));
  const memberUser = userByEmail.get(demoAccount("MEMBER").email);
  const groupUser = userByEmail.get(demoAccount("GROUP_ACCOUNT").email);
  const partnerUser = userByEmail.get(demoAccount("PARTNER_OFFICER").email);
  const lenderUser = userByEmail.get(demoAccount("LENDER").email);
  const adminUser = userByEmail.get(demoAccount("IWL_ADMIN").email);

  await prisma.notification.createMany({
    data: [
      ...(memberUser
        ? [
            {
              userId: memberUser.id,
              title: "Meeting is active",
              body: "Week 9 Digital Meeting is available in your meetings calendar.",
              type: "MEETING",
              href: "/dashboard/meetings",
              createdAt: new Date("2026-05-20T06:30:00.000Z")
            },
            {
              userId: memberUser.id,
              title: "Passbook updated",
              body: "Your latest share purchase and social fund records are ready to view.",
              type: "PASSBOOK",
              href: "/dashboard/passbook",
              createdAt: new Date("2026-05-20T09:15:00.000Z")
            }
          ]
        : []),
      ...(groupUser
        ? [
            {
              userId: groupUser.id,
              title: "Meeting key review",
              body: "Week 9 Digital Meeting has three verified key submissions.",
              type: "MEETING",
              href: "/dashboard/meetings",
              createdAt: new Date("2026-05-20T07:10:00.000Z")
            }
          ]
        : []),
      ...(partnerUser
        ? [
            {
              userId: partnerUser.id,
              title: "Store request ready",
              body: "A programme-backed Solar Egg Incubator request is waiting for review.",
              type: "STORE",
              href: "/dashboard/intelli-store",
              createdAt: new Date("2026-05-21T08:30:00.000Z")
            }
          ]
        : []),
      ...(lenderUser
        ? [
            {
              userId: lenderUser.id,
              title: "Loan portfolio changed",
              body: "A financed store request has a repayment schedule available for review.",
              type: "STORE",
              href: "/dashboard/intelli-store",
              createdAt: new Date("2026-05-22T10:15:00.000Z")
            }
          ]
        : []),
      ...(adminUser
        ? [
            {
              userId: adminUser.id,
              title: "Audit evidence staged",
              body: "Seed partner evidence and reconciliation records are available in IntelliAudit.",
              type: "AUDIT",
              href: "/dashboard/intelliaudit",
              createdAt: new Date("2026-05-23T08:45:00.000Z")
            }
          ]
        : [])
    ]
  });

  await prisma.integrationConfig.createMany({
    data: integrationProviders.map((provider) => ({
      provider,
      displayName: provider
        .split("_")
        .map((part) => part[0] + part.slice(1).toLowerCase())
        .join(" "),
      mode: "SANDBOX",
      enabled: true,
      requiredEnvJson: JSON.stringify(requiredEnvForProvider(provider))
    }))
  });

  await prisma.webhookSubscription.create({
    data: {
      partnerId: partner.id,
      url: "https://partner.example.org/intellicash/webhook",
      eventTypesJson: JSON.stringify([
        "MEETING_SEALED",
        "CREDIT_SCORE_COMPUTED",
        "VOTE_RECORDED"
      ]),
      secretHash: sha256("demo-webhook-secret")
    }
  });

  const auditPayload = {
    message: "Seed data installed",
    rolePermissions
  };

  const seedAuditEvent = await prisma.auditEvent.create({
    data: {
      actorUserId: admin.id,
      entityType: "SYSTEM",
      entityId: "seed",
      type: "GROUP_CREATED",
      payloadJson: JSON.stringify(auditPayload),
      hash: signLedgerPayload(auditPayload)
    }
  });

  const evidenceSource = await prisma.intelliAuditEvidenceSource.create({
    data: {
      name: "Seed M-Pesa and bank statement staging",
      sourceType: "MPESA_STATEMENT",
      provider: "MPESA_DARAJA",
      scopeType: "PARTNER",
      scopeId: partner.id,
      createdByUserId: admin.id,
      connectorConfigJson: JSON.stringify({
        mode: "seeded",
        standards: ["IFRS", "ISA", "VSLA"]
      })
    }
  });
  const seedEvidenceRows = [
    {
      recordType: "MPESA_RECEIPT",
      amountCents: 250000,
      currency: "KES",
      direction: "CREDIT",
      counterparty: "Mary Njeri",
      reference: "MPESA-SEED-001",
      description: "Share purchase receipt matched to Tujijenge ledger"
    },
    {
      recordType: "BANK_DEPOSIT",
      amountCents: 120000000,
      currency: "KES",
      direction: "CREDIT",
      counterparty: "Donor escrow account",
      reference: "BANK-SEED-001",
      description: "Large donor deposit requiring authorization review"
    }
  ];
  const evidenceDocument = await prisma.intelliAuditSourceDocument.create({
    data: {
      sourceId: evidenceSource.id,
      scopeType: "PARTNER",
      scopeId: partner.id,
      title: "Seed partner audit evidence pack",
      fileName: "seed-mpesa-bank-statement.csv",
      mimeType: "text/csv",
      contentHash: signLedgerPayload(seedEvidenceRows),
      extractionStatus: "COMPLETE",
      rawMetadataJson: JSON.stringify({
        generatedBy: "seed",
        source: "M-Pesa and bank statement staging"
      }),
      uploadedByUserId: admin.id
    }
  });
  const extractedEvidenceRecords = await Promise.all(
    seedEvidenceRows.map((row) =>
      prisma.intelliAuditExtractedRecord.create({
        data: {
          sourceId: evidenceSource.id,
          documentId: evidenceDocument.id,
          recordType: row.recordType,
          amountCents: row.amountCents,
          currency: row.currency,
          direction: row.direction,
          counterparty: row.counterparty,
          reference: row.reference,
          description: row.description,
          normalizedJson: JSON.stringify(row),
          hash: signLedgerPayload(row),
          confidence: 0.88
        }
      })
    )
  );
  const reconciliationBatch = await prisma.intelliAuditReconciliationBatch.create({
    data: {
      scopeType: "PARTNER",
      scopeId: partner.id,
      title: "Seed partner statement reconciliation",
      status: "STAGED",
      recordCount: extractedEvidenceRecords.length,
      exceptionCount: 1,
      totalCreditCents: extractedEvidenceRecords.reduce(
        (sum, record) => sum + (record.amountCents ?? 0),
        0
      ),
      createdByUserId: admin.id,
      items: {
        create: extractedEvidenceRecords.map((record) => ({
          extractedRecordId: record.id,
          matchStatus: record.reference === "BANK-SEED-001" ? "EXCEPTION" : "MATCHED",
          confidence: record.reference === "BANK-SEED-001" ? 0.64 : 0.92,
          exceptionJson:
            record.reference === "BANK-SEED-001"
              ? JSON.stringify({ reason: "Large donor deposit requires support review" })
              : null
        }))
      }
    }
  });
  const seedFinding = await prisma.intelliAuditFinding.create({
    data: {
      scopeType: "PARTNER",
      scopeId: partner.id,
      severity: "MEDIUM",
      category: "UNUSUAL_TRANSACTION",
      title: "Large donor deposit requires authorization review",
      observation:
        "Seeded bank evidence includes a high-value donor deposit that should be tied to donor agreement, budget line, and bank confirmation.",
      recommendation:
        "Attach donor authorization, bank confirmation, and budget classification before final report approval.",
      evidenceRefsJson: JSON.stringify([
        {
          entityType: "INTELLIAUDIT_RECORD",
          entityId: extractedEvidenceRecords[1]!.id
        }
      ]),
      sourceIdsJson: JSON.stringify([evidenceSource.id]),
      createdByUserId: admin.id
    }
  });
  await prisma.intelliAuditRecommendation.create({
    data: {
      findingId: seedFinding.id,
      scopeType: "PARTNER",
      scopeId: partner.id,
      title: "Complete donor deposit support pack",
      action:
        "Collect donor agreement, board/management approval, bank confirmation, and budget coding for the flagged deposit.",
      priority: "MEDIUM",
      createdByUserId: admin.id,
      evidenceRefsJson: JSON.stringify([
        {
          entityType: "INTELLIAUDIT_RECORD",
          entityId: extractedEvidenceRecords[1]!.id
        }
      ])
    }
  });
  const reportContent = {
    title: "Seed VSLA audit readiness report",
    executiveSummary:
      "Seeded draft based on partner evidence records, reconciliation staging, and immutable audit references.",
    methodology:
      "Uses source-document hashing, staged reconciliation, anomaly flags, and audit event references.",
    findings: [seedFinding.title],
    financialAnalysis: {
      evidenceRecords: extractedEvidenceRecords.length,
      reconciliationBatchId: reconciliationBatch.id
    },
    complianceReview: ["IFRS", "ISA", "Kenya Data Protection Act", "AML/CFT"],
    riskAssessment: ["Large donor deposit requires supporting documentation."],
    recommendations: ["Complete support pack before approval."],
    appendices: ["Evidence source register", "Reconciliation batch", "Audit trail references"]
  };
  await prisma.intelliAuditReportDraft.create({
    data: {
      scopeType: "PARTNER",
      scopeId: partner.id,
      templateKey: "VSLA_AUDIT_READINESS",
      standard: "VSLA",
      title: "Seed VSLA audit readiness report",
      generatedByUserId: admin.id,
      contentJson: JSON.stringify(reportContent),
      auditTrailRefsJson: JSON.stringify([
        { entityType: "AUDIT_EVENT", entityId: seedAuditEvent.id },
        { entityType: "INTELLIAUDIT_DOCUMENT", entityId: evidenceDocument.id },
        { entityType: "INTELLIAUDIT_RECORD", entityId: extractedEvidenceRecords[0]!.id }
      ]),
      auditReferences: {
        create: [
          {
            entityType: "AUDIT_EVENT",
            entityId: seedAuditEvent.id,
            auditEventId: seedAuditEvent.id
          },
          {
            entityType: "INTELLIAUDIT_DOCUMENT",
            entityId: evidenceDocument.id,
            evidenceDocumentId: evidenceDocument.id
          },
          {
            entityType: "INTELLIAUDIT_RECORD",
            entityId: extractedEvidenceRecords[0]!.id,
            extractedRecordId: extractedEvidenceRecords[0]!.id
          }
        ]
      }
    }
  });
}

function requiredEnvForProvider(provider: string) {
  const map: Record<string, string[]> = {
    MPESA_DARAJA: [
      "MPESA_CONSUMER_KEY",
      "MPESA_CONSUMER_SECRET",
      "MPESA_SHORTCODE",
      "MPESA_PASSKEY",
      "MPESA_CALLBACK_URL",
      "MPESA_INITIATOR_NAME",
      "MPESA_SECURITY_CREDENTIAL",
      "MPESA_B2C_RESULT_URL",
      "MPESA_B2C_TIMEOUT_URL"
    ],
    AFRICAS_TALKING: [
      "AFRICASTALKING_USERNAME",
      "AFRICASTALKING_API_KEY",
      "AFRICASTALKING_SENDER_ID"
    ],
    BONGA_SMS: [
      "BONGA_SMS_CLIENT_ID",
      "BONGA_SMS_API_KEY",
      "BONGA_SMS_API_SECRET"
    ],
    IPRS: ["IPRS_BASE_URL", "IPRS_CLIENT_ID", "IPRS_CLIENT_SECRET"],
    KCB_BUNI: [
      "KCB_BUNI_BASE_URL",
      "KCB_BUNI_CLIENT_ID",
      "KCB_BUNI_CLIENT_SECRET",
      "KCB_BUNI_CALLBACK_URL"
    ],
    PAYSTACK: ["PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY"],
    TRANSUNION_CRB: [
      "TRANSUNION_BASE_URL",
      "TRANSUNION_CLIENT_ID",
      "TRANSUNION_CLIENT_SECRET"
    ],
    MFARM: ["MFARM_BASE_URL", "MFARM_API_KEY"],
    GOOGLE_MAPS: ["GOOGLE_MAPS_BROWSER_API_KEY"]
  };

  return map[provider] ?? [];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDatabase()
    .then(async () => {
      await prisma.$disconnect();
      console.log("Intellicash seed data created.");
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
