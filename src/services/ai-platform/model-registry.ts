import "server-only";

import { admin, adminDb } from "@/lib/firebaseAdmin";
import { logger } from "@/lib/logger";
import type { AIQualityMode } from "@/ai/platform/orchestrator";
import type { AIProviderId, AIRequestTask, AIModality } from "@/ai/platform/catalog";
import type { CreatorPlan } from "./types";

export type AIModelCreditClass = "standard" | "advanced" | "premium" | "specialized";

export interface GatewayModelPricing {
  input?: number;
  output?: number;
  inputCacheRead?: number;
  inputCacheWrite?: number;
  image?: number;
  video?: number;
  audio?: number;
}

export interface AIModelRegistryDoc {
  id: string;
  name: string;
  description?: string;
  provider: string;
  type: string;
  tags: string[];
  contextWindow?: number;
  maxTokens?: number;
  pricing: GatewayModelPricing;
  active: boolean;
  lastSyncedAt: unknown;
  sdcEnabled: boolean;
  tierAccess: CreatorPlan[];
  creditClass: AIModelCreditClass;
  creditMultiplier: number;
  recommendedFor: string[];
  raw?: Record<string, unknown>;
}

export interface AIModelFeatureConfigDoc {
  featureKey: AIRequestTask;
  defaultModelId: string;
  fallbackModelIds: string[];
  requiredCapabilities: string[];
  allowedTiers: CreatorPlan[];
  premiumDefaultModelId?: string;
  premiumFallbackModelIds?: string[];
  premiumAllowedTiers?: CreatorPlan[];
  defaultQualityMode: AIQualityMode;
  active: boolean;
  updatedAt?: unknown;
  createdAt?: unknown;
}

export interface ResolvedModelRoute {
  providerId: AIProviderId;
  modelId: string;
  fallbackModelIds: string[];
  source: "feature_config" | "model_registry" | "fallback";
  model?: AIModelRegistryDoc | null;
  featureConfig?: AIModelFeatureConfigDoc | null;
}

const MODEL_REGISTRY_URL = "https://ai-gateway.vercel.sh/v1/models";
const DEFAULT_TIER_ACCESS: CreatorPlan[] = ["explorer", "pro", "elite", "enterprise"];

function normalizeNumber(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function inferProvider(modelId: string, ownedBy?: unknown): string {
  if (typeof ownedBy === "string" && ownedBy.trim()) return ownedBy.trim();
  const [provider] = modelId.split("/");
  return provider || "unknown";
}

function maxDefined(...values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return defined.length ? Math.max(...defined) : 0;
}

function inferCreditClass(model: { type?: string; tags?: string[]; id?: string; pricing?: GatewayModelPricing; contextWindow?: number; maxTokens?: number }): AIModelCreditClass {
  const tags = new Set((model.tags || []).map((tag) => tag.toLowerCase()));
  const id = (model.id || "").toLowerCase();
  const type = (model.type || "").toLowerCase();
  const pricing = model.pricing || {};

  const inputPerMillion = (pricing.input || 0) * 1_000_000;
  const outputPerMillion = (pricing.output || 0) * 1_000_000;
  const textPriceScore = Math.max(inputPerMillion * 3, outputPerMillion);
  const mediaUnitPrice = maxDefined(pricing.image, pricing.audio, pricing.video);
  const contextWindow = model.contextWindow || 0;
  const maxTokens = model.maxTokens || 0;
  const expensiveKeywords = [
    "reasoning",
    "thinking",
    "opus",
    "ultra",
    "pro",
    "premium",
    "large",
    "max",
    "pro-preview",
    "preview",
    "sonnet",
    "gemini-3",
    "gpt-5",
    "claude-4",
    "nemotron-3",
    "seedance",
    "veo",
    "video",
    "imagine",
    "audio",
    "tts",
    "dubbing",
  ];
  const expensiveKeywordHit = expensiveKeywords.some((keyword) => id.includes(keyword));

  if (tags.has("video") || tags.has("video-generation") || id.includes("video") || id.includes("seedance") || id.includes("veo")) {
    return "specialized";
  }

  if (
    pricing.video ||
    textPriceScore >= 8 ||
    mediaUnitPrice >= 0.12 ||
    tags.has("reasoning") ||
    tags.has("thinking") ||
    id.includes("reasoning") ||
    id.includes("opus") ||
    id.includes("ultra") ||
    id.includes("gpt-5") ||
    id.includes("claude-4") ||
    id.includes("gemini-3")
  ) {
    return "premium";
  }

  if (
    textPriceScore >= 1 ||
    mediaUnitPrice >= 0.02 ||
    contextWindow >= 200_000 ||
    maxTokens >= 8_000 ||
    tags.has("vision") ||
    tags.has("tool-use") ||
    tags.has("file-input") ||
    expensiveKeywordHit ||
    id.includes("70b") ||
    id.includes("120b") ||
    id.includes("405b") ||
    type === "image" ||
    type === "audio" ||
    type === "speech"
  ) {
    return "advanced";
  }

  if (expensiveKeywordHit || contextWindow >= 100_000 || maxTokens >= 4_000) {
    return "advanced";
  }
  return "standard";
}

function removeUndefined(obj: Record<string, any>): Record<string, any> {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (result[key] === undefined) {
      delete result[key];
    } else if (result[key] !== null && typeof result[key] === "object" && !(result[key] instanceof admin.firestore.FieldValue)) {
      result[key] = removeUndefined(result[key]);
    }
  }
  return result;
}

