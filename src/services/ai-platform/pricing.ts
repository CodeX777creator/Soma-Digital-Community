import { estimateTokenCount } from "@/ai/core/tokenizer";
import {
  CREATOR_CREDIT_RETAIL_VALUE_USD as CREATOR_CREDIT_RETAIL_VALUE_USD_FROM_CONFIG,
  DEFAULT_PLATFORM_FEATURE_PRICING,
} from "@/lib/creator-credit-config";
import type { AIModelRegistryDoc } from "./model-registry";
import type { MonetizedFeature } from "./types";

export type AIPricingUnit =
  | "token"
  | "image"
  | "second"
  | "character"
  | "flat";

export interface UsagePricingInput {
  feature: MonetizedFeature;
  modality: "text" | "image" | "video" | "audio";
  model?: AIModelRegistryDoc | null;
  prompt?: string;
  maxOutputTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  durationSeconds?: number;
  characters?: number;
  generationMode?: "draft" | "render";
}

export interface UsagePricingQuote {
  credits: number;
  pricingUnit: AIPricingUnit;
  estimatedUnits: number;
  unitRateCredits: number;
  estimatedCostUsd: number;
  retailValueUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  durationSeconds?: number;
  characters?: number;
  modelPricingSnapshot?: Record<string, unknown>;
  explanation: string;
}

export const CREATOR_CREDIT_RETAIL_VALUE_USD = CREATOR_CREDIT_RETAIL_VALUE_USD_FROM_CONFIG;

const DEFAULT_TEXT_INPUT_CREDITS_PER_1K = DEFAULT_PLATFORM_FEATURE_PRICING.chat.inputCost || 0.25;
const DEFAULT_TEXT_OUTPUT_CREDITS_PER_1K = DEFAULT_PLATFORM_FEATURE_PRICING.chat.outputCost || 1;
const DEFAULT_REASONING_OUTPUT_CREDITS_PER_1K = 3;
const DEFAULT_IMAGE_CREDITS = DEFAULT_PLATFORM_FEATURE_PRICING.image_generation.baseCost || 10;
const DEFAULT_PREMIUM_IMAGE_CREDITS = DEFAULT_IMAGE_CREDITS * 2;
const DEFAULT_VIDEO_DRAFT_CREDITS = 20;
const DEFAULT_VIDEO_RENDER_CREDITS_PER_SECOND = DEFAULT_PLATFORM_FEATURE_PRICING.video_generation.baseCost || 10;
const DEFAULT_AUDIO_CREDITS_PER_SECOND = DEFAULT_PLATFORM_FEATURE_PRICING.audio_generation.baseCost || 2;
const DEFAULT_AUDIO_CREDITS_PER_1K_CHARS = 4;

function roundCredits(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(1, Math.ceil(value));
}

function dollarsToCredits(value: number, multiplier = 1): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value * multiplier / CREATOR_CREDIT_RETAIL_VALUE_USD;
}

function modelMultiplier(model?: AIModelRegistryDoc | null): number {
  return typeof model?.creditMultiplier === "number" && model.creditMultiplier > 0 ? model.creditMultiplier : 1;
}

function isReasoningModel(model?: AIModelRegistryDoc | null): boolean {
  const tags = Array.isArray(model?.tags) ? model.tags : [];
  return tags.includes("reasoning") || tags.includes("thinking") || model?.creditClass === "premium" || model?.creditClass === "specialized";
}

function modelPricingSnapshot(model?: AIModelRegistryDoc | null): Record<string, unknown> | undefined {
  if (!model) return undefined;
  return {
    modelId: model.id,
    provider: model.provider,
    type: model.type,
    tags: model.tags,
    creditClass: model.creditClass,
    creditMultiplier: model.creditMultiplier,
    pricing: model.pricing,
  };
}

function quote(input: Omit<UsagePricingQuote, "retailValueUsd">): UsagePricingQuote {
  return {
    ...input,
    credits: roundCredits(input.credits),
    retailValueUsd: roundCredits(input.credits) * CREATOR_CREDIT_RETAIL_VALUE_USD,
  };
}

