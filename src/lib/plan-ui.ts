import type { UserTier } from "@/store/useUserStore";

export function getPlanLabel(tier: UserTier | string | null | undefined): string {
  if (tier === "elite") return "Elite Plan";
  if (tier === "pro") return "Pro Plan";
  return "Explorer Plan";
}

export function getUpgradeTarget(tier: UserTier | string | null | undefined): "pro" | "elite" | null {
  if (tier === "explorer" || !tier) return "pro";
  if (tier === "pro") return "elite";
  return null;
}

export function getUpgradeLabel(tier: UserTier | string | null | undefined): string {
  const target = getUpgradeTarget(tier);
  if (target === "elite") return "Upgrade to Elite";
  if (target === "pro") return "Upgrade to Pro";
  return "Manage Plan";
}

export function isEliteTier(tier: UserTier | string | null | undefined): boolean {
  return tier === "elite";
}

export function isPaidTier(tier: UserTier | string | null | undefined): boolean {
  return tier === "pro" || tier === "elite";
}