function defaultTierAccess(creditClass: AIModelCreditClass): CreatorPlan[] {
  if (creditClass === "specialized") return ["elite", "enterprise"];
  if (creditClass === "premium" || creditClass === "advanced") return ["pro", "elite", "enterprise"];
  return DEFAULT_TIER_ACCESS;
}

function isTierAllowed(tier: CreatorPlan, allowedTiers?: CreatorPlan[]) {
  const tiers = Array.isArray(allowedTiers) && allowedTiers.length ? allowedTiers : DEFAULT_TIER_ACCESS;
  return tiers.includes(tier);
}

function selectPreferredRoute(
  inputTier: CreatorPlan,
  config: AIModelFeatureConfigDoc | null,
): { modelId: string; fallbackModelIds: string[]; source: "feature_config" | "fallback"; isPremium: boolean } | null {
  if (!config || config.active === false) return null;

  const premiumAllowed = isTierAllowed(inputTier, config.premiumAllowedTiers);
  const baseAllowed = isTierAllowed(inputTier, config.allowedTiers);

  if (premiumAllowed && config.premiumDefaultModelId) {
    return {
      modelId: config.premiumDefaultModelId,
      fallbackModelIds: config.premiumFallbackModelIds || [],
      source: "feature_config",
      isPremium: true,
    };
  }

  if (baseAllowed && config.defaultModelId) {
    return {
      modelId: config.defaultModelId,
      fallbackModelIds: config.fallbackModelIds || [],
      source: "feature_config",
      isPremium: false,
    };
  }

  return null;
}

function normalizeModel(raw: Record<string, unknown>): AIModelRegistryDoc | null {
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id) return null;

  const pricing = raw.pricing && typeof raw.pricing === "object" ? raw.pricing as Record<string, unknown> : {};
  const tags = Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const normalizedPricing = {
    input: normalizeNumber(pricing.input),
    output: normalizeNumber(pricing.output),
    inputCacheRead: normalizeNumber(pricing.input_cache_read),
    inputCacheWrite: normalizeNumber(pricing.input_cache_write),
    image: normalizeNumber(pricing.image),
    video: normalizeNumber(pricing.video),
    audio: normalizeNumber(pricing.audio),
  };
  const contextWindow = normalizeNumber(raw.context_window);
  const maxTokens = normalizeNumber(raw.max_tokens);
  const creditClass = inferCreditClass({
    id,
    type: typeof raw.type === "string" ? raw.type : undefined,
    tags,
    pricing: normalizedPricing,
    contextWindow,
    maxTokens,
  });

  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id,
    description: typeof raw.description === "string" ? raw.description : undefined,
    provider: inferProvider(id, raw.owned_by),
    type: typeof raw.type === "string" ? raw.type : "unknown",
    tags,
    contextWindow,
    maxTokens,
    pricing: normalizedPricing,
    active: true,
    lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    sdcEnabled: true,
    tierAccess: defaultTierAccess(creditClass),
    creditClass,
    creditMultiplier: creditClass === "specialized" ? 2 : creditClass === "premium" ? 1.5 : creditClass === "advanced" ? 1.2 : 1,
    recommendedFor: [],
    raw,
  };
}