function estimateFeatureSpecificCredits(input: UsagePricingInput): UsagePricingQuote | null {
  if (input.feature === "translation" && input.modality === "text") {
    const characters = Math.max(1, Math.floor(input.characters || (input.prompt || "").length));
    const unitRate = (DEFAULT_PLATFORM_FEATURE_PRICING.translation.baseCost || 0.05) * modelMultiplier(input.model);
    return quote({
      credits: characters * unitRate,
      pricingUnit: "character",
      estimatedUnits: characters,
      unitRateCredits: unitRate,
      estimatedCostUsd: 0,
      characters,
      modelPricingSnapshot: modelPricingSnapshot(input.model),
      explanation: `${characters.toLocaleString()} characters translated at ${roundCredits(unitRate)} credits per character.`,
    });
  }

  if (input.feature === "speech_to_text") {
    const durationSeconds = Math.max(1, Math.floor(input.durationSeconds || 30));
    const unitRate = (DEFAULT_PLATFORM_FEATURE_PRICING.speech_to_text.baseCost || 0.2) * modelMultiplier(input.model);
    return quote({
      credits: durationSeconds * unitRate,
      pricingUnit: "second",
      estimatedUnits: durationSeconds,
      unitRateCredits: unitRate,
      estimatedCostUsd: 0,
      durationSeconds,
      modelPricingSnapshot: modelPricingSnapshot(input.model),
      explanation: `${durationSeconds}s speech transcription at ${roundCredits(unitRate)} credits/sec.`,
    });
  }

  return null;
}

export function estimateTextCredits(input: UsagePricingInput): UsagePricingQuote {
  const estimatedInputTokens = input.inputTokens ?? estimateTokenCount(input.prompt || "");
  const estimatedOutputTokens = input.outputTokens ?? input.maxOutputTokens ?? 1200;
  const multiplier = modelMultiplier(input.model);
  const outputRate = isReasoningModel(input.model)
    ? DEFAULT_REASONING_OUTPUT_CREDITS_PER_1K
    : DEFAULT_TEXT_OUTPUT_CREDITS_PER_1K;
  const inputCredits = estimatedInputTokens / 1000 * DEFAULT_TEXT_INPUT_CREDITS_PER_1K * multiplier;
  const outputCredits = estimatedOutputTokens / 1000 * outputRate * multiplier;

  return quote({
    credits: inputCredits + outputCredits,
    pricingUnit: "token",
    estimatedUnits: estimatedInputTokens + estimatedOutputTokens,
    unitRateCredits: outputRate,
    estimatedCostUsd: 0,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    modelPricingSnapshot: modelPricingSnapshot(input.model),
    explanation: `Estimated from ${estimatedInputTokens} input tokens and ${estimatedOutputTokens} output tokens.`,
  });
}

export function estimateImageCredits(input: UsagePricingInput): UsagePricingQuote {
  const imageCount = Math.max(1, Math.floor(input.imageCount || 1));
  const multiplier = modelMultiplier(input.model);
  const modelUsd = input.model?.pricing?.image;
  const baseCredits = typeof modelUsd === "number" && modelUsd > 0
    ? dollarsToCredits(modelUsd, multiplier)
    : input.model?.creditClass === "premium" || input.model?.creditClass === "specialized"
      ? DEFAULT_PREMIUM_IMAGE_CREDITS
      : DEFAULT_IMAGE_CREDITS;

  return quote({
    credits: baseCredits * imageCount,
    pricingUnit: "image",
    estimatedUnits: imageCount,
    unitRateCredits: baseCredits,
    estimatedCostUsd: typeof modelUsd === "number" ? modelUsd * imageCount : 0,
    imageCount,
    modelPricingSnapshot: modelPricingSnapshot(input.model),
    explanation: `${imageCount} image${imageCount === 1 ? "" : "s"} at ${roundCredits(baseCredits)} credits each.`,
  });
}

