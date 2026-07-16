export type AuthRouteProfile = {
  onboardingComplete?: boolean | null;
  emailVerified?: boolean | null;
  subscriptionPlan?: string | null;
  tier?: string | null;
};

export type AuthRouteIntent = {
  safeRedirect?: string | null;
  isNewUser?: boolean;
};

export function resolvePostAuthDestination(
  profile: AuthRouteProfile | null | undefined,
  intent: AuthRouteIntent = {}
) {
  if (intent.isNewUser || profile?.onboardingComplete !== true) {
    const redirect = intent.safeRedirect ? `?redirect=${encodeURIComponent(intent.safeRedirect)}` : "";
    return `/open${redirect}`;
  }

  return intent.safeRedirect || "/dashboard";
}

export function resolvePostOnboardingDestination(
  intendedPlan: string | null | undefined,
  safeRedirect?: string | null
) {
  if (safeRedirect) return safeRedirect;
  if (intendedPlan === "pro" || intendedPlan === "elite") {
    return `/dashboard?upgrade=${intendedPlan}`;
  }
  return "/dashboard";
}
