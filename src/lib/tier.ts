export type UserTier = "explorer" | "pro" | "elite";

const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "approval_pending",
  "cancelled",
  "created",
  "expired",
  "past_due",
  "suspended",
  "user_cancelled",
]);

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

  if (INACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    return "explorer";
  }

  return normalizeTier(profile.subscriptionTier) || normalizeTier(profile.tier) || "explorer";
}
