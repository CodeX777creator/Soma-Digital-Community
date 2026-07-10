import "server-only";

import { logger } from "@/lib/logger";
import {
  executeTextCompletion,
  executeImageGeneration,
  executeVideoGeneration,
  executeAudioGeneration,
  type AITextRequest,
  type AIImageRequest,
  type AIVideoRequest,
  type AIAudioRequest,
} from "@/ai/platform/service";
import { createRequestSignature, estimateCreditCost, getCreatorCreditDashboard, reserveCredits, finalizeCredits, refundCredits } from "./credits";
import { routeMonetizedAIRequest } from "./orchestrator";
import { getProviderConnection, listProviderConnections, toggleProviderConnection, upsertProviderConnection, removeProviderConnection } from "./byok";
import type { AIExecutionContext, AIExecutionLease, CreatorPlan, ProviderMode } from "./types";
import { normalizeRoutingPlan } from "./types";

function toPlan(tier: CreatorPlan | string | undefined): CreatorPlan {
  if (tier === "pro" || tier === "elite" || tier === "enterprise") return tier;
  return "explorer";
}

async function reserveForContext(context: AIExecutionContext, estimatedCostUsd: number): Promise<AIExecutionLease> {
  const plan = toPlan(context.userTier);
  const route = routeMonetizedAIRequest({
    ...context,
    userTier: normalizeRoutingPlan(context.userTier),
  });

  const credits = estimateCreditCost(plan, context.feature);
  const providerConnection = context.allowByok
    ? await getProviderConnection(context.userId, route.providerId)
    : null;
  const useByok = Boolean(
    context.allowByok &&
    route.providerMode !== "credits" &&
    providerConnection &&
    providerConnection.enabled &&
    providerConnection.verified
  );
  const lease = await reserveCredits(
    {
      ...context,
      userTier: plan,
      providerMode: context.providerMode || route.providerMode,
      requestId: context.requestId || createRequestSignature({
        userId: context.userId,
        feature: context.feature,
        task: context.task,
        message: context.message,
        modelId: route.modelId,
      }),
      metadata: {
        ...(context.metadata || {}),
        modelId: route.modelId,
        providerId: route.providerId,
        reason: route.reason,
      },
    },
    useByok ? 0 : credits,
    estimatedCostUsd,
    useByok ? "byok" : "sdc_credits"
  );

  return {
    ...lease,
    providerId: route.providerId,
    modelId: route.modelId,
    providerMode: route.providerMode,
  };
}

export async function executeMonetizedTextRequest(
  request: AITextRequest,
  context: AIExecutionContext
) {
  const estimate = request.maxOutputTokens ? request.maxOutputTokens / 1000 : 2;
  const lease = await reserveForContext(context, estimate);

  try {
    const response = await executeTextCompletion({
      ...request,
      userTier: normalizeRoutingPlan(context.userTier),
      providerPreference: lease.providerId,
      qualityMode: request.qualityMode,
    });

    await finalizeCredits(lease, {
      durationMs: response.durationMs,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      actualCostUsd: response.durationMs / 1000,
      modelId: response.plan.modelId,
      providerId: response.plan.providerId,
      status: "charged",
      metadata: {
        requestType: "text",
      },
    });

    return {
      ...response,
      billing: {
        source: lease.billingSource,
        creditsReserved: lease.creditsReserved,
        creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
        requestId: lease.requestId,
      },
    };
  } catch (error) {
    await refundCredits(lease, error instanceof Error ? error.message : String(error), {
      requestType: "text",
    });
    throw error;
  }
}

export async function executeMonetizedImageRequest(
  request: AIImageRequest,
  context: AIExecutionContext
) {
  const lease = await reserveForContext(context, 0.02);
  try {
    const response = await executeImageGeneration({
      ...request,
      userTier: context.userTier as any,
      providerPreference: lease.providerId,
    });
    await finalizeCredits(lease, {
      durationMs: response.durationMs,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      actualCostUsd: response.durationMs / 1000,
      modelId: response.plan.modelId,
      providerId: response.plan.providerId,
      status: "charged",
      metadata: { requestType: "image" },
    });
    return response;
  } catch (error) {
    await refundCredits(lease, error instanceof Error ? error.message : String(error), { requestType: "image" });
    throw error;
  }
}

export async function executeMonetizedVideoRequest(
  request: AIVideoRequest,
  context: AIExecutionContext
) {
  const lease = await reserveForContext(context, 0.2);
  try {
    const response = await executeVideoGeneration({
      ...request,
      userTier: context.userTier as any,
      providerPreference: lease.providerId,
    });
    await finalizeCredits(lease, {
      durationMs: response.durationMs,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      actualCostUsd: response.durationMs / 1000,
      modelId: response.plan.modelId,
      providerId: response.plan.providerId,
      status: "charged",
      metadata: { requestType: "video" },
    });
    return response;
  } catch (error) {
    await refundCredits(lease, error instanceof Error ? error.message : String(error), { requestType: "video" });
    throw error;
  }
}

export async function executeMonetizedAudioRequest(
  request: AIAudioRequest,
  context: AIExecutionContext
) {
  const lease = await reserveForContext(context, 0.05);
  try {
    const response = await executeAudioGeneration({
      ...request,
      userTier: context.userTier as any,
      providerPreference: lease.providerId,
    });
    await finalizeCredits(lease, {
      durationMs: response.durationMs,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      actualCostUsd: response.durationMs / 1000,
      modelId: response.plan.modelId,
      providerId: response.plan.providerId,
      status: "charged",
      metadata: { requestType: "audio" },
    });
    return response;
  } catch (error) {
    await refundCredits(lease, error instanceof Error ? error.message : String(error), { requestType: "audio" });
    throw error;
  }
}

export async function getMonetizationDashboard(userId: string, plan: CreatorPlan, providerMode: ProviderMode) {
  return getCreatorCreditDashboard(userId, plan, providerMode);
}

export const aiGatewayService = {
  text: executeMonetizedTextRequest,
  image: executeMonetizedImageRequest,
  video: executeMonetizedVideoRequest,
  audio: executeMonetizedAudioRequest,
  byok: {
    listProviderConnections,
    getProviderConnection,
    upsertProviderConnection,
    toggleProviderConnection,
    removeProviderConnection,
  },
  dashboard: getMonetizationDashboard,
};
