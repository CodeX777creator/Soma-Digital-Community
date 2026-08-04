import { CREATOR_CREDIT_RETAIL_VALUE_USD, DEFAULT_PLATFORM_FEATURE_PRICING } from "@/lib/creator-credit-config";

export { CREATOR_CREDIT_RETAIL_VALUE_USD as CREATOR_CREDIT_USD_VALUE };

export function estimateTextCreatorCredits(input: {
  inputTokens?: number;
  outputTokens?: number;
  reasoning?: boolean;
}): number {
  const inputTokens = Math.max(0, Math.ceil(input.inputTokens || 1000));
  const outputTokens = Math.max(1, Math.ceil(input.outputTokens || 1600));
  const inputRate = DEFAULT_PLATFORM_FEATURE_PRICING.chat.inputCost || 0.25;
  const outputRate = input.reasoning ? 3 : (DEFAULT_PLATFORM_FEATURE_PRICING.chat.outputCost || 1);
  return Math.max(1, Math.ceil((inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate));
}

export function estimateImageCreatorCredits(imageCount = 1, premium = false): number {
  return Math.max(1, Math.ceil(Math.max(1, imageCount) * (premium ? 20 : 10)));
}

export function estimateVideoCreatorCredits(input: {
  mode: "draft" | "render";
  durationSeconds?: number;
  creditsPerSecond?: number;
}): number {
  if (input.mode === "draft") return 20;
  const durationSeconds = Math.max(1, Math.floor(input.durationSeconds || 30));
  return durationSeconds * (input.creditsPerSecond || 10);
}

export function estimateAudioCreatorCredits(input: {
  durationSeconds?: number;
  creditsPerSecond?: number;
}): number {
  const durationSeconds = Math.max(1, Math.floor(input.durationSeconds || 30));
  return durationSeconds * (input.creditsPerSecond || DEFAULT_PLATFORM_FEATURE_PRICING.audio_generation.baseCost || 2);
}

export function formatCreatorCreditEstimate(credits: number): string {
  return `${Math.max(0, Math.ceil(credits)).toLocaleString()} Creator Credits`;
}

export function formatCreditFormula(credits: number, unit: string): string {
  return `${Math.max(0, Math.ceil(credits)).toLocaleString()} credits ${unit}`;
}