export function estimateVideoCredits(input: UsagePricingInput): UsagePricingQuote {
  if (input.generationMode === "draft") {
    return quote({
      credits: DEFAULT_VIDEO_DRAFT_CREDITS,
      pricingUnit: "flat",
      estimatedUnits: 1,
      unitRateCredits: DEFAULT_VIDEO_DRAFT_CREDITS,
      estimatedCostUsd: 0,
      modelPricingSnapshot: modelPricingSnapshot(input.model),
      explanation: "Video draft includes script, scenes, captions, and thumbnail direction.",
    });
  }

  const durationSeconds = Math.max(1, Math.floor(input.durationSeconds || 10));
  const multiplier = modelMultiplier(input.model);
  const modelUsdPerSecond = input.model?.pricing?.video;
  const rate = typeof modelUsdPerSecond === "number" && modelUsdPerSecond > 0
    ? dollarsToCredits(modelUsdPerSecond, multiplier)
    : DEFAULT_VIDEO_RENDER_CREDITS_PER_SECOND * multiplier;

  return quote({
    credits: rate * durationSeconds,
    pricingUnit: "second",
    estimatedUnits: durationSeconds,
    unitRateCredits: rate,
    estimatedCostUsd: typeof modelUsdPerSecond === "number" ? modelUsdPerSecond * durationSeconds : 0,
    durationSeconds,
    modelPricingSnapshot: modelPricingSnapshot(input.model),
    explanation: `${durationSeconds}s full video render at ${roundCredits(rate)} credits/sec.`,
  });
}

export function estimateAudioCredits(input: UsagePricingInput): UsagePricingQuote {
  const durationSeconds = Math.max(1, Math.floor(input.durationSeconds || Math.ceil((input.characters || 0) / 14) || 30));
  const characters = Math.max(0, Math.floor(input.characters || (input.prompt || "").length));
  const multiplier = modelMultiplier(input.model);
  const modelUsdPerSecond = input.model?.pricing?.audio;

  if (typeof modelUsdPerSecond === "number" && modelUsdPerSecond > 0) {
    const rate = dollarsToCredits(modelUsdPerSecond, multiplier);
    return quote({
      credits: rate * durationSeconds,
      pricingUnit: "second",
      estimatedUnits: durationSeconds,
      unitRateCredits: rate,
      estimatedCostUsd: modelUsdPerSecond * durationSeconds,
      durationSeconds,
      characters,
      modelPricingSnapshot: modelPricingSnapshot(input.model),
      explanation: `${durationSeconds}s audio render at ${roundCredits(rate)} credits/sec.`,
    });
  }

  const characterCredits = characters > 0 ? characters / 1000 * DEFAULT_AUDIO_CREDITS_PER_1K_CHARS * multiplier : 0;
  const secondCredits = durationSeconds * DEFAULT_AUDIO_CREDITS_PER_SECOND * multiplier;
  const credits = Math.max(characterCredits, secondCredits);
  return quote({
    credits,
    pricingUnit: "second",
    estimatedUnits: durationSeconds,
    unitRateCredits: DEFAULT_AUDIO_CREDITS_PER_SECOND * multiplier,
    estimatedCostUsd: 0,
    durationSeconds,
    characters,
    modelPricingSnapshot: modelPricingSnapshot(input.model),
    explanation: `${durationSeconds}s audio estimate with character safety check.`,
  });
}

export function estimateUsageCredits(input: UsagePricingInput): UsagePricingQuote {
  const featureSpecificQuote = estimateFeatureSpecificCredits(input);
  if (featureSpecificQuote) return featureSpecificQuote;
  switch (input.modality) {
    case "image":
      return estimateImageCredits(input);
    case "video":
      return estimateVideoCredits(input);
    case "audio":
      return estimateAudioCredits(input);
    case "text":
    default:
      return estimateTextCredits(input);
  }
}
