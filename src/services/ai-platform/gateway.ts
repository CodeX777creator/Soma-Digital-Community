import "server-only";

import { logger } from "@/lib/logger";
import {
  executeTextCompletion,
  createTextStream,
  executeImageGeneration,
  executeVideoGeneration,
  executeAudioGeneration,
  type AITextRequest,
  type AIImageRequest,
  type AIVideoRequest,
  type AIAudioRequest,
} from "@/ai/platform/service";
import type { StreamChunk } from "@/ai/core/streaming-handler";
import { createRequestSignature, estimateCreditCost, getCreatorCreditDashboard, reserveCredits, finalizeCredits, refundCredits } from "./credits";
import { routeMonetizedAIRequest } from "./orchestrator";
import { getProviderConnection, listProviderConnections, toggleProviderConnection, upsertProviderConnection, removeProviderConnection } from "./byok";
import type { AIExecutionContext, AIExecutionLease, CreatorPlan, ProviderMode } from "./types";
import { normalizeRoutingPlan } from "./types";
import { persistOrchestrationOutcome, recordProviderMetric } from "@/ai/telemetry/firestore";

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

  const creditOverride = typeof context.metadata?.creditOverride === "number" && Number.isFinite(context.metadata.creditOverride)
    ? Math.max(0, Math.floor(context.metadata.creditOverride))
    : null;
  const credits = creditOverride ?? await estimateCreditCost(plan, context.feature);
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
    qualityMode: route.qualityMode,
    traceId: route.traceId,
    fallbackCount: route.fallbackCount,
    reason: route.reason,
  };
}

