import type { CreatorCreditPolicy, PlanCreditProfile, MonetizedFeature, ProviderMode } from "./types";

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
  mentor_chat: { feature: "mentor_chat", baseCredits: 1, monthlyLimit: 50, concurrentLimit: 2, byokEligible: true },
  business_coach: { feature: "business_coach", baseCredits: 1, monthlyLimit: 40, concurrentLimit: 2, byokEligible: true },
  ai_chat: { feature: "ai_chat", baseCredits: 1, monthlyLimit: 50, concurrentLimit: 2, byokEligible: true },
  content_generation: { feature: "content_generation", baseCredits: 20, monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
  prompt_library: { feature: "prompt_library", baseCredits: 5, monthlyLimit: 30, concurrentLimit: 4, byokEligible: true },
  image_generation: { feature: "image_generation", baseCredits: 10, monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
  video_generation: { feature: "video_generation", baseCredits: 100, monthlyLimit: 4, concurrentLimit: 1, byokEligible: false },
  voice_generation: { feature: "voice_generation", baseCredits: 20, monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
  translation: { feature: "translation", baseCredits: 2, monthlyLimit: 40, concurrentLimit: 4, byokEligible: true },
  document_generation: { feature: "document_generation", baseCredits: 20, monthlyLimit: 20, concurrentLimit: 2, byokEligible: true },
  business_planner: { feature: "business_planner", baseCredits: 10, monthlyLimit: 12, concurrentLimit: 2, byokEligible: true },
  social_media_generator: { feature: "social_media_generator", baseCredits: 10, monthlyLimit: 30, concurrentLimit: 2, byokEligible: true },
  sales_coach: { feature: "sales_coach", baseCredits: 5, monthlyLimit: 30, concurrentLimit: 2, byokEligible: true },
  funnel_builder: { feature: "funnel_builder", baseCredits: 20, monthlyLimit: 16, concurrentLimit: 2, byokEligible: true },
  calendar_generation: { feature: "calendar_generation", baseCredits: 15, monthlyLimit: 16, concurrentLimit: 2, byokEligible: true },
};

export const planCreditProfiles: Record<"explorer" | "pro" | "elite" | "enterprise", PlanCreditProfile> = {
  explorer: {
    monthlyCreatorCredits: readNumber("AI_EXPLORER_MONTHLY_CREDITS", 15),
    priorityRouting: false,
    concurrentJobLimit: 1,
    dailySpendingLimit: readNumber("AI_EXPLORER_DAILY_LIMIT", 15),
    monthlyEstimatedAIExpenseCap: readNumber("AI_EXPLORER_MONTHLY_EXPENSE_CAP", 12),
    featureOverrides: {
      mentor_chat: 1,
      ai_chat: 1,
      translation: 3,
      image_generation: 14,
      video_generation: 140,
      voice_generation: 28,
    },
  },
  pro: {
    monthlyCreatorCredits: readNumber("AI_PRO_MONTHLY_CREDITS", 220),
    priorityRouting: false,
    concurrentJobLimit: 3,
    dailySpendingLimit: readNumber("AI_PRO_DAILY_LIMIT", 60),
    monthlyEstimatedAIExpenseCap: readNumber("AI_PRO_MONTHLY_EXPENSE_CAP", 50),
    featureOverrides: {
      mentor_chat: 1,
      ai_chat: 1,
      translation: 2,
      image_generation: 10,
      video_generation: 100,
      voice_generation: 20,
    },
  },
  elite: {
    monthlyCreatorCredits: readNumber("AI_ELITE_MONTHLY_CREDITS", 700),
    priorityRouting: true,
    concurrentJobLimit: 6,
    dailySpendingLimit: readNumber("AI_ELITE_DAILY_LIMIT", 180),
    monthlyEstimatedAIExpenseCap: readNumber("AI_ELITE_MONTHLY_EXPENSE_CAP", 150),
    featureOverrides: {
      mentor_chat: 0,
      ai_chat: 0,
      translation: 1,
      image_generation: 8,
      video_generation: 80,
      voice_generation: 16,
    },
  },
  enterprise: {
    monthlyCreatorCredits: readNumber("AI_ENTERPRISE_MONTHLY_CREDITS", 2000),
    priorityRouting: true,
    concurrentJobLimit: 12,
    dailySpendingLimit: readNumber("AI_ENTERPRISE_DAILY_LIMIT", 500),
    monthlyEstimatedAIExpenseCap: readNumber("AI_ENTERPRISE_MONTHLY_EXPENSE_CAP", 500),
    featureOverrides: {
      mentor_chat: 0,
      ai_chat: 0,
      translation: 0,
      image_generation: 0,
      video_generation: 0,
      voice_generation: 0,
    },
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

