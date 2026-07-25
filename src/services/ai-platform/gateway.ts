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
import { estimateUsageCredits, type UsagePricingQuote } from "./pricing";
import { getAIModel } from "./model-registry";
import { getProviderConnection, listProviderConnections, toggleProviderConnection, upsertProviderConnection, removeProviderConnection } from "./byok";
import type { AIExecutionContext, AIExecutionLease, CreatorPlan, ProviderMode } from "./types";
import { normalizeRoutingPlan } from "./types";
import { persistOrchestrationOutcome, recordProviderMetric } from "@/ai/telemetry/firestore";

function toPlan(tier: CreatorPlan | string | undefined): CreatorPlan {
  if (tier === "pro" || tier === "elite" || tier === "enterprise") return tier;
  return "explorer";
}

async function reserveForContext(context: AIExecutionContext, estimatedCostUsd: number, pricingQuote?: UsagePricingQuote): Promise<AIExecutionLease> {
  const plan = toPlan(context.userTier);
  const route = await routeMonetizedAIRequest({
    ...context,
    userTier: normalizeRoutingPlan(context.userTier),
  });

  const creditOverride = context.metadata?.pricingMode === "fixed"
    && typeof context.metadata?.creditOverride === "number"
    && Number.isFinite(context.metadata.creditOverride)
    ? Math.max(0, Math.floor(context.metadata.creditOverride))
    : null;
  const credits = creditOverride ?? pricingQuote?.credits ?? await estimateCreditCost(plan, context.feature);
  const isOnboardingAllowance = context.metadata?.billingSource === "onboarding_allowance";
  const providerConnection = context.allowByok && !isOnboardingAllowance
    ? await getProviderConnection(context.userId, route.providerId)
    : null;
  const useByok = Boolean(
    context.allowByok &&
    route.providerMode !== "credits" &&
    providerConnection &&
    providerConnection.enabled &&
    providerConnection.verified
  );
  const billingSource = isOnboardingAllowance
    ? "onboarding_allowance"
    : useByok
      ? "byok"
      : "sdc_credits";
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
        ...(pricingQuote ? {
          pricingUnit: pricingQuote.pricingUnit,
          estimatedUnits: pricingQuote.estimatedUnits,
          unitRateCredits: pricingQuote.unitRateCredits,
          inputTokens: pricingQuote.inputTokens,
          outputTokens: pricingQuote.outputTokens,
          imageCount: pricingQuote.imageCount,
          durationSeconds: pricingQuote.durationSeconds,
          characters: pricingQuote.characters,
          modelPricingSnapshot: pricingQuote.modelPricingSnapshot,
          pricingExplanation: pricingQuote.explanation,
        } : {}),
      },
    },
    billingSource === "sdc_credits" ? credits : 0,
    estimatedCostUsd,
    billingSource
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

function pricingMetadata(pricingQuote?: UsagePricingQuote): Record<string, unknown> {
  if (!pricingQuote) return {};
  return {
    pricingUnit: pricingQuote.pricingUnit,
    estimatedUnits: pricingQuote.estimatedUnits,
    unitRateCredits: pricingQuote.unitRateCredits,
    inputTokens: pricingQuote.inputTokens,
    outputTokens: pricingQuote.outputTokens,
    imageCount: pricingQuote.imageCount,
    durationSeconds: pricingQuote.durationSeconds,
    characters: pricingQuote.characters,
    modelPricingSnapshot: pricingQuote.modelPricingSnapshot,
    pricingExplanation: pricingQuote.explanation,
    retailValueUsd: pricingQuote.retailValueUsd,
  };
}

