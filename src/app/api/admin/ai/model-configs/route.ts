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

function parseConfig(body: Record<string, unknown>): AIModelFeatureConfigDoc | null {
  const featureKey = typeof body.featureKey === "string" && TASKS.includes(body.featureKey as AIRequestTask)
    ? body.featureKey as AIRequestTask
    : null;
  const defaultModelId = typeof body.defaultModelId === "string" && body.defaultModelId.trim()
    ? body.defaultModelId.trim()
    : null;
  if (!featureKey || !defaultModelId) return null;

  const allowedTiers = Array.isArray(body.allowedTiers)
    ? body.allowedTiers.filter((tier): tier is CreatorPlan => typeof tier === "string" && PLANS.includes(tier as CreatorPlan))
    : PLANS;
  const defaultQualityMode = typeof body.defaultQualityMode === "string" && QUALITY_MODES.includes(body.defaultQualityMode as AIQualityMode)
    ? body.defaultQualityMode as AIQualityMode
    : "balanced";

  return {
    featureKey,
    defaultModelId,
    fallbackModelIds: Array.isArray(body.fallbackModelIds)
      ? body.fallbackModelIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    requiredCapabilities: Array.isArray(body.requiredCapabilities)
      ? body.requiredCapabilities.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    allowedTiers: allowedTiers.length > 0 ? allowedTiers : PLANS,
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
      const allowedTiers = Array.isArray(data.allowedTiers)
        ? data.allowedTiers.filter((tier): tier is CreatorPlan => typeof tier === "string" && DEFAULT_TIERS.includes(tier as CreatorPlan))
        : [];
      return {
        ...data,
        featureKey: typeof data.featureKey === "string" ? data.featureKey : doc.id,
        defaultModelId: typeof data.defaultModelId === "string" ? data.defaultModelId : "",
        fallbackModelIds: Array.isArray(data.fallbackModelIds) ? data.fallbackModelIds.filter((item): item is string => typeof item === "string") : [],
        requiredCapabilities: Array.isArray(data.requiredCapabilities) ? data.requiredCapabilities.filter((item): item is string => typeof item === "string") : [],
        allowedTiers: allowedTiers.length ? allowedTiers : DEFAULT_TIERS,
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
