import { Router } from "express";
import { z } from "zod";
import { appendAuditEvent } from "../services/audit-service";
import { requireAuth } from "../middleware/auth";
import { ApiHttpError, ok } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  completeIncomingTransaction,
  completeWithdrawal,
  createPaymentReference,
  failIncomingTransaction,
  failWithdrawal,
  getPaystackSecret,
  initiateIncomingPayment,
  initiatePayout,
  rejectWithdrawal,
  updateTransactionGatewayFields,
  verifyPaystackSignature,
  walletAvailable
} from "../services/payment-service";

const router = Router();
const providerSchema = z.enum(["MPESA_DARAJA", "PAYSTACK"]);
const contributionTypeSchema = z.enum(["INVESTMENT", "DONATION"]);

const depositSchema = z.object({
  provider: providerSchema,
  amountCents: z.number().int().min(100),
  phoneNumber: z.string().min(7).optional()
});

const withdrawalSchema = z.object({
  provider: providerSchema,
  amountCents: z.number().int().min(100),
  payoutPhoneNumber: z.string().min(7).optional(),
  payoutRecipientCode: z.string().optional()
});

const contributionSchema = z.object({
  type: contributionTypeSchema,
  provider: providerSchema.optional(),
  source: z.enum(["WALLET", "DIRECT"]),
  amountCents: z.number().int().min(100),
  phoneNumber: z.string().min(7).optional()
});

const rejectionSchema = z.object({
  reason: z.string().min(2).default("Rejected by admin")
});

function requirePartnerAccount(user: Express.Request["user"]) {
  if (!user?.partnerId || !["PARTNER_OFFICER", "LENDER"].includes(user.role)) {
    throw new ApiHttpError(403, "PARTNER_ACCOUNT_REQUIRED", "Partner or lender account is required.");
  }
  return user.partnerId;
}

async function ensureWallet(partnerId: string) {
  return prisma.partnerWallet.upsert({
    where: { partnerId },
    create: { partnerId, currency: "KES" },
    update: {}
  });
}

function transactionInclude() {
  return {
    wallet: { include: { partner: true } },
    partner: true,
    programme: { include: { partner: true } }
  } as const;
}

router.get("/partner-wallet", requireAuth("payments:read"), async (req, res, next) => {
  try {
    const partnerId = requirePartnerAccount(req.user);
    const wallet = await ensureWallet(partnerId);
    ok(res, {
      ...wallet,
      availableCents: walletAvailable(wallet.balanceCents, wallet.heldCents)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/partner-wallet/transactions", requireAuth("payments:read"), async (req, res, next) => {
  try {
    const partnerId = requirePartnerAccount(req.user);
    const transactions = await prisma.partnerWalletTransaction.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      include: transactionInclude()
    });

    ok(res, transactions);
  } catch (error) {
    next(error);
  }
});

router.post("/partner-wallet/deposits", requireAuth("payments:write"), async (req, res, next) => {
  try {
    const partnerId = requirePartnerAccount(req.user);
    const body = depositSchema.parse(req.body);
    const wallet = await ensureWallet(partnerId);
    const internalReference = createPaymentReference("DEP");
    const transaction = await prisma.partnerWalletTransaction.create({
      data: {
        walletId: wallet.id,
        partnerId,
        actorUserId: req.user?.id,
        type: "DEPOSIT",
        provider: body.provider,
        source: "DIRECT",
        status: "PENDING",
        amountCents: body.amountCents,
        currency: "KES",
        description: `${req.user?.partner?.name ?? "Partner"} wallet deposit`,
        customerName: req.user?.name,
        customerEmail: req.user?.email,
        phoneNumber: body.phoneNumber,
        internalReference
      }
    });

    const gateway = await initiateIncomingPayment({
      provider: body.provider,
      amountCents: body.amountCents,
      internalReference,
      customerEmail: req.user?.email,
      customerName: req.user?.name,
      phoneNumber: body.phoneNumber,
      description: "Intelli Cash partner wallet deposit",
      metadata: { walletId: wallet.id, partnerId, type: "DEPOSIT" }
    });
    const updated = await updateTransactionGatewayFields(transaction.id, gateway);

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PAYMENT",
      entityId: updated.id,
      type: "PAYMENT_INITIATED",
      payload: updated
    });

    ok(res.status(201), updated);
  } catch (error) {
    next(error);
  }
});

