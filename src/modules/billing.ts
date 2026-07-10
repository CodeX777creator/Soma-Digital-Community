import 'server-only';

import { getUserCredits, canUseAIChat, consumeAIChat, addCredits, resetMonthlyQuota } from '@/lib/credits';
import { normalizeSubscription, hasPlan, isSubscriptionActive, getSubscriptionPlan, type SubscriptionPlan } from '@/lib/entitlements';
import { getCreatorCreditDashboard, listProviderConnections, setByokEnabled } from '@/services/ai-platform';

export function createBillingModule() {
  return {
    credits: {
      getUserCredits,
      canUseAIChat,
      consumeAIChat,
      addCredits,
      resetMonthlyQuota,
    },
    entitlements: {
      normalizeSubscription,
      hasPlan,
      isSubscriptionActive,
      getSubscriptionPlan,
      subscriptionPlans: ['explorer', 'pro', 'elite'] as SubscriptionPlan[],
    },
    monetization: {
      getCreatorCreditDashboard,
      listProviderConnections,
      setByokEnabled,
    },
  };
}

export const billingModule = createBillingModule();
