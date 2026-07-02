export type UserTier = "explorer" | "pro" | "elite";

function normalizeTier(value: unknown): UserTier | null {
  if (value === "elite" || value === "enterprise") return "elite";
  if (value === "pro") return "pro";
  if (value === "explorer") return "explorer";
  return null;
}

export function getEffectiveUserTier(profile: Record<string, any> | null | undefined): UserTier {
  if (!profile) return "explorer";

  const subscription = profile.subscription;
  const status = subscription?.subscriptionStatus || subscription?.status;
  const subscriptionTier = normalizeTier(
    subscription?.subscriptionPlan || subscription?.plan || subscription?.planId
  );

  if (status === "active" && subscriptionTier) {
    return subscriptionTier;
  }

  if (status === "approval_pending" || status === "created") {
    return "explorer";
  }

  return normalizeTier(profile.subscriptionTier) || normalizeTier(profile.tier) || "explorer";
}
