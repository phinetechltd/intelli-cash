import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { encryptJson } from "../lib/crypto";
import { decryptCredentials } from "./integration-credentials";

const memberPinLength = 6;
const memberOtpTtlMinutes = 15;
const memberPinDeliveryProvider = "AFRICAS_TALKING";
const memberPinSmsProviders = ["AFRICAS_TALKING", "BONGA_SMS"] as const;
const memberPinSmsProviderEnv: Record<(typeof memberPinSmsProviders)[number], string[]> = {
  AFRICAS_TALKING: [
    "AFRICASTALKING_USERNAME",
    "AFRICASTALKING_API_KEY",
    "AFRICASTALKING_SENDER_ID"
  ],
  BONGA_SMS: [
    "BONGA_SMS_CLIENT_ID",
    "BONGA_SMS_API_KEY",
    "BONGA_SMS_API_SECRET"
  ]
};
const memberPinDeliveryChannel = "SMS";
const memberPinDeliveryStatus = "QUEUED";
const defaultPinPurpose = "DEFAULT_PIN";
const currentOtpPurpose = "CURRENT_OTP";

export const memberPinDeliverySelect = {
  id: true,
  memberId: true,
  provider: true,
  channel: true,
  purpose: true,
  phone: true,
  status: true,
  messagePreview: true,
  sentAt: true,
  createdAt: true
} satisfies Prisma.MemberPinDeliverySelect;

export type MemberPinDeliveryPublic = Prisma.MemberPinDeliveryGetPayload<{
  select: typeof memberPinDeliverySelect;
}>;

type MemberPinTarget = {
  id: string;
  fullName: string;
  phone: string;
  pinSetAt?: Date | null;
};

export function generateMemberPin() {
  return randomInt(0, 10 ** memberPinLength).toString().padStart(memberPinLength, "0");
}

export function otpExpiresAt(from: Date) {
  return new Date(from.getTime() + memberOtpTtlMinutes * 60_000);
}

export function maskPhone(phone: string) {
  const trimmed = phone.trim();
  if (trimmed.length <= 6) return trimmed.replace(/\d(?=\d{2})/g, "*");

  return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(trimmed.length - 7, 3))}${trimmed.slice(-3)}`;
}

export function serializeMemberPinDelivery(delivery: MemberPinDeliveryPublic) {
  return {
    ...delivery,
    phone: maskPhone(delivery.phone)
  };
}

async function resolveMemberPinDeliveryProvider(tx: Prisma.TransactionClient) {
  const configs = await tx.integrationConfig.findMany({
    where: { provider: { in: [...memberPinSmsProviders] } },
    select: { provider: true, credentialsJson: true }
  });
  const configsByProvider = new Map(configs.map((config) => [config.provider, config]));

  for (const provider of memberPinSmsProviders) {
    const credentials = decryptCredentials(configsByProvider.get(provider)?.credentialsJson);
    const configured = memberPinSmsProviderEnv[provider].every((key) => process.env[key] || credentials[key]);

    if (configured) return provider;
  }

  return memberPinDeliveryProvider;
}

export async function generateAndQueueMemberPin<TSelect extends Prisma.MemberSelect>(
  tx: Prisma.TransactionClient,
  member: MemberPinTarget,
  input: {
    requestedByUserId?: string | null;
    select: TSelect;
  }
) {
  const pin = generateMemberPin();
  const now = new Date();
  const provider = await resolveMemberPinDeliveryProvider(tx);
  const messageBody = `Your Intelli Cash default meeting PIN is ${pin}. Keep it private; it is saved on the mobile app for offline meeting unlock.`;
  const pinHash = await bcrypt.hash(pin, 12);

  const updatedMember = await tx.member.update({
    where: { id: member.id },
    data: {
      pinHash,
      pinSetAt: member.pinSetAt ?? now,
      pinUpdatedAt: now
    },
    select: input.select
  });

  const delivery = await tx.memberPinDelivery.create({
    data: {
      memberId: member.id,
      requestedByUserId: input.requestedByUserId ?? null,
      provider,
      channel: memberPinDeliveryChannel,
      purpose: defaultPinPurpose,
      phone: member.phone,
      status: memberPinDeliveryStatus,
      messagePreview: `Default meeting PIN SMS queued to ${maskPhone(member.phone)}.`,
      messageCiphertext: encryptJson({
        provider,
        channel: memberPinDeliveryChannel,
        purpose: defaultPinPurpose,
        phone: member.phone,
        pin,
        body: messageBody,
        generatedAt: now.toISOString()
      })
    },
    select: memberPinDeliverySelect
  });

  return { member: updatedMember, delivery };
}

export async function generateAndQueueMemberOtp<TSelect extends Prisma.MemberSelect>(
  tx: Prisma.TransactionClient,
  member: MemberPinTarget,
  input: {
    requestedByUserId?: string | null;
    select: TSelect;
  }
) {
  const otp = generateMemberPin();
  const now = new Date();
  const expiresAt = otpExpiresAt(now);
  const provider = await resolveMemberPinDeliveryProvider(tx);
  const messageBody = `Your Intelli Cash meeting OTP is ${otp}. It expires in ${memberOtpTtlMinutes} minutes and is for online meeting unlock.`;
  const otpHash = await bcrypt.hash(otp, 12);

  const updatedMember = await tx.member.update({
    where: { id: member.id },
    data: {
      currentOtpHash: otpHash,
      currentOtpIssuedAt: now,
      currentOtpExpiresAt: expiresAt
    },
    select: input.select
  });

  const delivery = await tx.memberPinDelivery.create({
    data: {
      memberId: member.id,
      requestedByUserId: input.requestedByUserId ?? null,
      provider,
      channel: memberPinDeliveryChannel,
      purpose: currentOtpPurpose,
      phone: member.phone,
      status: memberPinDeliveryStatus,
      messagePreview: `Meeting OTP SMS queued to ${maskPhone(member.phone)}.`,
      messageCiphertext: encryptJson({
        provider,
        channel: memberPinDeliveryChannel,
        purpose: currentOtpPurpose,
        phone: member.phone,
        body: messageBody,
        generatedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString()
      })
    },
    select: memberPinDeliverySelect
  });

  return { member: updatedMember, delivery };
}
