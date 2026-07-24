import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { upsertAIModelFeatureConfig, type AIModelFeatureConfigDoc } from "@/services/ai-platform";
import type { AIRequestTask } from "@/ai/platform/catalog";
import type { AIQualityMode } from "@/ai/platform/orchestrator";
import type { CreatorPlan } from "@/services/ai-platform";

const TASKS: AIRequestTask[] = [
  "chat",
  "image_generation",
  "video_generation",
  "audio_generation",
  "document_analysis",
  "translation",
  "vision",
  "speech_to_text",
  "strategic_advice",
  "roadmap_generation",
  "summary",
  "analysis",
  "blog_writer",
  "email_writer",
  "ad_copy",
  "sales_funnel",
  "landing_page",
  "social_post",
  "product_description",
  "course_creator",
  "website_builder",
  "presentation_builder",
  "prompt_library",
  "caption",
  "script",
  "carousel",
];

const PLANS: CreatorPlan[] = ["explorer", "pro", "elite", "enterprise"];
const QUALITY_MODES: AIQualityMode[] = ["economy", "balanced", "premium", "cinematic", "auto"];
const DEFAULT_TIERS: CreatorPlan[] = ["explorer", "pro", "elite", "enterprise"];
const PREMIUM_TIERS: CreatorPlan[] = ["pro", "elite", "enterprise"];

function normalizeTiers(value: unknown, fallback: CreatorPlan[]) {
  const tiers = Array.isArray(value)
    ? value.filter((tier): tier is CreatorPlan => typeof tier === "string" && PLANS.includes(tier as CreatorPlan))
    : [];
  return tiers.length > 0 ? tiers : fallback;
}

function tierScopeFromTiers(tiers: CreatorPlan[], fallback: "all" | "pro_plus" | "elite_plus") {
  const normalized = Array.isArray(tiers) ? tiers.join(",") : "";
  if (normalized === DEFAULT_TIERS.join(",")) return "all";
  if (normalized === PREMIUM_TIERS.join(",")) return "pro_plus";
  if (normalized === ["elite", "enterprise"].join(",")) return "elite_plus";
  return fallback;
}

function tiersFromTierScope(scope: unknown, fallback: CreatorPlan[]) {
  if (scope === "all") return DEFAULT_TIERS;
  if (scope === "elite_plus") return ["elite", "enterprise"] as CreatorPlan[];
  if (scope === "pro_plus") return PREMIUM_TIERS;
  return fallback;
}

function parseConfig(body: Record<string, unknown>): AIModelFeatureConfigDoc | null {
  const featureKey = typeof body.featureKey === "string" && TASKS.includes(body.featureKey as AIRequestTask)
    ? body.featureKey as AIRequestTask
    : null;
  const defaultModelId = typeof body.defaultModelId === "string" && body.defaultModelId.trim()
    ? body.defaultModelId.trim()
    : null;
  if (!featureKey || !defaultModelId) return null;

  const defaultQualityMode = typeof body.defaultQualityMode === "string" && QUALITY_MODES.includes(body.defaultQualityMode as AIQualityMode)
    ? body.defaultQualityMode as AIQualityMode
    : "balanced";

  const tierScope = typeof body.tierScope === "string" && ["all", "pro_plus", "elite_plus"].includes(body.tierScope)
    ? body.tierScope as "all" | "pro_plus" | "elite_plus"
    : tierScopeFromTiers(normalizeTiers(body.allowedTiers, DEFAULT_TIERS), "all");
  const premiumTierScope = typeof body.premiumTierScope === "string" && ["pro_plus", "elite_plus"].includes(body.premiumTierScope)
    ? body.premiumTierScope as "pro_plus" | "elite_plus"
    : tierScopeFromTiers(normalizeTiers(body.premiumAllowedTiers, PREMIUM_TIERS), "pro_plus") === "elite_plus"
      ? "elite_plus"
      : "pro_plus";

  return {
    featureKey,
    defaultModelId,
    fallbackModelIds: Array.isArray(body.fallbackModelIds)
      ? body.fallbackModelIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    requiredCapabilities: Array.isArray(body.requiredCapabilities)
      ? body.requiredCapabilities.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    allowedTiers: tiersFromTierScope(tierScope, normalizeTiers(body.allowedTiers, DEFAULT_TIERS)),
    tierScope,
    premiumDefaultModelId: typeof body.premiumDefaultModelId === "string" && body.premiumDefaultModelId.trim()
      ? body.premiumDefaultModelId.trim()
      : undefined,
    premiumFallbackModelIds: Array.isArray(body.premiumFallbackModelIds)
      ? body.premiumFallbackModelIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    premiumAllowedTiers: tiersFromTierScope(premiumTierScope, normalizeTiers(body.premiumAllowedTiers, PREMIUM_TIERS)),
    premiumTierScope,
    defaultQualityMode,
    active: body.active !== false,
  };
}