router.post("/partner-wallet/withdrawals", requireAuth("payments:write"), async (req, res, next) => {
  try {
    const partnerId = requirePartnerAccount(req.user);
    const body = withdrawalSchema.parse(req.body);
    const wallet = await ensureWallet(partnerId);
    const available = walletAvailable(wallet.balanceCents, wallet.heldCents);

    if (available < body.amountCents) {
      throw new ApiHttpError(400, "INSUFFICIENT_FUNDS", "Withdrawal exceeds available wallet balance.");
    }
    if (body.provider === "MPESA_DARAJA" && !body.payoutPhoneNumber) {
      throw new ApiHttpError(400, "PAYOUT_PHONE_REQUIRED", "M-Pesa withdrawals require a recipient phone number.");
    }
    if (body.provider === "PAYSTACK" && !body.payoutRecipientCode) {
      throw new ApiHttpError(400, "PAYSTACK_RECIPIENT_REQUIRED", "Paystack withdrawals require a recipient code.");
    }

    const internalReference = createPaymentReference("WDR");
    const transaction = await prisma.$transaction(async (tx) => {
      await tx.partnerWallet.update({
        where: { id: wallet.id },
        data: { heldCents: { increment: body.amountCents } }
      });

      return tx.partnerWalletTransaction.create({
        data: {
          walletId: wallet.id,
          partnerId,
          actorUserId: req.user?.id,
          type: "WITHDRAWAL",
          provider: body.provider,
          source: "WALLET",
          status: "PENDING",
          amountCents: body.amountCents,
          currency: "KES",
          description: `${req.user?.partner?.name ?? "Partner"} withdrawal request`,
          payoutPhoneNumber: body.payoutPhoneNumber,
          payoutRecipientCode: body.payoutRecipientCode,
          internalReference
        },
        include: transactionInclude()
      });
    });

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PAYMENT",
      entityId: transaction.id,
      type: "WITHDRAWAL_REQUESTED",
      payload: transaction
    });

    ok(res.status(201), transaction);
  } catch (error) {
    next(error);
  }
});

