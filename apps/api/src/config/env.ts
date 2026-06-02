import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("file:./dev.db"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),
  SESSION_SECRET: z.string().default("development-session-secret-change-me"),
  ALLOW_SANDBOX_NETWORK_TESTS: z.coerce.boolean().default(false),
  ENABLE_PAYMENT_NETWORK_CALLS: z.coerce.boolean().default(false),
  GOOGLE_MAPS_BROWSER_API_KEY: z.string().default(""),
  INTELLIAUDIT_LLM_PROVIDER: z.string().default("disabled"),
  INTELLIAUDIT_LLM_BASE_URL: z.string().default(""),
  INTELLIAUDIT_LLM_API_KEY: z.string().default(""),
  INTELLIAUDIT_LLM_MODEL: z.string().default(""),
  INTELLIAUDIT_ENABLE_CONNECTOR_NETWORK_CALLS: z.coerce.boolean().default(false)
});

export const env = envSchema.parse({
  ...process.env,
  API_PORT: process.env.API_PORT ?? process.env.PORT
});
