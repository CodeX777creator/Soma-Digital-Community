import type { DocumentData } from 'firebase-admin/firestore';

export type SubscriptionPlan = 'explorer' | 'pro' | 'elite';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'expired';

export const subscriptionWeights: Record<SubscriptionPlan, number> = {
  explorer: 0,
  pro: 1,
  elite: 2,
};

export interface SubscriptionRecord {
  provider: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionId: string;
  userId?: string;
  planId?: SubscriptionPlan;
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string | null;
}

export interface UserEntitlements {
  uid: string;
  isAdmin: boolean;
  subscription: SubscriptionRecord;
  roles: string[];
  profile: DocumentData;
}

export function getSubscriptionPlan(plan: unknown): SubscriptionPlan {
  if (plan === 'enterprise') {
    return 'elite';
  }

  if (plan === 'elite' || plan === 'pro' || plan === 'explorer') {
    return plan;
  }

  if (typeof plan === 'object' && plan !== null && 'subscriptionPlan' in plan) {
    const candidate = (plan as any).subscriptionPlan;
    if (candidate === 'enterprise') {
      return 'elite';
    }
    if (candidate === 'elite' || candidate === 'pro' || candidate === 'explorer') {
      return candidate;
    }
  }

  return 'explorer';
}

export function isSubscriptionActive(subscription?: SubscriptionRecord | null): boolean {
  return Boolean(
    subscription && subscription.subscriptionStatus === 'active'
  );
}

export function hasPlan(subscription: SubscriptionRecord | null | undefined, minimumPlan: SubscriptionPlan): boolean {
  if (!subscription) return false;
  return subscriptionWeights[getSubscriptionPlan(subscription.subscriptionPlan)] >= subscriptionWeights[minimumPlan];
}

export function normalizeSubscription(subscription: Partial<SubscriptionRecord> | null | undefined): SubscriptionRecord {
  const subscriptionPlan = getSubscriptionPlan(
    subscription?.subscriptionPlan ?? subscription?.planId ?? subscription?.plan
  );

  const rawStatus = subscription?.subscriptionStatus ?? subscription?.status;
  const subscriptionStatus =
    rawStatus === 'active' || rawStatus === 'cancelled' || rawStatus === 'past_due' || rawStatus === 'expired'
      ? rawStatus
      : 'expired';
  const subscriptionId =
    typeof subscription?.subscriptionId === 'string' && subscription.subscriptionId
      ? subscription.subscriptionId
      : '';

  return {
    provider: subscription?.provider || 'paypal',
    subscriptionPlan,
    planId: subscriptionPlan,
    plan: subscriptionPlan,
    subscriptionStatus,
    status: subscriptionStatus,
    subscriptionId,
    userId: subscription?.userId,
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
  };
}
