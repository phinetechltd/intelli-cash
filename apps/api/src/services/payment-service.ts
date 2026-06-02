import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../config/env";
import { ApiHttpError } from "../lib/http";
import { prisma } from "../lib/prisma";
import { decryptCredentials } from "./integration-credentials";

export type PaymentProvider = "MPESA_DARAJA" | "PAYSTACK" | "INTERNAL";
export type PaymentTransactionType = "DEPOSIT" | "WITHDRAWAL" | "INVESTMENT" | "DONATION";

interface IncomingPaymentInput {
  provider: Exclude<PaymentProvider, "INTERNAL">;
  amountCents: number;
  internalReference: string;
  customerEmail?: string | null;
  customerName?: string | null;
  phoneNumber?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}

interface PayoutInput {
  provider: Exclude<PaymentProvider, "INTERNAL">;
  amountCents: number;
  internalReference: string;
  phoneNumber?: string | null;
  recipientCode?: string | null;
  description: string;
}

interface GatewayResult {
  providerReference: string;
  checkoutUrl?: string | null;
  accessCode?: string | null;
  metadata: Record<string, unknown>;
}

const providerKeys: Record<Exclude<PaymentProvider, "INTERNAL">, string[]> = {
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
  PAYSTACK: ["PAYSTACK_SECRET_KEY", "PAYSTACK_PUBLIC_KEY"]
};

function metadataJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function asWholeShillings(amountCents: number) {
  return Math.max(1, Math.round(amountCents / 100));
}

function timestamp() {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function callbackUrl(path: string) {
  return `${env.API_PUBLIC_URL.replace(/\/$/, "")}${path}`;
}

function combineCredentials(
  provider: Exclude<PaymentProvider, "INTERNAL">,
  storedCredentials: Record<string, string>
) {
  const credentials: Record<string, string> = {};
  for (const key of providerKeys[provider]) {
    const value = storedCredentials[key] || process.env[key];
    if (value) credentials[key] = value;
  }
  return credentials;
}

async function credentialsFor(provider: Exclude<PaymentProvider, "INTERNAL">) {
  const config = await prisma.integrationConfig.findUnique({ where: { provider } });
  return combineCredentials(provider, decryptCredentials(config?.credentialsJson));
}

function missingKeys(provider: Exclude<PaymentProvider, "INTERNAL">, credentials: Record<string, string>) {
  return providerKeys[provider].filter((key) => !credentials[key]);
}

function assertNetworkCredentials(
  provider: Exclude<PaymentProvider, "INTERNAL">,
  credentials: Record<string, string>
) {
  const missing = missingKeys(provider, credentials);
  if (missing.length > 0) {
    throw new ApiHttpError(
      400,
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
      `${provider} payment credentials are incomplete.`,
      { missing }
    );
  }
}

async function mpesaToken(credentials: Record<string, string>) {
  const key = credentials.MPESA_CONSUMER_KEY;
  const secret = credentials.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new ApiHttpError(400, "MPESA_NOT_CONFIGURED", "M-Pesa credentials are incomplete.");

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const response = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
    headers: { Authorization: `Basic ${auth}` }
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string } | null;

  if (!response.ok || !payload?.access_token) {
    throw new ApiHttpError(502, "MPESA_TOKEN_FAILED", "M-Pesa access token request failed.", payload);
  }

  return payload.access_token;
}