export const GET = createAPIHandler(
  async (req) => {
    await requireRole(req as any, "admin");
    const snapshot = await adminDb.collection("aiModelFeatureConfigs").get();
    const configs = snapshot.docs.map((doc) => {
      const data = doc.data() as Partial<AIModelFeatureConfigDoc> & Record<string, unknown>;
      return {
        ...data,
        featureKey: typeof data.featureKey === "string" ? data.featureKey : doc.id,
        defaultModelId: typeof data.defaultModelId === "string" ? data.defaultModelId : "",
        fallbackModelIds: Array.isArray(data.fallbackModelIds) ? data.fallbackModelIds.filter((item): item is string => typeof item === "string") : [],
        requiredCapabilities: Array.isArray(data.requiredCapabilities) ? data.requiredCapabilities.filter((item): item is string => typeof item === "string") : [],
        allowedTiers: normalizeTiers(data.allowedTiers, DEFAULT_TIERS),
        tierScope: typeof data.tierScope === "string" && ["all", "pro_plus", "elite_plus"].includes(data.tierScope)
          ? data.tierScope as "all" | "pro_plus" | "elite_plus"
          : tierScopeFromTiers(normalizeTiers(data.allowedTiers, DEFAULT_TIERS), "all"),
        premiumDefaultModelId: typeof data.premiumDefaultModelId === "string" ? data.premiumDefaultModelId : undefined,
        premiumFallbackModelIds: Array.isArray(data.premiumFallbackModelIds) ? data.premiumFallbackModelIds.filter((item): item is string => typeof item === "string") : [],
        premiumAllowedTiers: normalizeTiers(data.premiumAllowedTiers, PREMIUM_TIERS),
        premiumTierScope: typeof data.premiumTierScope === "string" && ["pro_plus", "elite_plus"].includes(data.premiumTierScope)
          ? data.premiumTierScope as "pro_plus" | "elite_plus"
          : tierScopeFromTiers(normalizeTiers(data.premiumAllowedTiers, PREMIUM_TIERS), "pro_plus") as "pro_plus" | "elite_plus",
        defaultQualityMode: typeof data.defaultQualityMode === "string" && QUALITY_MODES.includes(data.defaultQualityMode as AIQualityMode)
          ? data.defaultQualityMode
          : "balanced",
        active: data.active !== false,
      };
    });
    return apiResponse({ configs });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 30000,
  }
);

export const POST = createAPIHandler(
  async (req) => {
    await requireRole(req as any, "admin");
    const body = await req.json();
    const config = parseConfig(body && typeof body === "object" ? body as Record<string, unknown> : {});
    if (!config) {
      return apiError("Feature key and default model are required", { status: 400, code: "INVALID_MODEL_CONFIG" });
    }

    await upsertAIModelFeatureConfig(config);
    return apiResponse({ config });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
    timeout: 30000,
  }
);
