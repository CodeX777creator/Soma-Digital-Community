import type { CreatorCreditPolicy, PlanCreditProfile, MonetizedFeature, ProviderMode } from "./types";
import { DEFAULT_CREATOR_CREDIT_ALLOCATIONS } from "@/lib/creator-credit-config";
import { DEFAULT_TIER_PRIVILEGES } from "@/lib/tier-privileges";

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readMode(name: string, fallback: ProviderMode): ProviderMode {
  const raw = process.env[name];
  if (raw === "credits" || raw === "byok" || raw === "hybrid") return raw;
  return fallback;
}

function readMonthlyExpenseCap(name: string, fallback: number, dailyCap: number): number {
  // Keep monthly protection coherent with the daily cap. Legacy environment
  // values below a 30-day ceiling are raised instead of silently weakening it.
  return Math.max(readNumber(name, fallback), dailyCap * 30);
}

function normalizeGatewayBaseURL(value?: string): string {
  let baseURL = (value || "https://ai-gateway.vercel.sh/v1").replace(/\/+$/, "");
  if (baseURL.endsWith("/v1/ai")) {
    baseURL = baseURL.slice(0, -3);
  }
  if (!/\/v1$/i.test(baseURL)) {
    baseURL = `${baseURL}/v1`;
  }
  return baseURL;
}

export const creatorCreditPolicies: Record<MonetizedFeature, CreatorCreditPolicy> = {
  chat: { feature: "chat", monthlyLimit: 100, concurrentLimit: 2, byokEligible: true },
  image_generation: { feature: "image_generation", monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
  video_generation: { feature: "video_generation", monthlyLimit: 4, concurrentLimit: 1, byokEligible: false },
  audio_generation: { feature: "audio_generation", monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
  document_analysis: { feature: "document_analysis", monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
  translation: { feature: "translation", monthlyLimit: 40, concurrentLimit: 4, byokEligible: true },
  vision: { feature: "vision", monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
  speech_to_text: { feature: "speech_to_text", monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
};

export const planCreditProfiles: Record<"explorer" | "pro" | "elite" | "enterprise", PlanCreditProfile> = {
  explorer: {
    monthlyCreatorCredits: readNumber("AI_EXPLORER_MONTHLY_CREDITS", DEFAULT_CREATOR_CREDIT_ALLOCATIONS.explorer),
    priorityRouting: DEFAULT_TIER_PRIVILEGES.explorer.aiPriority === "priority",
    concurrentJobLimit: DEFAULT_TIER_PRIVILEGES.explorer.aiConcurrency,
    dailySpendingLimit: readNumber("AI_EXPLORER_DAILY_LIMIT", 15),
    monthlyEstimatedAIExpenseCap: readMonthlyExpenseCap("AI_EXPLORER_MONTHLY_EXPENSE_CAP", 450, 15),
  },
  pro: {
    monthlyCreatorCredits: readNumber("AI_PRO_MONTHLY_CREDITS", DEFAULT_CREATOR_CREDIT_ALLOCATIONS.pro),
    priorityRouting: DEFAULT_TIER_PRIVILEGES.pro.aiPriority === "priority",
    concurrentJobLimit: DEFAULT_TIER_PRIVILEGES.pro.aiConcurrency,
    dailySpendingLimit: readNumber("AI_PRO_DAILY_LIMIT", 60),
    monthlyEstimatedAIExpenseCap: readMonthlyExpenseCap("AI_PRO_MONTHLY_EXPENSE_CAP", 1800, 60),
  },
  elite: {
    monthlyCreatorCredits: readNumber("AI_ELITE_MONTHLY_CREDITS", DEFAULT_CREATOR_CREDIT_ALLOCATIONS.elite),
    priorityRouting: DEFAULT_TIER_PRIVILEGES.elite.aiPriority === "priority",
    concurrentJobLimit: DEFAULT_TIER_PRIVILEGES.elite.aiConcurrency,
    dailySpendingLimit: readNumber("AI_ELITE_DAILY_LIMIT", 180),
    monthlyEstimatedAIExpenseCap: readMonthlyExpenseCap("AI_ELITE_MONTHLY_EXPENSE_CAP", 5400, 180),
  },
  enterprise: {
    monthlyCreatorCredits: readNumber("AI_ENTERPRISE_MONTHLY_CREDITS", DEFAULT_CREATOR_CREDIT_ALLOCATIONS.enterprise),
    priorityRouting: DEFAULT_TIER_PRIVILEGES.enterprise.aiPriority === "priority",
    concurrentJobLimit: DEFAULT_TIER_PRIVILEGES.enterprise.aiConcurrency,
    dailySpendingLimit: readNumber("AI_ENTERPRISE_DAILY_LIMIT", 500),
    monthlyEstimatedAIExpenseCap: Math.max(readNumber("AI_ENTERPRISE_MONTHLY_EXPENSE_CAP", 15000), 500 * 30),
  },
};

export const monetizationConfig = {
  providerMode: readMode("AI_PROVIDER_MODE", "hybrid"),
  gatewayBaseURL: normalizeGatewayBaseURL(process.env.AI_GATEWAY_BASE_URL || process.env.VERCEL_AI_GATEWAY_BASE_URL),
  gatewayApiKey: process.env.AI_GATEWAY_API_KEY || "",
  byokMasterKey: process.env.AI_PROVIDER_CREDENTIALS_MASTER_KEY || process.env.SOCIAL_CREDENTIALS_MASTER_KEY || "",
  reserveTimeoutMs: readNumber("AI_CREDIT_RESERVATION_TIMEOUT_MS", 10 * 60 * 1000),
  retryAttempts: readNumber("AI_GATEWAY_RETRY_ATTEMPTS", 3),
};
