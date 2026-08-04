export type PlatformTier = "explorer" | "pro" | "elite" | "enterprise";

export type SchedulerTierPrivilege = {
  connectedAccounts: number;
  scheduledPostsPerMonth: number;
  campaigns: boolean;
  advancedAnalytics: boolean;
  priorityPublishing: boolean;
};

export type TierPrivilege = {
  label: string;
  includedCreatorCredits: number;
  aiConcurrency: number;
  aiPriority: "standard" | "priority";
  aiModelClasses: readonly ("standard" | "advanced" | "premium" | "specialized")[];
  resources: "public" | "pro" | "pro_and_elite";
  liveCalls: "none" | "monthly" | "unlimited";
  founderAccess: boolean;
  advancedAnalytics: boolean;
  scheduler: SchedulerTierPrivilege;
};

const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const DEFAULT_TIER_PRIVILEGES: Record<PlatformTier, TierPrivilege> = {
  explorer: {
    label: "Explorer",
    includedCreatorCredits: 0,
    aiConcurrency: 1,
    aiPriority: "standard",
    aiModelClasses: ["standard"],
    resources: "public",
    liveCalls: "none",
    founderAccess: false,
    advancedAnalytics: false,
    scheduler: {
      connectedAccounts: 1,
      scheduledPostsPerMonth: 10,
      campaigns: false,
      advancedAnalytics: false,
      priorityPublishing: false,
    },
  },
  pro: {
    label: "Pro",
    includedCreatorCredits: 220,
    aiConcurrency: 3,
    aiPriority: "standard",
    aiModelClasses: ["standard", "advanced", "premium"],
    resources: "pro",
    liveCalls: "monthly",
    founderAccess: false,
    advancedAnalytics: false,
    scheduler: {
      connectedAccounts: 5,
      scheduledPostsPerMonth: 100,
      campaigns: true,
      advancedAnalytics: false,
      priorityPublishing: false,
    },
  },
  elite: {
    label: "Elite",
    includedCreatorCredits: 700,
    aiConcurrency: 6,
    aiPriority: "priority",
    aiModelClasses: ["standard", "advanced", "premium", "specialized"],
    resources: "pro_and_elite",
    liveCalls: "unlimited",
    founderAccess: true,
    advancedAnalytics: true,
    scheduler: {
      connectedAccounts: UNLIMITED,
      scheduledPostsPerMonth: UNLIMITED,
      campaigns: true,
      advancedAnalytics: true,
      priorityPublishing: true,
    },
  },
  enterprise: {
    label: "Enterprise",
    includedCreatorCredits: 2000,
    aiConcurrency: 12,
    aiPriority: "priority",
    aiModelClasses: ["standard", "advanced", "premium", "specialized"],
    resources: "pro_and_elite",
    liveCalls: "unlimited",
    founderAccess: true,
    advancedAnalytics: true,
    scheduler: {
      connectedAccounts: UNLIMITED,
      scheduledPostsPerMonth: UNLIMITED,
      campaigns: true,
      advancedAnalytics: true,
      priorityPublishing: true,
    },
  },
};

export function normalizePlatformTier(value: unknown): PlatformTier {
  if (value === "pro" || value === "elite" || value === "enterprise") return value;
  return "explorer";
}

export function getTierPrivileges(value: unknown): TierPrivilege {
  return DEFAULT_TIER_PRIVILEGES[normalizePlatformTier(value)];
}

export function canTierUseModelClass(value: unknown, modelClass: string): boolean {
  const tier = getTierPrivileges(value);
  return tier.aiModelClasses.includes(modelClass as TierPrivilege["aiModelClasses"][number]);
}

export function schedulerLimitReached(value: unknown, scheduledPostsThisMonth: number): boolean {
  return scheduledPostsThisMonth >= getTierPrivileges(value).scheduler.scheduledPostsPerMonth;
}