async function recordOutcome(input: {
  lease: AIExecutionLease;
  status: "succeeded" | "failed";
  durationMs: number;
  requestType: "text" | "image" | "video" | "audio";
  responsePlanProviderId: string;
  responsePlanModelId: string;
  actualCostUsd: number;
  creditsCharged: number;
  creditsRefunded: number;
  errorMessage?: string;
}): Promise<void> {
  const { lease } = input;

  await recordProviderMetric({
    traceId: lease.traceId,
    requestId: lease.requestId,
    userId: lease.userId,
    providerId: input.responsePlanProviderId,
    modelId: input.responsePlanModelId,
    task: lease.task,
    modality: lease.modality,
    providerMode: lease.providerMode,
    qualityMode: lease.qualityMode || "balanced",
    billingSource: lease.billingSource,
    byokPreferred: lease.billingSource === "byok",
    status: input.status,
    fallbackCount: lease.fallbackCount || 0,
    durationMs: input.durationMs,
    creditsReserved: lease.creditsReserved,
    creditsCharged: input.creditsCharged,
    creditsRefunded: input.creditsRefunded,
    actualCostUsd: input.actualCostUsd,
    reason: lease.reason,
    completedAt: Date.now(),
  });

  await persistOrchestrationOutcome({
    traceId: lease.traceId,
    requestId: lease.requestId,
    userId: lease.userId,
    task: lease.task,
    feature: lease.feature,
    modality: lease.modality,
    providerId: input.responsePlanProviderId,
    modelId: input.responsePlanModelId,
    providerMode: lease.providerMode,
    qualityMode: lease.qualityMode || "balanced",
    billingSource: lease.billingSource,
    byokPreferred: lease.billingSource === "byok",
    reason: lease.reason || input.errorMessage || input.status,
    fallbackCount: lease.fallbackCount || 0,
    status: input.status,
    startedAt: Date.now() - input.durationMs,
    completedAt: Date.now(),
    durationMs: input.durationMs,
    estimatedCostUsd: lease.estimatedCostUsd,
    actualCostUsd: input.actualCostUsd,
    creditsReserved: lease.creditsReserved,
    creditsCharged: input.creditsCharged,
    creditsRefunded: input.creditsRefunded,
    errorMessage: input.errorMessage,
    metadata: {
      requestType: input.requestType,
    },
  });
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
    await recordOutcome({
      lease,
      status: "succeeded",
      durationMs: response.durationMs,
      requestType: "text",
      responsePlanProviderId: response.plan.providerId,
      responsePlanModelId: response.plan.modelId,
      actualCostUsd: response.durationMs / 1000,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      creditsRefunded: 0,
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
    await recordOutcome({
      lease,
      status: "failed",
      durationMs: 0,
      requestType: "text",
      responsePlanProviderId: lease.providerId,
      responsePlanModelId: lease.modelId,
      actualCostUsd: 0,
      creditsCharged: 0,
      creditsRefunded: lease.creditsReserved,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function* executeMonetizedTextStream(
  request: AITextRequest,
  context: AIExecutionContext
): AsyncGenerator<StreamChunk> {
  const startedAt = Date.now();
  const estimate = request.maxOutputTokens ? request.maxOutputTokens / 1000 : 2;
  const lease = await reserveForContext(context, estimate);
  let providerId = lease.providerId;
  let modelId = lease.modelId;
  let finishReason = "";
  let completed = false;

  try {
    const stream = await createTextStream({
      ...request,
      userTier: normalizeRoutingPlan(context.userTier),
      providerPreference: lease.providerId,
      qualityMode: request.qualityMode,
    });

    for await (const chunk of stream as AsyncIterable<any>) {
      if (chunk.model) {
        modelId = chunk.model;
      }

      const choice = chunk.choices?.[0];
      const content = choice?.delta?.content || "";
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }

      if (content) {
        yield {
          id: lease.requestId,
          content,
          isComplete: false,
          metadata: {
            model: modelId,
          },
        };
      }
    }

    const durationMs = Date.now() - startedAt;
    await finalizeCredits(lease, {
      durationMs,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      actualCostUsd: durationMs / 1000,
      modelId,
      providerId,
      status: "charged",
      metadata: {
        requestType: "text_stream",
        finishReason: finishReason || "stop",
      },
    });
    await recordOutcome({
      lease,
      status: "succeeded",
      durationMs,
      requestType: "text",
      responsePlanProviderId: providerId,
      responsePlanModelId: modelId,
      actualCostUsd: durationMs / 1000,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      creditsRefunded: 0,
    });
    completed = true;

    yield {
      id: lease.requestId,
      content: "",
      isComplete: true,
      metadata: {
        model: modelId,
        finishReason: finishReason || "stop",
      },
    };
  } catch (error) {
    if (!completed) {
      await refundCredits(lease, error instanceof Error ? error.message : String(error), {
        requestType: "text_stream",
      });
      await recordOutcome({
        lease,
        status: "failed",
        durationMs: Date.now() - startedAt,
        requestType: "text",
        responsePlanProviderId: providerId,
        responsePlanModelId: modelId,
        actualCostUsd: 0,
        creditsCharged: 0,
        creditsRefunded: lease.creditsReserved,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
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
    await recordOutcome({
      lease,
      status: "succeeded",
      durationMs: response.durationMs,
      requestType: "image",
      responsePlanProviderId: response.plan.providerId,
      responsePlanModelId: response.plan.modelId,
      actualCostUsd: response.durationMs / 1000,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      creditsRefunded: 0,
    });
    return response;
  } catch (error) {
    await refundCredits(lease, error instanceof Error ? error.message : String(error), { requestType: "image" });
    await recordOutcome({
      lease,
      status: "failed",
      durationMs: 0,
      requestType: "image",
      responsePlanProviderId: lease.providerId,
      responsePlanModelId: lease.modelId,
      actualCostUsd: 0,
      creditsCharged: 0,
      creditsRefunded: lease.creditsReserved,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
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
    await recordOutcome({
      lease,
      status: "succeeded",
      durationMs: response.durationMs,
      requestType: "video",
      responsePlanProviderId: response.plan.providerId,
      responsePlanModelId: response.plan.modelId,
      actualCostUsd: response.durationMs / 1000,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      creditsRefunded: 0,
    });
    return response;
  } catch (error) {
    await refundCredits(lease, error instanceof Error ? error.message : String(error), { requestType: "video" });
    await recordOutcome({
      lease,
      status: "failed",
      durationMs: 0,
      requestType: "video",
      responsePlanProviderId: lease.providerId,
      responsePlanModelId: lease.modelId,
      actualCostUsd: 0,
      creditsCharged: 0,
      creditsRefunded: lease.creditsReserved,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function recordMonetizedUsageCharge(
  context: AIExecutionContext,
  input: {
    requestType: "text" | "image" | "video" | "audio";
    estimatedCostUsd: number;
    actualCostUsd?: number;
    durationMs?: number;
    modelId?: string;
    providerId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const lease = await reserveForContext(context, input.estimatedCostUsd);
  const durationMs = input.durationMs ?? 0;
  const providerId = input.providerId || lease.providerId;
  const modelId = input.modelId || lease.modelId;

  await finalizeCredits(lease, {
    durationMs,
    creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
    actualCostUsd: input.actualCostUsd ?? input.estimatedCostUsd,
    modelId,
    providerId,
    status: "charged",
    metadata: {
      requestType: input.requestType,
      ...input.metadata,
    },
  });

  await recordOutcome({
    lease,
    status: "succeeded",
    durationMs,
    requestType: input.requestType,
    responsePlanProviderId: providerId,
    responsePlanModelId: modelId,
    actualCostUsd: input.actualCostUsd ?? input.estimatedCostUsd,
    creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
    creditsRefunded: 0,
  });

  return {
    billing: {
      creditsReserved: lease.creditsReserved,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      creditsRefunded: 0,
      billingSource: lease.billingSource,
    },
  };
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
    await recordOutcome({
      lease,
      status: "succeeded",
      durationMs: response.durationMs,
      requestType: "audio",
      responsePlanProviderId: response.plan.providerId,
      responsePlanModelId: response.plan.modelId,
      actualCostUsd: response.durationMs / 1000,
      creditsCharged: lease.billingSource === "byok" ? 0 : lease.creditsReserved,
      creditsRefunded: 0,
    });
    return response;
  } catch (error) {
    await refundCredits(lease, error instanceof Error ? error.message : String(error), { requestType: "audio" });
    await recordOutcome({
      lease,
      status: "failed",
      durationMs: 0,
      requestType: "audio",
      responsePlanProviderId: lease.providerId,
      responsePlanModelId: lease.modelId,
      actualCostUsd: 0,
      creditsCharged: 0,
      creditsRefunded: lease.creditsReserved,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
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