router.post("/programmes/:id/contributions", requireAuth("payments:write"), async (req, res, next) => {
  try {
    const partnerId = requirePartnerAccount(req.user);
    const programmeId = z.string().parse(req.params.id);
    const body = contributionSchema.parse(req.body);
    const programme = await prisma.programme.findFirst({
      where: { id: programmeId, publicStatus: "ONGOING" },
      select: {
        id: true,
        name: true,
        allowInvestments: true,
        allowDonations: true
      }
    });

    if (!programme) throw new ApiHttpError(404, "PROJECT_NOT_FOUND", "Public project does not exist.");
    if (body.type === "INVESTMENT" && !programme.allowInvestments) {
      throw new ApiHttpError(400, "INVESTMENTS_DISABLED", "This project is not accepting investments.");
    }
    if (body.type === "DONATION" && !programme.allowDonations) {
      throw new ApiHttpError(400, "DONATIONS_DISABLED", "This project is not accepting donations.");
    }

    const wallet = await ensureWallet(partnerId);
    if (body.source === "WALLET") {
      const available = walletAvailable(wallet.balanceCents, wallet.heldCents);
      if (available < body.amountCents) {
        throw new ApiHttpError(400, "INSUFFICIENT_FUNDS", "Contribution exceeds available wallet balance.");
      }

      const transaction = await prisma.$transaction(async (tx) => {
        await tx.partnerWallet.update({
          where: { id: wallet.id },
          data: { balanceCents: { decrement: body.amountCents } }
        });

        return tx.partnerWalletTransaction.create({
          data: {
            walletId: wallet.id,
            partnerId,
            programmeId: programme.id,
            actorUserId: req.user?.id,
            type: body.type,
            provider: "INTERNAL",
            source: "WALLET",
            status: "COMPLETED",
            amountCents: body.amountCents,
            currency: "KES",
            description: `${body.type.toLowerCase()} from wallet for ${programme.name}`,
            customerName: req.user?.name,
            customerEmail: req.user?.email,
            internalReference: createPaymentReference(body.type === "INVESTMENT" ? "INV" : "DON"),
            completedAt: new Date()
          },
          include: transactionInclude()
        });
      });

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "PAYMENT",
        entityId: transaction.id,
        type: "PAYMENT_COMPLETED",
        payload: transaction
      });

      ok(res.status(201), transaction);
      return;
    }

    if (!body.provider) {
      throw new ApiHttpError(400, "PAYMENT_PROVIDER_REQUIRED", "Direct contributions require a provider.");
    }

    const internalReference = createPaymentReference(body.type === "INVESTMENT" ? "INV" : "DON");
    const transaction = await prisma.partnerWalletTransaction.create({
      data: {
        walletId: wallet.id,
        partnerId,
        programmeId: programme.id,
        actorUserId: req.user?.id,
        type: body.type,
        provider: body.provider,
        source: "DIRECT",
        status: "PENDING",
        amountCents: body.amountCents,
        currency: "KES",
        description: `${body.type.toLowerCase()} direct payment for ${programme.name}`,
        customerName: req.user?.name,
        customerEmail: req.user?.email,
        phoneNumber: body.phoneNumber,
        internalReference
      }
    });

    const gateway = await initiateIncomingPayment({
      provider: body.provider,
      amountCents: body.amountCents,
      internalReference,
      customerEmail: req.user?.email,
      customerName: req.user?.name,
      phoneNumber: body.phoneNumber,
      description: `${body.type.toLowerCase()} for ${programme.name}`,
      metadata: { programmeId: programme.id, partnerId, type: body.type }
    });
    const updated = await updateTransactionGatewayFields(transaction.id, gateway);

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PAYMENT",
      entityId: updated.id,
      type: "PAYMENT_INITIATED",
      payload: updated
    });

    ok(res.status(201), updated);
  } catch (error) {
    next(error);
  }
});

router.get("/payment-requests", requireAuth("payments:approve"), async (_req, res, next) => {
  try {
    const requests = await prisma.partnerWalletTransaction.findMany({
      orderBy: { createdAt: "desc" },
      include: transactionInclude()
    });

    ok(res, requests);
  } catch (error) {
    next(error);
  }
});

router.post("/payment-requests/:id/approve-withdrawal", requireAuth("payments:approve"), async (req, res, next) => {
  try {
    const transactionId = z.string().parse(req.params.id);
    const existing = await prisma.partnerWalletTransaction.findUnique({
      where: { id: transactionId },
      include: transactionInclude()
    });

    if (!existing || existing.type !== "WITHDRAWAL") {
      throw new ApiHttpError(404, "WITHDRAWAL_NOT_FOUND", "Withdrawal request does not exist.");
    }
    if (existing.status !== "PENDING") {
      throw new ApiHttpError(400, "WITHDRAWAL_NOT_PENDING", "Only pending withdrawals can be approved.");
    }

    const approved = await prisma.partnerWalletTransaction.update({
      where: { id: existing.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: req.user?.id
      }
    });

    try {
      const gateway = await initiatePayout({
        provider: approved.provider as "MPESA_DARAJA" | "PAYSTACK",
        amountCents: approved.amountCents,
        internalReference: approved.internalReference,
        phoneNumber: approved.payoutPhoneNumber,
        recipientCode: approved.payoutRecipientCode,
        description: approved.description ?? "Partner wallet withdrawal"
      });
      const updated = await updateTransactionGatewayFields(approved.id, gateway);

      await appendAuditEvent({
        actorUserId: req.user?.id,
        entityType: "PAYMENT",
        entityId: updated.id,
        type: "WITHDRAWAL_APPROVED",
        payload: updated
      });

      ok(res, updated);
    } catch (gatewayError) {
      await failWithdrawal(
        approved.internalReference,
        gatewayError instanceof Error ? gatewayError.message : "Payout initiation failed"
      );
      throw gatewayError;
    }
  } catch (error) {
    next(error);
  }
});