function modelRef(modelId: string) {
  return adminDb.collection("aiModels").doc(modelId.replace(/\//g, "__"));
}

function featureConfigRef(featureKey: AIRequestTask) {
  return adminDb.collection("aiModelFeatureConfigs").doc(featureKey);
}

function modelIdToProviderId(modelId: string): AIProviderId {
  return "vercel-ai-gateway";
}

export async function syncVercelAIModels(actorId: string): Promise<{ runId: string; synced: number; failed: number }> {
  const startedAt = Date.now();
  const runRef = adminDb.collection("aiModelSyncRuns").doc(`sync_${startedAt}`);
  await runRef.set({
    runId: runRef.id,
    source: MODEL_REGISTRY_URL,
    status: "running",
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: actorId,
  });

  try {
    const response = await fetch(MODEL_REGISTRY_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Model registry fetch failed (${response.status})`);
    }
    const payload = await response.json();
    const rawModels = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    const models = rawModels
      .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map(normalizeModel)
      .filter((model: AIModelRegistryDoc | null): model is AIModelRegistryDoc => Boolean(model));


    const batchLimit = 450;
    let synced = 0;
    for (let i = 0; i < models.length; i += batchLimit) {
      const batch = adminDb.batch();
      for (const model of models.slice(i, i + batchLimit)) {
        batch.set(modelRef(model.id), removeUndefined({
          ...model,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }), { merge: true });
        synced++;
      }
      await batch.commit();
    }

    await runRef.set({
      status: "completed",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      durationMs: Date.now() - startedAt,
      synced,
      failed: 0,
    }, { merge: true });

    return { runId: runRef.id, synced, failed: 0 };
  } catch (error) {
    await runRef.set({
      status: "failed",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }, { merge: true });
    logger.error("[AI Models] Sync failed", error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

export async function listAIModels(limit = 250): Promise<AIModelRegistryDoc[]> {
  const snapshot = await adminDb.collection("aiModels")
    .where("active", "==", true)
    .limit(Math.min(Math.max(limit, 1), 500))
    .get();

  return snapshot.docs.map((doc) => doc.data() as AIModelRegistryDoc);
}

export async function getAIModel(modelId: string): Promise<AIModelRegistryDoc | null> {
  const snap = await modelRef(modelId).get();
  return snap.exists ? snap.data() as AIModelRegistryDoc : null;
}

export async function getAIModelFeatureConfig(featureKey: AIRequestTask): Promise<AIModelFeatureConfigDoc | null> {
  const snap = await featureConfigRef(featureKey).get();
  if (!snap.exists) return null;
  const data = snap.data() as AIModelFeatureConfigDoc;
  return data.active === false ? null : data;
}

export async function upsertAIModelFeatureConfig(config: AIModelFeatureConfigDoc): Promise<void> {
  await featureConfigRef(config.featureKey).set(removeUndefined({
    ...config,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: config.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  }), { merge: true });
}

export async function resolveConfiguredModelRoute(input: {
  featureKey: AIRequestTask;
  userTier: CreatorPlan;
  modality: AIModality;
  fallbackModelId: string;
}): Promise<ResolvedModelRoute> {
  const featureConfig = await getAIModelFeatureConfig(input.featureKey);
  const preferredRoute = selectPreferredRoute(input.userTier, featureConfig);
  if (preferredRoute) {
    const model = await getAIModel(preferredRoute.modelId);
    if (!model || (model.sdcEnabled !== false && model.tierAccess.includes(input.userTier))) {
      return {
        providerId: modelIdToProviderId(preferredRoute.modelId),
        modelId: preferredRoute.modelId,
        fallbackModelIds: preferredRoute.fallbackModelIds,
        source: preferredRoute.source,
        model,
        featureConfig,
      };
    }
  }

  const models = await listAIModels(200);
  const modalityTypes: Record<AIModality, string[]> = {
    text: ["language", "text"],
    image: ["image"],
    video: ["video"],
    audio: ["audio", "speech"],
    embedding: ["embedding", "embeddings"],
    rerank: ["rerank", "reranker"],
  };
  const allowedTypes = modalityTypes[input.modality] || [input.modality];
  const compatible = models.find((model) => (
    model.sdcEnabled !== false &&
    model.tierAccess.includes(input.userTier) &&
    (allowedTypes.includes(model.type) || model.tags.includes(input.modality) || model.tags.includes(`${input.modality}-generation`))
  ));

  if (compatible) {
    return {
      providerId: modelIdToProviderId(compatible.id),
      modelId: compatible.id,
      fallbackModelIds: [],
      source: "model_registry",
      model: compatible,
      featureConfig,
    };
  }

  return {
    providerId: "vercel-ai-gateway",
    modelId: input.fallbackModelId,
    fallbackModelIds: [],
    source: "fallback",
    model: null,
    featureConfig,
  };
}
