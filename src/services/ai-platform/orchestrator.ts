import "server-only";

import { selectModel } from "@/ai/core/model-router";
import { persistOrchestrationOutcome } from "@/ai/telemetry/firestore";
import { orchestrateAIRequest as coreOrchestrateAIRequest, type AIQualityMode } from "@/ai/platform/orchestrator";
import { creatorCreditPolicies, monetizationConfig } from "./config";
import type { AIExecutionContext, CreatorPlan, ProviderMode } from "./types";
import { normalizeRoutingPlan } from "./types";
import type { AIProviderId, AIRequestTask } from "@/ai/platform/catalog";

export interface MonetizedRouteDecision {
  traceId: string;
  providerId: AIProviderId;
  modelId: string;
  providerMode: ProviderMode;
  reason: string;
  byokPreferred: boolean;
  billingEligible: boolean;
  qualityMode: AIQualityMode;
  task: AIRequestTask;
  feature: keyof typeof creatorCreditPolicies;
  fallbackCount: number;
}

export function shouldPreferByok(context: AIExecutionContext): boolean {
  const featurePolicy = creatorCreditPolicies[context.feature];
  const providerMode = context.providerMode || monetizationConfig.providerMode;
  if (!context.allowByok || !featurePolicy.byokEligible) return false;
  if (providerMode === "credits") return false;
  return providerMode === "byok" || providerMode === "hybrid";
}

export function routeMonetizedAIRequest(context: AIExecutionContext): MonetizedRouteDecision {
  const tier = normalizeRoutingPlan(context.userTier);
  const qualityMode = context.qualityMode || (tier === "elite" ? "premium" : tier === "pro" ? "balanced" : "economy");
  const providerMode = context.providerMode || monetizationConfig.providerMode;
  const byokPreferred = shouldPreferByok(context);
  const traceId = context.requestId || `orch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const basePlan = coreOrchestrateAIRequest({
    task: context.task,
    qualityMode,
    userTier: tier,
    providerPreference: context.providerPreference,
    message: context.message,
    history: context.history,
  });

  const routing = selectModel(context.message, {
    budgetMode: qualityMode === "economy" ? "strict" : qualityMode === "premium" ? "performance" : "balanced",
    userTier: tier,
    history: context.history,
  });

  void persistOrchestrationOutcome({
    traceId,
    requestId: context.requestId || traceId,
    userId: context.userId,
    task: context.task,
    feature: context.feature,
    modality: context.modality,
    providerId: basePlan.providerId,
    modelId: basePlan.modelId || routing.primaryModel,
    providerMode,
    qualityMode,
    billingSource: byokPreferred ? "byok" : "sdc_credits",
    byokPreferred,
    reason: byokPreferred
      ? `BYOK enabled for ${context.feature}`
    : basePlan.reason,
    fallbackCount: basePlan.fallbackPlans.length,
    status: "planned",
    startedAt: Date.now(),
    estimatedCostUsd: undefined,
    metadata: {
      providerPreference: context.providerPreference || null,
    },
  }).catch(() => undefined);

  return {
    traceId,
    providerId: basePlan.providerId,
    modelId: basePlan.modelId || routing.primaryModel,
    providerMode,
    reason: byokPreferred
      ? `BYOK enabled for ${context.feature}`
      : basePlan.reason,
    byokPreferred,
    billingEligible: true,
    qualityMode,
    task: context.task,
    feature: context.feature,
    fallbackCount: basePlan.fallbackPlans.length,
  };
}
