export { CREATOR_CREDIT_RETAIL_VALUE_USD as CREATOR_CREDIT_USD_VALUE } from "@/lib/creator-credit-config";

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
  return durationSeconds * (input.creditsPerSecond || 2);
}

export function formatCreatorCreditEstimate(credits: number): string {
  return `${Math.max(0, Math.ceil(credits)).toLocaleString()} Creator Credits`;
}

export function formatCreditFormula(credits: number, unit: string): string {
  return `${Math.max(0, Math.ceil(credits)).toLocaleString()} credits ${unit}`;
}
