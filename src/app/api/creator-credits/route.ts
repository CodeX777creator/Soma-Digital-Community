import { NextRequest } from "next/server";
import { requireSubscription } from "@/lib/serverAuth";
import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { getEffectiveUserTier } from "@/lib/tier";
import { getMonetizationDashboard } from "@/services/ai-platform";

export const GET = createAPIHandler(
  async (req: NextRequest) => {
    const entitlements = await requireSubscription(req as any, "explorer");
    const userTier = getEffectiveUserTier(entitlements.profile);
    const providerMode = entitlements.profile?.aiPreferences?.providerMode || entitlements.profile?.providerMode || "hybrid";

    const dashboard = await getMonetizationDashboard(entitlements.uid, userTier, providerMode);

    return apiResponse({
      ...dashboard,
      subscription: {
        plan: userTier,
        status: entitlements.subscription.subscriptionStatus,
        providerMode,
      },
    }, {
      cache: {
        maxAge: 15,
        staleWhileRevalidate: 30,
        private: true,
      },
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 20000,
  }
);