router.post("/payment-requests/:id/reject-withdrawal", requireAuth("payments:approve"), async (req, res, next) => {
  try {
    const body = rejectionSchema.parse(req.body);
    const transactionId = z.string().parse(req.params.id);
    const rejected = await rejectWithdrawal(transactionId, req.user?.id, body.reason);

    await appendAuditEvent({
      actorUserId: req.user?.id,
      entityType: "PAYMENT",
      entityId: rejected.id,
      type: "WITHDRAWAL_REJECTED",
      payload: rejected
    });

    ok(res, rejected);
  } catch (error) {
    next(error);
  }
});

async function storeWebhook(input: {
  provider: string;
  eventId: string;
  reference?: string | null;
  signatureValid?: boolean;
  payload: unknown;
}) {
  const existing = await prisma.paymentWebhookEvent.findUnique({
    where: { eventId: input.eventId }
  });
  if (existing) return { event: existing, duplicate: true };

  const event = await prisma.paymentWebhookEvent.create({
    data: {
      provider: input.provider,
      eventId: input.eventId,
      reference: input.reference,
      signatureValid: input.signatureValid ?? true,
      payloadJson: JSON.stringify(input.payload),
      processed: false
    }
  });

  return { event, duplicate: false };
}

router.post("/payments/mpesa/stk-callback", async (req, res, next) => {
  try {
    const payload = req.body as {
      Body?: {
        stkCallback?: {
          CheckoutRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
          CallbackMetadata?: { Item?: Array<{ Name?: string; Value?: unknown }> };
        };
      };
    };
    const callback = payload.Body?.stkCallback;
    const reference = callback?.CheckoutRequestID;

    if (!reference) throw new ApiHttpError(400, "MPESA_REFERENCE_MISSING", "M-Pesa callback reference is missing.");

    const webhook = await storeWebhook({
      provider: "MPESA_DARAJA",
      eventId: `mpesa-stk-${reference}-${callback?.ResultCode ?? "unknown"}`,
      reference,
      payload
    });

    if (!webhook.duplicate) {
      const metadataItems = callback?.CallbackMetadata?.Item ?? [];
      const metadata = Object.fromEntries(
        metadataItems
          .filter((item): item is { Name: string; Value: unknown } => Boolean(item.Name))
          .map((item) => [item.Name, item.Value])
      );

      if (callback?.ResultCode === 0) {
        await completeIncomingTransaction(reference, {
          ...metadata,
          providerTransactionId:
            typeof metadata.MpesaReceiptNumber === "string" ? metadata.MpesaReceiptNumber : undefined
        });
      } else {
        await failIncomingTransaction(reference, callback?.ResultDesc ?? "M-Pesa payment failed.", payload);
      }

      await prisma.paymentWebhookEvent.update({
        where: { id: webhook.event.id },
        data: { processed: true }
      });
    }

    ok(res, { received: true });
  } catch (error) {
    next(error);
  }
});

