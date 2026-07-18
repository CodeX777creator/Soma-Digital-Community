import type { CreatorCreditPolicy, PlanCreditProfile, MonetizedFeature, ProviderMode } from "./types";
import { DEFAULT_CREATOR_CREDIT_ALLOCATIONS } from "@/lib/creator-credit-config";

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
    priorityRouting: false,
    concurrentJobLimit: 1,
    dailySpendingLimit: readNumber("AI_EXPLORER_DAILY_LIMIT", 15),
    monthlyEstimatedAIExpenseCap: readNumber("AI_EXPLORER_MONTHLY_EXPENSE_CAP", 450),
  },
  pro: {
    monthlyCreatorCredits: readNumber("AI_PRO_MONTHLY_CREDITS", DEFAULT_CREATOR_CREDIT_ALLOCATIONS.pro),
    priorityRouting: false,
    concurrentJobLimit: 3,
    dailySpendingLimit: readNumber("AI_PRO_DAILY_LIMIT", 60),
    monthlyEstimatedAIExpenseCap: readNumber("AI_PRO_MONTHLY_EXPENSE_CAP", 50),
  },
  elite: {
    monthlyCreatorCredits: readNumber("AI_ELITE_MONTHLY_CREDITS", DEFAULT_CREATOR_CREDIT_ALLOCATIONS.elite),
    priorityRouting: true,
    concurrentJobLimit: 6,
    dailySpendingLimit: readNumber("AI_ELITE_DAILY_LIMIT", 180),
    monthlyEstimatedAIExpenseCap: readNumber("AI_ELITE_MONTHLY_EXPENSE_CAP", 150),
  },
  enterprise: {
    monthlyCreatorCredits: readNumber("AI_ENTERPRISE_MONTHLY_CREDITS", DEFAULT_CREATOR_CREDIT_ALLOCATIONS.enterprise),
    priorityRouting: true,
    concurrentJobLimit: 12,
    dailySpendingLimit: readNumber("AI_ENTERPRISE_DAILY_LIMIT", 500),
    monthlyEstimatedAIExpenseCap: readNumber("AI_ENTERPRISE_MONTHLY_EXPENSE_CAP", 500),
  },
};

export const monetizationConfig = {
  providerMode: readMode("AI_PROVIDER_MODE", "hybrid"),
  gatewayBaseURL: process.env.AI_GATEWAY_BASE_URL || "https://api.openai.com/v1",
  gatewayApiKey: process.env.AI_GATEWAY_API_KEY || "",
  byokMasterKey: process.env.AI_PROVIDER_CREDENTIALS_MASTER_KEY || process.env.SOCIAL_CREDENTIALS_MASTER_KEY || "",
  reserveTimeoutMs: readNumber("AI_CREDIT_RESERVATION_TIMEOUT_MS", 10 * 60 * 1000),
  retryAttempts: readNumber("AI_GATEWAY_RETRY_ATTEMPTS", 3),
};
