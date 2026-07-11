export type CreatorCreditTier = "explorer" | "pro" | "elite" | "enterprise";

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
  { id: "credits_5", label: "5 Credits", credits: 5, priceCents: 125, currency: "USD", sortOrder: 10, active: true },
  { id: "credits_10", label: "10 Credits", credits: 10, priceCents: 225, currency: "USD", sortOrder: 20, active: true },
  { id: "credits_25", label: "25 Credits", credits: 25, priceCents: 500, currency: "USD", sortOrder: 30, active: true },
  { id: "credits_50", label: "50 Credits", credits: 50, priceCents: 450, currency: "USD", sortOrder: 40, active: true },
  { id: "credits_100", label: "100 Credits", credits: 100, priceCents: 800, currency: "USD", sortOrder: 50, active: true },
  { id: "credits_250", label: "250 Credits", credits: 250, priceCents: 1750, currency: "USD", sortOrder: 60, active: true },
];

export const DEFAULT_CREATOR_CREDIT_CONFIG: CreatorCreditConfig = {
  tierAllocations: DEFAULT_CREATOR_CREDIT_ALLOCATIONS,
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
    bundles: bundles.length > 0 ? bundles : DEFAULT_CREATOR_CREDIT_BUNDLES,
    version: safeNumber(data.version, DEFAULT_CREATOR_CREDIT_CONFIG.version),
  };
}

export function activeCreditBundles(config: CreatorCreditConfig): CreatorCreditBundle[] {
  return config.bundles
    .filter((bundle) => bundle.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.credits - b.credits);
}