export function createPaymentReference(prefix: string) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`.toUpperCase();
}

export async function initiateIncomingPayment(input: IncomingPaymentInput): Promise<GatewayResult> {
  if (!env.ENABLE_PAYMENT_NETWORK_CALLS) {
    return {
      providerReference: `mock-${input.internalReference}`,
      checkoutUrl:
        input.provider === "PAYSTACK"
          ? `https://checkout.paystack.com/mock-${input.internalReference.toLowerCase()}`
          : null,
      accessCode: input.provider === "PAYSTACK" ? `mock-${input.internalReference}` : null,
      metadata: {
        mode: "mock",
        message:
          input.provider === "MPESA_DARAJA"
            ? "M-Pesa STK Push queued in local mode."
            : "Paystack checkout initialized in local mode."
      }
    };
  }

  const credentials = await credentialsFor(input.provider);
  assertNetworkCredentials(input.provider, credentials);

  if (input.provider === "PAYSTACK") {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: input.amountCents,
        email: input.customerEmail,
        currency: "KES",
        reference: input.internalReference,
        callback_url: `${env.WEB_ORIGIN.replace(/\/$/, "")}/partners`,
        metadata: {
          ...input.metadata,
          customerName: input.customerName,
          description: input.description
        }
      })
    });
    const payload = (await response.json().catch(() => null)) as
      | { status?: boolean; data?: { reference?: string; authorization_url?: string; access_code?: string } }
      | null;

    if (!response.ok || !payload?.status || !payload.data?.reference) {
      throw new ApiHttpError(502, "PAYSTACK_INITIALIZE_FAILED", "Paystack checkout initialization failed.", payload);
    }

    return {
      providerReference: payload.data.reference,
      checkoutUrl: payload.data.authorization_url ?? null,
      accessCode: payload.data.access_code ?? null,
      metadata: payload as Record<string, unknown>
    };
  }

  const shortcode = credentials.MPESA_SHORTCODE;
  const passkey = credentials.MPESA_PASSKEY;
  const phone = input.phoneNumber;
  if (!shortcode || !passkey || !phone) {
    throw new ApiHttpError(400, "MPESA_PAYMENT_DETAILS_REQUIRED", "M-Pesa payments require shortcode, passkey, and phone number.");
  }

  const requestTimestamp = timestamp();
  const token = await mpesaToken(credentials);
  const response = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: Buffer.from(`${shortcode}${passkey}${requestTimestamp}`).toString("base64"),
      Timestamp: requestTimestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: asWholeShillings(input.amountCents),
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: credentials.MPESA_CALLBACK_URL || callbackUrl("/api/v1/payments/mpesa/stk-callback"),
      AccountReference: input.internalReference,
      TransactionDesc: input.description
    })
  });
  const payload = (await response.json().catch(() => null)) as
    | { CheckoutRequestID?: string; MerchantRequestID?: string; ResponseCode?: string }
    | null;

  if (!response.ok || !payload?.CheckoutRequestID) {
    throw new ApiHttpError(502, "MPESA_STK_FAILED", "M-Pesa STK Push request failed.", payload);
  }

  return {
    providerReference: payload.CheckoutRequestID,
    metadata: payload as Record<string, unknown>
  };
}

export async function initiatePayout(input: PayoutInput): Promise<GatewayResult> {
  if (!env.ENABLE_PAYMENT_NETWORK_CALLS) {
    return {
      providerReference: `mock-${input.internalReference}`,
      metadata: {
        mode: "mock",
        message:
          input.provider === "MPESA_DARAJA"
            ? "M-Pesa B2C payout queued in local mode."
            : "Paystack transfer queued in local mode."
      }
    };
  }

  const credentials = await credentialsFor(input.provider);
  assertNetworkCredentials(input.provider, credentials);

  if (input.provider === "PAYSTACK") {
    if (!input.recipientCode) {
      throw new ApiHttpError(400, "PAYSTACK_RECIPIENT_REQUIRED", "Paystack withdrawals require a transfer recipient code.");
    }

    const response = await fetch("https://api.paystack.co/transfer", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: "balance",
        amount: input.amountCents,
        currency: "KES",
        reference: input.internalReference,
        recipient: input.recipientCode,
        reason: input.description
      })
    });
    const payload = (await response.json().catch(() => null)) as
      | { status?: boolean; data?: { reference?: string; transfer_code?: string } }
      | null;

    if (!response.ok || !payload?.status || !payload.data?.reference) {
      throw new ApiHttpError(502, "PAYSTACK_TRANSFER_FAILED", "Paystack transfer request failed.", payload);
    }

    return {
      providerReference: payload.data.reference,
      metadata: payload as Record<string, unknown>
    };
  }

  const shortcode = credentials.MPESA_SHORTCODE;
  const phone = input.phoneNumber;
  if (!shortcode || !phone) {
    throw new ApiHttpError(400, "MPESA_PAYOUT_DETAILS_REQUIRED", "M-Pesa payouts require shortcode and recipient phone number.");
  }

  const token = await mpesaToken(credentials);
  const response = await fetch("https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      InitiatorName: credentials.MPESA_INITIATOR_NAME,
      SecurityCredential: credentials.MPESA_SECURITY_CREDENTIAL,
      CommandID: "BusinessPayment",
      Amount: asWholeShillings(input.amountCents),
      PartyA: shortcode,
      PartyB: phone,
      Remarks: input.description,
      QueueTimeOutURL: credentials.MPESA_B2C_TIMEOUT_URL || callbackUrl("/api/v1/payments/mpesa/b2c-timeout"),
      ResultURL: credentials.MPESA_B2C_RESULT_URL || callbackUrl("/api/v1/payments/mpesa/b2c-result"),
      Occasion: input.internalReference
    })
  });
  const payload = (await response.json().catch(() => null)) as
    | { ConversationID?: string; OriginatorConversationID?: string; ResponseCode?: string }
    | null;

  if (!response.ok || !payload?.ConversationID) {
    throw new ApiHttpError(502, "MPESA_B2C_FAILED", "M-Pesa B2C payout request failed.", payload);
  }

  return {
    providerReference: payload.ConversationID,
    metadata: payload as Record<string, unknown>
  };
}

