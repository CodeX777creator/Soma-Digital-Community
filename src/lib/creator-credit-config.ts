export type CreatorCreditTier = "explorer" | "pro" | "elite" | "enterprise";

export type PlatformFeatureKey =
  | "chat"
  | "image_generation"
  | "video_generation"
  | "audio_generation"
  | "document_analysis"
  | "translation"
  | "vision"
  | "speech_to_text";

export type WorkflowKey =
  | "strategic_advice"
  | "roadmap_generation"
  | "summary"
  | "analysis"
  | "blog_writer"
  | "email_writer"
  | "ad_copy"
  | "sales_funnel"
  | "landing_page"
  | "social_post"
  | "product_description"
  | "course_creator"
  | "website_builder"
  | "presentation_builder"
  | "prompt_library"
  | "caption"
  | "script"
  | "carousel";

export type PricingUnit = "token" | "image" | "second" | "character" | "minute" | "request";

export interface PlatformFeaturePricing {
  unit: PricingUnit;
  baseCost: number; // For images, seconds, etc.
  inputCost?: number; // Cost per unit for inputs (e.g., per token)
  outputCost?: number; // Cost per unit for outputs
}

export interface WorkflowPolicy {
  dailyRuns: number; // 0 = unlimited, -1 = disabled
  monthlyRuns: number;
  cooldownMinutes: number;
}

// Deprecated keys preserved for backward compatibility
export type CreatorCreditFeatureKey = string;
export type CreatorCreditToolKey = string;

export type CreatorCreditBundle = {
  id: string;
  label: string;
  credits: number;
  priceCents: number;
  currency: string;
  sortOrder: number;
  active: boolean;
};

export type CreatorCreditConfig = {
  tierAllocations: Record<CreatorCreditTier, number>;
  platformFeaturePricing: Record<PlatformFeatureKey, PlatformFeaturePricing>;
  workflowPolicies: Record<WorkflowKey, WorkflowPolicy>;
  bundles: CreatorCreditBundle[];
  version: number;

  // Deprecated fields
  featurePricing?: Record<string, number>;
  toolPricing?: Record<string, number>;
};

export const CREATOR_CREDIT_RETAIL_VALUE_USD = 0.2;
export const CREATOR_CREDIT_RETAIL_VALUE_CENTS = CREATOR_CREDIT_RETAIL_VALUE_USD * 100;

export const DEFAULT_CREATOR_CREDIT_ALLOCATIONS: Record<CreatorCreditTier, number> = {
  explorer: 0,
  pro: 220,
  elite: 700,
  enterprise: 2000,
};

export const DEFAULT_CREATOR_CREDIT_BUNDLES: CreatorCreditBundle[] = [
  { id: "credits_10", label: "10 Credits", credits: 10, priceCents: 200, currency: "USD", sortOrder: 10, active: true },
  { id: "credits_25", label: "25 Credits", credits: 25, priceCents: 500, currency: "USD", sortOrder: 20, active: true },
  { id: "credits_50", label: "50 Credits", credits: 50, priceCents: 900, currency: "USD", sortOrder: 30, active: true },
  { id: "credits_100", label: "100 Credits", credits: 100, priceCents: 1600, currency: "USD", sortOrder: 40, active: true },
  { id: "credits_250", label: "250 Credits", credits: 250, priceCents: 3500, currency: "USD", sortOrder: 50, active: true },
];

export const DEFAULT_PLATFORM_FEATURE_PRICING: Record<PlatformFeatureKey, PlatformFeaturePricing> = {
  chat: { unit: "token", baseCost: 0, inputCost: 0.005, outputCost: 0.015 },
  image_generation: { unit: "image", baseCost: 10 },
  video_generation: { unit: "second", baseCost: 5 },
  audio_generation: { unit: "character", baseCost: 0.1 },
  document_analysis: { unit: "token", baseCost: 0, inputCost: 0.005, outputCost: 0.015 },
  translation: { unit: "character", baseCost: 0.05 },
  vision: { unit: "image", baseCost: 5, inputCost: 0.005, outputCost: 0.015 },
  speech_to_text: { unit: "second", baseCost: 0.2 },
};

const defaultWorkflowPolicy: WorkflowPolicy = { dailyRuns: 0, monthlyRuns: 0, cooldownMinutes: 0 };

export const DEFAULT_WORKFLOW_POLICIES: Record<WorkflowKey, WorkflowPolicy> = {
  strategic_advice: { dailyRuns: 10, monthlyRuns: 0, cooldownMinutes: 5 },
  roadmap_generation: { dailyRuns: 5, monthlyRuns: 0, cooldownMinutes: 10 },
  summary: { dailyRuns: 50, monthlyRuns: 0, cooldownMinutes: 1 },
  analysis: { dailyRuns: 20, monthlyRuns: 0, cooldownMinutes: 5 },
  blog_writer: { ...defaultWorkflowPolicy },
  email_writer: { ...defaultWorkflowPolicy },
  ad_copy: { ...defaultWorkflowPolicy },
  sales_funnel: { ...defaultWorkflowPolicy },
  landing_page: { ...defaultWorkflowPolicy },
  social_post: { ...defaultWorkflowPolicy },
  product_description: { ...defaultWorkflowPolicy },
  course_creator: { ...defaultWorkflowPolicy },
  website_builder: { ...defaultWorkflowPolicy },
  presentation_builder: { ...defaultWorkflowPolicy },
  prompt_library: { ...defaultWorkflowPolicy },
  caption: { ...defaultWorkflowPolicy },
  script: { ...defaultWorkflowPolicy },
  carousel: { ...defaultWorkflowPolicy },
};

