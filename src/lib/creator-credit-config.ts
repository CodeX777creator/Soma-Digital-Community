export type CreatorCreditTier = "explorer" | "pro" | "elite" | "enterprise";
export type CreatorCreditFeatureKey =
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
export type CreatorCreditToolKey =
  | "caption"
  | "social_post"
  | "ad_copy"
  | "email"
  | "blog"
  | "script"
  | "carousel"
  | "business_planner"
  | "marketing_planner"
  | "sales_funnel"
  | "prompt_library"
  | "image"
  | "voice_audio"
  | "video_render"
  | "mentor_chat"
  | "ai_chat"
  | "translation";

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
  featurePricing: Record<CreatorCreditFeatureKey, number>;
  toolPricing: Record<CreatorCreditToolKey, number>;
  bundles: CreatorCreditBundle[];
  version: number;
};

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

export const DEFAULT_CREATOR_CREDIT_FEATURE_PRICING: Record<CreatorCreditFeatureKey, number> = {
  mentor_chat: 1,
  business_coach: 1,
  ai_chat: 1,
  content_generation: 20,
  prompt_library: 5,
  image_generation: 10,
  video_generation: 100,
  voice_generation: 20,
  translation: 2,
  document_generation: 20,
  business_planner: 10,
  social_media_generator: 5,
  sales_coach: 5,
  funnel_builder: 20,
  calendar_generation: 15,
};

export const DEFAULT_CREATOR_CREDIT_TOOL_PRICING: Record<CreatorCreditToolKey, number> = {
  mentor_chat: 1,
  ai_chat: 1,
  translation: 2,
  caption: 5,
  social_post: 5,
  ad_copy: 10,
  email: 10,
  blog: 20,
  script: 20,
  carousel: 15,
  business_planner: 10,
  marketing_planner: 15,
  sales_funnel: 20,
  prompt_library: 5,
  image: 10,
  voice_audio: 20,
  video_render: 100,
};

export const DEFAULT_CREATOR_CREDIT_CONFIG: CreatorCreditConfig = {
  tierAllocations: DEFAULT_CREATOR_CREDIT_ALLOCATIONS,
  featurePricing: DEFAULT_CREATOR_CREDIT_FEATURE_PRICING,
  toolPricing: DEFAULT_CREATOR_CREDIT_TOOL_PRICING,
  bundles: DEFAULT_CREATOR_CREDIT_BUNDLES,
  version: 1,
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

  const featurePricingInput = data.featurePricing && typeof data.featurePricing === "object"
    ? data.featurePricing as Partial<Record<CreatorCreditFeatureKey, unknown>>
    : {};
  const featurePricing = Object.fromEntries(
    (Object.keys(DEFAULT_CREATOR_CREDIT_FEATURE_PRICING) as CreatorCreditFeatureKey[]).map((feature) => [
      feature,
      safeNumber(featurePricingInput[feature], DEFAULT_CREATOR_CREDIT_FEATURE_PRICING[feature]),
    ])
  ) as Record<CreatorCreditFeatureKey, number>;

  const toolPricingInput = data.toolPricing && typeof data.toolPricing === "object"
    ? data.toolPricing as Partial<Record<CreatorCreditToolKey, unknown>>
    : {};
  const toolPricing = Object.fromEntries(
    (Object.keys(DEFAULT_CREATOR_CREDIT_TOOL_PRICING) as CreatorCreditToolKey[]).map((tool) => [
      tool,
      safeNumber(toolPricingInput[tool], DEFAULT_CREATOR_CREDIT_TOOL_PRICING[tool]),
    ])
  ) as Record<CreatorCreditToolKey, number>;

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

  return {
    tierAllocations,
    featurePricing,
    toolPricing,
    bundles: bundles.length > 0 ? bundles : DEFAULT_CREATOR_CREDIT_BUNDLES,
    version: safeNumber(data.version, DEFAULT_CREATOR_CREDIT_CONFIG.version),
  };
}

export function activeCreditBundles(config: CreatorCreditConfig): CreatorCreditBundle[] {
  return config.bundles
    .filter((bundle) => bundle.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.credits - b.credits);
}