export async function updateTransactionGatewayFields(
  transactionId: string,
  gateway: GatewayResult
) {
  return prisma.partnerWalletTransaction.update({
    where: { id: transactionId },
    data: {
      providerReference: gateway.providerReference,
      providerCheckoutUrl: gateway.checkoutUrl ?? null,
      providerAccessCode: gateway.accessCode ?? null,
      providerMetadataJson: metadataJson(gateway.metadata)
    }
  });
}

export async function completeIncomingTransaction(reference: string, metadata: Record<string, unknown> = {}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.partnerWalletTransaction.findFirst({
      where: {
        OR: [{ providerReference: reference }, { internalReference: reference }]
      }
    });

    if (!transaction || transaction.type === "WITHDRAWAL") return transaction;
    if (transaction.status === "COMPLETED") return transaction;
    if (transaction.status !== "PENDING") return transaction;

    if (transaction.type === "DEPOSIT" && transaction.walletId) {
      await tx.partnerWallet.update({
        where: { id: transaction.walletId },
        data: { balanceCents: { increment: transaction.amountCents } }
      });
    }

    return tx.partnerWalletTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        providerTransactionId: typeof metadata.providerTransactionId === "string" ? metadata.providerTransactionId : null,
        providerMetadataJson: metadataJson({
          previous: transaction.providerMetadataJson ? JSON.parse(transaction.providerMetadataJson) : {},
          callback: metadata
        })
      }
    });
  });
}

export async function failIncomingTransaction(reference: string, reason: string, metadata: Record<string, unknown> = {}) {
  return prisma.partnerWalletTransaction.updateMany({
    where: {
      OR: [{ providerReference: reference }, { internalReference: reference }],
      type: { in: ["DEPOSIT", "INVESTMENT", "DONATION"] },
      status: "PENDING"
    },
    data: {
      status: "FAILED",
      failureReason: reason,
      providerMetadataJson: metadataJson(metadata)
    }
  });
}

export async function completeWithdrawal(reference: string, metadata: Record<string, unknown> = {}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.partnerWalletTransaction.findFirst({
      where: {
        OR: [{ providerReference: reference }, { internalReference: reference }],
        type: "WITHDRAWAL"
      }
    });

    if (!transaction) return null;
    if (transaction.status === "COMPLETED") return transaction;
    if (!["PENDING", "APPROVED"].includes(transaction.status) || !transaction.walletId) return transaction;

    await tx.partnerWallet.update({
      where: { id: transaction.walletId },
      data: {
        balanceCents: { decrement: transaction.amountCents },
        heldCents: { decrement: transaction.amountCents }
      }
    });

    return tx.partnerWalletTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        providerTransactionId: typeof metadata.providerTransactionId === "string" ? metadata.providerTransactionId : null,
        providerMetadataJson: metadataJson(metadata)
      }
    });
  });
}

export async function failWithdrawal(reference: string, reason: string, metadata: Record<string, unknown> = {}) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.partnerWalletTransaction.findFirst({
      where: {
        OR: [{ providerReference: reference }, { internalReference: reference }],
        type: "WITHDRAWAL"
      }
    });

    if (!transaction) return null;
    if (!["PENDING", "APPROVED"].includes(transaction.status) || !transaction.walletId) return transaction;

    await tx.partnerWallet.update({
      where: { id: transaction.walletId },
      data: { heldCents: { decrement: transaction.amountCents } }
    });

    return tx.partnerWalletTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "FAILED",
        failureReason: reason,
        providerMetadataJson: metadataJson(metadata)
      }
    });
  });
}

export async function rejectWithdrawal(transactionId: string, actorUserId: string | undefined, reason: string) {
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.partnerWalletTransaction.findUnique({ where: { id: transactionId } });

    if (!transaction || transaction.type !== "WITHDRAWAL") {
      throw new ApiHttpError(404, "WITHDRAWAL_NOT_FOUND", "Withdrawal request does not exist.");
    }
    if (transaction.status !== "PENDING" || !transaction.walletId) {
      throw new ApiHttpError(400, "WITHDRAWAL_NOT_PENDING", "Only pending withdrawals can be rejected.");
    }

    await tx.partnerWallet.update({
      where: { id: transaction.walletId },
      data: { heldCents: { decrement: transaction.amountCents } }
    });

    return tx.partnerWalletTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "REJECTED",
        approvedByUserId: actorUserId ?? null,
        approvedAt: new Date(),
        failureReason: reason
      }
    });
  });
}

export function verifyPaystackSignature(payload: unknown, signature: string | string[] | undefined, secret: string) {
  if (!signature || Array.isArray(signature)) return false;

  const expected = createHmac("sha512", secret).update(JSON.stringify(payload)).digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function getPaystackSecret() {
  const credentials = await credentialsFor("PAYSTACK");
  return credentials.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY || "";
}

export function walletAvailable(balanceCents: number, heldCents: number) {
  return Math.max(0, balanceCents - heldCents);
}