export const DEFAULT_CREATOR_CREDIT_CONFIG: CreatorCreditConfig = {
  tierAllocations: DEFAULT_CREATOR_CREDIT_ALLOCATIONS,
  platformFeaturePricing: DEFAULT_PLATFORM_FEATURE_PRICING,
  workflowPolicies: DEFAULT_WORKFLOW_POLICIES,
  bundles: DEFAULT_CREATOR_CREDIT_BUNDLES,
  version: 2,
};

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeCreatorCreditConfig(input: unknown): CreatorCreditConfig {
  const data = input && typeof input === "object" ? input as Record<string, unknown> : {};
  
  const tierAllocationsInput = data.tierAllocations && typeof data.tierAllocations === "object"
    ? data.tierAllocations as Partial<Record<CreatorCreditTier, unknown>>
    : {};

  const tierAllocations: Record<CreatorCreditTier, number> = {
    explorer: safeNumber(tierAllocationsInput.explorer, DEFAULT_CREATOR_CREDIT_ALLOCATIONS.explorer),
    pro: safeNumber(tierAllocationsInput.pro, DEFAULT_CREATOR_CREDIT_ALLOCATIONS.pro),
    elite: safeNumber(tierAllocationsInput.elite, DEFAULT_CREATOR_CREDIT_ALLOCATIONS.elite),
    enterprise: safeNumber(tierAllocationsInput.enterprise, DEFAULT_CREATOR_CREDIT_ALLOCATIONS.enterprise),
  };

  const platformPricingInput = data.platformFeaturePricing && typeof data.platformFeaturePricing === "object"
    ? data.platformFeaturePricing as Partial<Record<PlatformFeatureKey, unknown>>
    : {};
  
  const platformFeaturePricing = Object.fromEntries(
    (Object.keys(DEFAULT_PLATFORM_FEATURE_PRICING) as PlatformFeatureKey[]).map((feature) => {
      const def = DEFAULT_PLATFORM_FEATURE_PRICING[feature];
      const val = platformPricingInput[feature] as any;
      if (!val || typeof val !== "object") return [feature, def];
      return [
        feature,
        {
          unit: safeString(val.unit, def.unit) as PricingUnit,
          baseCost: safeNumber(val.baseCost, def.baseCost),
          inputCost: val.inputCost !== undefined ? safeNumber(val.inputCost, def.inputCost || 0) : def.inputCost,
          outputCost: val.outputCost !== undefined ? safeNumber(val.outputCost, def.outputCost || 0) : def.outputCost,
        }
      ];
    })
  ) as Record<PlatformFeatureKey, PlatformFeaturePricing>;

  const workflowPoliciesInput = data.workflowPolicies && typeof data.workflowPolicies === "object"
    ? data.workflowPolicies as Partial<Record<WorkflowKey, unknown>>
    : {};
  
  const workflowPolicies = Object.fromEntries(
    (Object.keys(DEFAULT_WORKFLOW_POLICIES) as WorkflowKey[]).map((workflow) => {
      const def = DEFAULT_WORKFLOW_POLICIES[workflow];
      const val = workflowPoliciesInput[workflow] as any;
      if (!val || typeof val !== "object") return [workflow, def];
      return [
        workflow,
        {
          dailyRuns: typeof val.dailyRuns === "number" ? val.dailyRuns : def.dailyRuns, // allows -1
          monthlyRuns: typeof val.monthlyRuns === "number" ? val.monthlyRuns : def.monthlyRuns,
          cooldownMinutes: safeNumber(val.cooldownMinutes, def.cooldownMinutes),
        }
      ];
    })
  ) as Record<WorkflowKey, WorkflowPolicy>;

  const seen = new Set<string>();
  const rawBundles = Array.isArray(data.bundles) ? data.bundles : [];
  const bundles = rawBundles
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const bundle = item as Record<string, unknown>;
      const id = safeString(bundle.id, "");
      const credits = safeNumber(bundle.credits, 0);
      const priceCents = safeNumber(bundle.priceCents, -1);
      if (!id || seen.has(id) || credits <= 0 || priceCents < 0) return null;
      seen.add(id);

      return {
        id,
        label: safeString(bundle.label, `${credits} Credits`),
        credits,
        priceCents,
        currency: safeString(bundle.currency, "USD").toUpperCase(),
        sortOrder: safeNumber(bundle.sortOrder, (index + 1) * 10),
        active: bundle.active !== false,
      } satisfies CreatorCreditBundle;
    })
    .filter((bundle): bundle is CreatorCreditBundle => Boolean(bundle))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.credits - b.credits);

  // Preserve legacy fields
  const featurePricing = data.featurePricing && typeof data.featurePricing === "object" ? data.featurePricing as Record<string, number> : undefined;
  const toolPricing = data.toolPricing && typeof data.toolPricing === "object" ? data.toolPricing as Record<string, number> : undefined;

  return {
    tierAllocations,
    platformFeaturePricing,
    workflowPolicies,
    bundles: bundles.length > 0 ? bundles : DEFAULT_CREATOR_CREDIT_BUNDLES,
    version: safeNumber(data.version, DEFAULT_CREATOR_CREDIT_CONFIG.version),
    ...(featurePricing && { featurePricing }),
    ...(toolPricing && { toolPricing }),
  };
}

export function activeCreditBundles(config: CreatorCreditConfig): CreatorCreditBundle[] {
  return config.bundles
    .filter((bundle) => bundle.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.credits - b.credits);
}