router.post("/payments/mpesa/b2c-result", async (req, res, next) => {
  try {
    const payload = req.body as {
      Result?: {
        ConversationID?: string;
        OriginatorConversationID?: string;
        ResultCode?: number;
        ResultDesc?: string;
        ResultParameters?: { ResultParameter?: Array<{ Key?: string; Value?: unknown }> };
      };
    };
    const result = payload.Result;
    const reference = result?.ConversationID ?? result?.OriginatorConversationID;

    if (!reference) throw new ApiHttpError(400, "MPESA_REFERENCE_MISSING", "M-Pesa payout reference is missing.");

    const webhook = await storeWebhook({
      provider: "MPESA_DARAJA",
      eventId: `mpesa-b2c-${reference}-${result?.ResultCode ?? "unknown"}`,
      reference,
      payload
    });

    if (!webhook.duplicate) {
      const metadataItems = result?.ResultParameters?.ResultParameter ?? [];
      const metadata = Object.fromEntries(
        metadataItems
          .filter((item): item is { Key: string; Value: unknown } => Boolean(item.Key))
          .map((item) => [item.Key, item.Value])
      );

      if (result?.ResultCode === 0) {
        await completeWithdrawal(reference, {
          ...metadata,
          providerTransactionId:
            typeof metadata.TransactionReceipt === "string" ? metadata.TransactionReceipt : undefined
        });
      } else {
        await failWithdrawal(reference, result?.ResultDesc ?? "M-Pesa payout failed.", payload);
      }

      await prisma.paymentWebhookEvent.update({
        where: { id: webhook.event.id },
        data: { processed: true }
      });
    }

    ok(res, { received: true });
  } catch (error) {
    next(error);
  }
});

router.post("/payments/mpesa/b2c-timeout", async (req, res, next) => {
  try {
    const payload = req.body as { Result?: { ConversationID?: string; OriginatorConversationID?: string } };
    const reference = payload.Result?.ConversationID ?? payload.Result?.OriginatorConversationID;

    if (reference) {
      await failWithdrawal(reference, "M-Pesa payout timed out.", payload);
    }

    ok(res, { received: true });
  } catch (error) {
    next(error);
  }
});

router.post("/payments/paystack/webhook", async (req, res, next) => {
  try {
    const secret = await getPaystackSecret();
    const signatureValid = Boolean(secret) && verifyPaystackSignature(req.body, req.headers["x-paystack-signature"], secret);

    if (!signatureValid) {
      throw new ApiHttpError(400, "PAYSTACK_SIGNATURE_INVALID", "Paystack webhook signature is invalid.");
    }

    const payload = req.body as {
      event?: string;
      data?: {
        id?: number | string;
        reference?: string;
        transfer_code?: string;
        status?: string;
        gateway_response?: string;
      };
    };
    const reference = payload.data?.reference ?? payload.data?.transfer_code;
    if (!payload.event || !reference) {
      throw new ApiHttpError(400, "PAYSTACK_REFERENCE_MISSING", "Paystack webhook reference is missing.");
    }

    const webhook = await storeWebhook({
      provider: "PAYSTACK",
      eventId: `paystack-${payload.event}-${reference}`,
      reference,
      signatureValid,
      payload
    });

    if (!webhook.duplicate) {
      if (payload.event === "charge.success") {
        await completeIncomingTransaction(reference, {
          providerTransactionId: payload.data?.id ? String(payload.data.id) : undefined,
          status: payload.data?.status,
          gatewayResponse: payload.data?.gateway_response
        });
      } else if (payload.event === "transfer.success") {
        await completeWithdrawal(reference, {
          providerTransactionId: payload.data?.id ? String(payload.data.id) : undefined,
          status: payload.data?.status
        });
      } else if (payload.event === "transfer.failed" || payload.event === "transfer.reversed") {
        await failWithdrawal(reference, payload.data?.gateway_response ?? payload.event, payload);
      }

      await prisma.paymentWebhookEvent.update({
        where: { id: webhook.event.id },
        data: { processed: true }
      });
    }

    ok(res, { received: true });
  } catch (error) {
    next(error);
  }
});

export { router as paymentsRouter };
