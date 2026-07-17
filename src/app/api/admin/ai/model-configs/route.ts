import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { upsertAIModelFeatureConfig, type AIModelFeatureConfigDoc } from "@/services/ai-platform";
import type { AIRequestTask } from "@/ai/platform/catalog";
import type { AIQualityMode } from "@/ai/platform/orchestrator";
import type { CreatorPlan } from "@/services/ai-platform";

const TASKS: AIRequestTask[] = [
  "mentor_chat",
  "strategic_advice",
  "roadmap_generation",
  "content_generation",
  "translation",
  "image_generation",
  "video_generation",
  "voice_generation",
  "summary",
  "analysis",
];

const PLANS: CreatorPlan[] = ["explorer", "pro", "elite", "enterprise"];
const QUALITY_MODES: AIQualityMode[] = ["economy", "balanced", "premium", "cinematic", "auto"];

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
    const configs = snapshot.docs.map((doc) => doc.data());
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