export async function executeMonetizedTextRequest(
  request: AITextRequest,
  context: AIExecutionContext
) {
  const estimate = request.maxOutputTokens ? request.maxOutputTokens / 1000 : 2;
  const plannedRoute = await routeMonetizedAIRequest({
    ...context,
    userTier: normalizeRoutingPlan(context.userTier),
  });
  const model = await getAIModel(plannedRoute.modelId).catch(() => null);
  const prompt = request.messages.map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n");
  const pricingQuote = estimateUsageCredits({
    feature: context.feature,
    modality: "text",
    model,
    prompt,
    maxOutputTokens: request.maxOutputTokens,
  });
  const lease = await reserveForContext({
    ...context,
    providerPreference: plannedRoute.providerId,
    metadata: {
      ...(context.metadata || {}),
      modelId: plannedRoute.modelId,
      providerId: plannedRoute.providerId,
    },
  }, estimate, pricingQuote);

  try {
    const response = await executeTextCompletion({
      ...request,
      userTier: normalizeRoutingPlan(context.userTier),
      providerPreference: lease.providerId,
      modelId: lease.modelId,
      qualityMode: request.qualityMode,
    });
    const actualPricingQuote = estimateUsageCredits({
      feature: context.feature,
      modality: "text",
      model,
      prompt,
      inputTokens: response.usage?.inputTokens || pricingQuote.inputTokens,
      outputTokens: response.usage?.outputTokens,
      maxOutputTokens: response.usage?.outputTokens || pricingQuote.outputTokens,
    });
    const creditsCharged = lease.billingSource === "sdc_credits"
      ? Math.min(lease.creditsReserved, actualPricingQuote.credits)
      : 0;

    await finalizeCredits(lease, {
      durationMs: response.durationMs,
      creditsCharged,
      actualCostUsd: response.durationMs / 1000,
      modelId: response.plan.modelId,
      providerId: response.plan.providerId,
      status: "charged",
      metadata: {
        requestType: "text",
        ...pricingMetadata(actualPricingQuote),
        reservedPricing: pricingMetadata(pricingQuote),
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
      creditsCharged,
      creditsRefunded: Math.max(0, lease.creditsReserved - creditsCharged),
    });

    return {
      ...response,
      billing: {
        source: lease.billingSource,
        creditsReserved: lease.creditsReserved,
        creditsCharged,
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
  const plannedRoute = await routeMonetizedAIRequest({
    ...context,
    userTier: normalizeRoutingPlan(context.userTier),
  });
  const model = await getAIModel(plannedRoute.modelId).catch(() => null);
  const prompt = request.messages.map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n");
  const pricingQuote = estimateUsageCredits({
    feature: context.feature,
    modality: "text",
    model,
    prompt,
    maxOutputTokens: request.maxOutputTokens,
  });
  const lease = await reserveForContext({
    ...context,
    providerPreference: plannedRoute.providerId,
    metadata: {
      ...(context.metadata || {}),
      modelId: plannedRoute.modelId,
      providerId: plannedRoute.providerId,
    },
  }, estimate, pricingQuote);
  let providerId = lease.providerId;
  let modelId = lease.modelId;
  let finishReason = "";
  let completed = false;

  try {
    const stream = await createTextStream({
      ...request,
      userTier: normalizeRoutingPlan(context.userTier),
      providerPreference: lease.providerId,
      modelId: lease.modelId,
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
      creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
      actualCostUsd: durationMs / 1000,
      modelId,
      providerId,
      status: "charged",
      metadata: {
        requestType: "text_stream",
        ...pricingMetadata(pricingQuote),
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
      creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
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
  const plannedRoute = await routeMonetizedAIRequest({ ...context, userTier: normalizeRoutingPlan(context.userTier) });
  const model = await getAIModel(plannedRoute.modelId).catch(() => null);
  const pricingQuote = estimateUsageCredits({
    feature: context.feature,
    modality: "image",
    model,
    prompt: request.prompt,
    imageCount: 1,
  });
  const lease = await reserveForContext({
    ...context,
    providerPreference: plannedRoute.providerId,
    metadata: { ...(context.metadata || {}), modelId: plannedRoute.modelId, providerId: plannedRoute.providerId },
  }, pricingQuote.estimatedCostUsd, pricingQuote);
  try {
    const response = await executeImageGeneration({
      ...request,
      userTier: context.userTier as any,
      providerPreference: lease.providerId,
      modelId: lease.modelId,
    });
    await finalizeCredits(lease, {
      durationMs: response.durationMs,
      creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
      actualCostUsd: response.durationMs / 1000,
      modelId: response.plan.modelId,
      providerId: response.plan.providerId,
      status: "charged",
      metadata: { requestType: "image", ...pricingMetadata(pricingQuote) },
    });
    await recordOutcome({
      lease,
      status: "succeeded",
      durationMs: response.durationMs,
      requestType: "image",
      responsePlanProviderId: response.plan.providerId,
      responsePlanModelId: response.plan.modelId,
      actualCostUsd: response.durationMs / 1000,
      creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
      creditsRefunded: 0,
    });
    return {
      ...response,
      billing: {
        source: lease.billingSource,
        creditsReserved: lease.creditsReserved,
         creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
        creditsRefunded: 0,
        requestId: lease.requestId,
        pricing: pricingMetadata(pricingQuote),
      },
    };
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
  const plannedRoute = await routeMonetizedAIRequest({ ...context, userTier: normalizeRoutingPlan(context.userTier) });
  const model = await getAIModel(plannedRoute.modelId).catch(() => null);
  const pricingQuote = estimateUsageCredits({
    feature: context.feature,
    modality: "video",
    model,
    prompt: request.prompt,
    durationSeconds: request.durationSeconds,
    generationMode: context.metadata?.generationMode === "draft" ? "draft" : "render",
  });
  const lease = await reserveForContext({
    ...context,
    providerPreference: plannedRoute.providerId,
    metadata: { ...(context.metadata || {}), modelId: plannedRoute.modelId, providerId: plannedRoute.providerId },
  }, pricingQuote.estimatedCostUsd, pricingQuote);
  try {
    const response = await executeVideoGeneration({
      ...request,
      userTier: context.userTier as any,
      providerPreference: lease.providerId,
      modelId: lease.modelId,
    });
    await finalizeCredits(lease, {
      durationMs: response.durationMs,
       creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
      actualCostUsd: response.durationMs / 1000,
      modelId: response.plan.modelId,
      providerId: response.plan.providerId,
      status: "charged",
      metadata: { requestType: "video", ...pricingMetadata(pricingQuote) },
    });
    await recordOutcome({
      lease,
      status: "succeeded",
      durationMs: response.durationMs,
      requestType: "video",
      responsePlanProviderId: response.plan.providerId,
      responsePlanModelId: response.plan.modelId,
      actualCostUsd: response.durationMs / 1000,
       creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
      creditsRefunded: 0,
    });
    return {
      ...response,
      billing: {
        source: lease.billingSource,
        creditsReserved: lease.creditsReserved,
         creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
        creditsRefunded: 0,
        requestId: lease.requestId,
        pricing: pricingMetadata(pricingQuote),
      },
    };
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
  const plannedRoute = await routeMonetizedAIRequest({ ...context, userTier: normalizeRoutingPlan(context.userTier) });
  const model = await getAIModel(input.modelId || plannedRoute.modelId).catch(() => null);
  const usageModality = context.metadata?.generationMode === "draft"
    ? "video"
    : input.requestType;
  const pricingQuote = estimateUsageCredits({
    feature: context.feature,
    modality: usageModality,
    model,
    prompt: context.message,
    durationSeconds: typeof context.metadata?.durationSeconds === "number" ? context.metadata.durationSeconds : undefined,
    characters: typeof context.metadata?.characters === "number" ? context.metadata.characters : context.message.length,
    generationMode: context.metadata?.generationMode === "draft" ? "draft" : input.requestType === "video" ? "render" : undefined,
  });
  const lease = await reserveForContext({
    ...context,
    providerPreference: plannedRoute.providerId,
    metadata: {
      ...(context.metadata || {}),
      modelId: input.modelId || plannedRoute.modelId,
      providerId: input.providerId || plannedRoute.providerId,
    },
  }, input.estimatedCostUsd, pricingQuote);
  const durationMs = input.durationMs ?? 0;
  const providerId = input.providerId || lease.providerId;
  const modelId = input.modelId || lease.modelId;

  await finalizeCredits(lease, {
    durationMs,
    creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
    actualCostUsd: input.actualCostUsd ?? input.estimatedCostUsd,
    modelId,
    providerId,
    status: "charged",
    metadata: {
      requestType: input.requestType,
      ...pricingMetadata(pricingQuote),
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
    creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
    creditsRefunded: 0,
  });

  return {
    billing: {
      creditsReserved: lease.creditsReserved,
    creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
      creditsRefunded: 0,
      billingSource: lease.billingSource,
    },
  };
}

export async function executeMonetizedAudioRequest(
  request: AIAudioRequest,
  context: AIExecutionContext
) {
  const plannedRoute = await routeMonetizedAIRequest({ ...context, userTier: normalizeRoutingPlan(context.userTier) });
  const model = await getAIModel(plannedRoute.modelId).catch(() => null);
  const pricingQuote = estimateUsageCredits({
    feature: context.feature,
    modality: "audio",
    model,
    prompt: request.prompt,
    durationSeconds: typeof context.metadata?.durationSeconds === "number" ? context.metadata.durationSeconds : undefined,
    characters: request.narrationText?.length || request.prompt.length,
  });
  const lease = await reserveForContext({
    ...context,
    providerPreference: plannedRoute.providerId,
    metadata: { ...(context.metadata || {}), modelId: plannedRoute.modelId, providerId: plannedRoute.providerId },
  }, pricingQuote.estimatedCostUsd, pricingQuote);
  try {
    const response = await executeAudioGeneration({
      ...request,
      userTier: context.userTier as any,
      providerPreference: lease.providerId,
      modelId: lease.modelId,
    });
    await finalizeCredits(lease, {
      durationMs: response.durationMs,
    creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
      actualCostUsd: response.durationMs / 1000,
      modelId: response.plan.modelId,
      providerId: response.plan.providerId,
      status: "charged",
      metadata: { requestType: "audio", ...pricingMetadata(pricingQuote) },
    });
    await recordOutcome({
      lease,
      status: "succeeded",
      durationMs: response.durationMs,
      requestType: "audio",
      responsePlanProviderId: response.plan.providerId,
      responsePlanModelId: response.plan.modelId,
      actualCostUsd: response.durationMs / 1000,
    creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
      creditsRefunded: 0,
    });
    return {
      ...response,
      billing: {
        source: lease.billingSource,
        creditsReserved: lease.creditsReserved,
    creditsCharged: lease.billingSource === "sdc_credits" ? lease.creditsReserved : 0,
        creditsRefunded: 0,
        requestId: lease.requestId,
        pricing: pricingMetadata(pricingQuote),
      },
    };
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
