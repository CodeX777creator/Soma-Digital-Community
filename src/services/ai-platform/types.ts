import type { AIProviderId, AIRequestTask, AIModality } from "@/ai/platform/catalog";
import type { AIQualityMode } from "@/ai/platform/orchestrator";

export type CreatorPlan = "explorer" | "pro" | "elite" | "enterprise";
export type LegacyCreatorTier = CreatorPlan | "free";
export type RoutingCreatorPlan = "explorer" | "pro" | "elite";
export type BillingSource = "sdc_credits" | "byok";
export type CreditStatus = "reserved" | "charged" | "refunded" | "failed" | "skipped";
export type ProviderMode = "credits" | "byok" | "hybrid";

export type MonetizedFeature =
  | "mentor_chat"
  | "business_coach"
  | "ai_chat"
  | "content_generation"
  | "prompt_library"
  | "image_generation"
  | "video_generation"
  | "voice_generation"
  | "translation"
  | "document_generation"
  | "business_planner"
  | "social_media_generator"
  | "sales_coach"
  | "funnel_builder"
  | "calendar_generation";

export interface CreatorCreditPolicy {
  feature: MonetizedFeature;
  baseCredits: number;
  monthlyLimit?: number;
  concurrentLimit?: number;
  dailyLimit?: number;
  byokEligible?: boolean;
}

export interface PlanCreditProfile {
  monthlyCreatorCredits: number;
  priorityRouting: boolean;
  concurrentJobLimit: number;
  dailySpendingLimit: number;
  monthlyEstimatedAIExpenseCap: number;
  featureOverrides?: Partial<Record<MonetizedFeature, number>>;
}

export interface ProviderConnectionStatus {
  providerId: AIProviderId;
  enabled: boolean;
  verified: boolean;
  defaultModel?: string;
  lastTestedAt?: string | null;
  lastError?: string | null;
  mode: ProviderMode;
}

export interface SafeProviderConnection {
  providerId: AIProviderId;
  enabled: boolean;
  verified: boolean;
  defaultModel?: string;
  mode: ProviderMode;
  lastTestedAt?: string | null;
  lastError?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EncryptedProviderSecret {
  algorithm: "aes-256-gcm";
  keyVersion: "v1";
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface StoredProviderSecret {
  providerId: AIProviderId;
  secret: EncryptedProviderSecret;
  updatedAt?: unknown;
}

export interface CreatorCreditSnapshot {
  userId: string;
  plan: CreatorPlan;
  periodId: string;
  monthlyCreditsGranted: number;
  monthlyCreditsUsed: number;
  monthlyCreditsReserved: number;
  purchasedCreditsGranted: number;
  purchasedCreditsRemaining: number;
  remainingCredits: number;
  byokEnabled: boolean;
  providerMode: ProviderMode;
  resetAt: string;
  nextResetAt: string;
  activeFeatureCounts: Partial<Record<MonetizedFeature, number>>;
  lastUpdatedAt?: string | null;
}

export interface CreditLedgerEntry {
  entryId: string;
  userId: string;
  periodId: string;
  timestamp: string;
  task: AIRequestTask;
  modality: AIModality;
  feature: MonetizedFeature;
  providerId: AIProviderId;
  modelId: string;
  billingSource: BillingSource;
  creditsReserved: number;
  includedCreditsReserved?: number;
  purchasedCreditsReserved?: number;
  creditsCharged: number;
  creditsRefunded: number;
  durationMs: number;
  status: CreditStatus;
  requestId: string;
  reason?: string;
  providerMode: ProviderMode;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  pricingUnit?: "token" | "image" | "second" | "character" | "flat";
  estimatedUnits?: number;
  actualUnits?: number;
  unitRateCredits?: number;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  durationSeconds?: number;
  characters?: number;
  modelPricingSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AIExecutionContext {
  userId: string;
  task: AIRequestTask;
  feature: MonetizedFeature;
  modality: AIModality;
  message: string;
  history?: string[];
  userTier: LegacyCreatorTier;
  qualityMode?: AIQualityMode;
  providerPreference?: AIProviderId;
  providerMode?: ProviderMode;
  allowByok?: boolean;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface AIExecutionLease {
  traceId: string;
  leaseId: string;
  requestId: string;
  userId: string;
  feature: MonetizedFeature;
  task: AIRequestTask;
  modality: AIModality;
  providerId: AIProviderId;
  modelId: string;
  billingSource: BillingSource;
  creditsReserved: number;
  includedCreditsReserved?: number;
  purchasedCreditsReserved?: number;
  estimatedCostUsd: number;
  providerMode: ProviderMode;
  qualityMode?: AIQualityMode;
  periodId: string;
  fallbackCount?: number;
  reason?: string;
}

export function normalizeBillingPlan(tier?: LegacyCreatorTier): CreatorPlan {
  if (tier === "pro" || tier === "elite" || tier === "enterprise") return tier;
  return "explorer";
}

export function normalizeRoutingPlan(tier?: LegacyCreatorTier): RoutingCreatorPlan {
  if (tier === "elite") return "elite";
  if (tier === "pro") return "pro";
  return "explorer";
}
