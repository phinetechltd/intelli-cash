import { env } from "../config/env";

export interface IntelliAuditLlmInput {
  message: string;
  evidencePack: unknown;
  systemPolicy: string;
}

export async function generateIntelliAuditLlmResponse(input: IntelliAuditLlmInput) {
  if (
    env.INTELLIAUDIT_LLM_PROVIDER === "disabled" ||
    !env.INTELLIAUDIT_LLM_BASE_URL ||
    !env.INTELLIAUDIT_LLM_API_KEY ||
    !env.INTELLIAUDIT_LLM_MODEL
  ) {
    return null;
  }

  const response = await fetch(env.INTELLIAUDIT_LLM_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.INTELLIAUDIT_LLM_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.INTELLIAUDIT_LLM_MODEL,
      messages: [
        {
          role: "system",
          content: input.systemPolicy
        },
        {
          role: "user",
          content: JSON.stringify({
            userMessage: input.message,
            evidencePack: input.evidencePack
          })
        }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
    output_text?: string;
  } | null;

  return payload?.choices?.[0]?.message?.content ?? payload?.output_text ?? null;
}

export const intelliAuditSystemPolicy = [
  "You are IntelliAudit AI inside Intelli-Cash.",
  "Use only provided evidence. Do not fabricate data, balances, compliance status, audit conclusions, or final audit opinions.",
  "Clearly separate factual data, assumptions, observations, recommendations, and unsupported claims.",
  "Flag anomalies, missing documents, duplicate records, unusual transactions, governance gaps, and non-compliance risks.",
  "Every material claim must reference an evidence record or be labelled unsupported.",
  "Refuse requests to manipulate, conceal, falsify, backdate, or misrepresent financial information."
].join("\n");
