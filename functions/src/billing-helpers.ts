import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();
const auth = admin.auth();

// Distributed lock collection for webhook processing
export const LOCKS_COLLECTION = 'webhook_locks';
export const LOCK_TIMEOUT_MS = 30000; // 30 seconds

export type SubscriptionPlan = 'explorer' | 'pro' | 'elite';
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'expired' | 'suspended';

export interface CanonicalSubscriptionState {
  provider: 'paypal' | 'paystack' | string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionId: string;
  planId?: SubscriptionPlan;
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string | null;
}

/**
 * Normalize plan ID to valid subscription plan
 */
export function normalizePlanId(planId: unknown): SubscriptionPlan {
  if (planId === 'enterprise') return 'elite';
  if (planId === 'elite' || planId === 'pro' || planId === 'explorer') {
    return planId;
  }
  return 'explorer';
}

/**
 * Normalize status string to valid subscription status
 */
export function normalizeStatus(status: string): SubscriptionStatus {
  const validStatuses: SubscriptionStatus[] = ['active', 'cancelled', 'past_due', 'expired', 'suspended'];
  if (validStatuses.includes(status as SubscriptionStatus)) {
    return status as SubscriptionStatus;
  }
  return 'expired';
}

export function deriveSubscriptionTransition(
  provider: 'paypal' | 'paystack' | 'manual',
  eventType: string,
  planId: SubscriptionPlan,
  subscriptionId: string,
  currentPeriodEnd?: string | null,
  fallbackStatus: SubscriptionStatus = 'expired'
): { state: CanonicalSubscriptionState; metadata: Record<string, unknown> } {
  const normalizedPlan = normalizePlanId(planId);
  const baseState = buildCanonicalSubscriptionState(
    normalizedPlan,
    fallbackStatus,
    subscriptionId,
    currentPeriodEnd,
    provider
  );

  if (provider === 'paypal') {
    if (eventType === 'BILLING.SUBSCRIPTION.CREATED') {
      return { state: baseState, metadata: { status: 'created' } };
    }

    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      return {
        state: buildCanonicalSubscriptionState(normalizedPlan, 'active', subscriptionId, currentPeriodEnd, provider),
        metadata: { status: 'active', currentPeriodEnd },
      };
    }

    if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
      return {
        state: buildCanonicalSubscriptionState(normalizedPlan, 'cancelled', subscriptionId, null, provider),
        metadata: { status: 'cancelled', cancelledAt: true },
      };
    }

    if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
      return {
        state: buildCanonicalSubscriptionState(normalizedPlan, 'expired', subscriptionId, null, provider),
        metadata: { status: 'expired' },
      };
    }
  }

  if (provider === 'paystack') {
    if (eventType === 'charge.success' || eventType === 'subscription.renewal' || eventType === 'subscription.renewal.success') {
      return {
        state: buildCanonicalSubscriptionState(normalizedPlan, 'active', subscriptionId, currentPeriodEnd, provider),
        metadata: { status: 'active', currentPeriodEnd },
      };
    }

    if (eventType === 'charge.failed' || eventType === 'subscription.not_funded' || eventType === 'invoice.payment_failed') {
      return {
        state: buildCanonicalSubscriptionState(normalizedPlan, 'past_due', subscriptionId, currentPeriodEnd, provider),
        metadata: { status: 'past_due', currentPeriodEnd },
      };
    }

    if (eventType === 'subscription.disable' || eventType === 'subscription.deactivate') {
      return {
        state: buildCanonicalSubscriptionState(normalizedPlan, 'cancelled', subscriptionId, null, provider),
        metadata: { status: 'cancelled', cancelledAt: true },
      };
    }

    if (eventType === 'charge.dispute' || eventType === 'charge.refund') {
      return {
        state: buildCanonicalSubscriptionState(normalizedPlan, 'expired', subscriptionId, null, provider),
        metadata: { status: 'expired' },
      };
    }
  }

  return { state: baseState, metadata: { status: fallbackStatus } };
}

export function getEffectiveTier(state: Pick<CanonicalSubscriptionState, 'subscriptionPlan' | 'subscriptionStatus'>): SubscriptionPlan {
  return state.subscriptionStatus === 'active' ? normalizePlanId(state.subscriptionPlan) : 'explorer';
}

export async function persistSubscriptionState(
  userId: string,
  subscriptionId: string,
  state: CanonicalSubscriptionState,
  subscriptionData: Record<string, unknown> = {}
): Promise<SubscriptionPlan> {
  await saveCanonicalSubscriptionState(userId, subscriptionId, state, subscriptionData);
  const effectiveTier = getEffectiveTier(state);
  await cacheSubscriptionClaim(userId, effectiveTier);
  return effectiveTier;
}

/**
 * Build canonical subscription state object
 */
export function buildCanonicalSubscriptionState(
  planId: SubscriptionPlan,
  status: SubscriptionStatus,
  subscriptionId: string,
  currentPeriodEnd?: string | null,
  provider: string = 'paypal'
): CanonicalSubscriptionState {
  return {
    provider,
    subscriptionPlan: planId,
    planId,
    plan: planId,
    subscriptionStatus: status,
    status,
    subscriptionId,
    currentPeriodEnd: currentPeriodEnd || null,
  };
}

/**
 * Save subscription state to Firestore (subscriptions + user documents)
 */
export async function saveCanonicalSubscriptionState(
  userId: string,
  subscriptionId: string,
  state: CanonicalSubscriptionState,
  subscriptionData: Record<string, unknown> = {}
): Promise<void> {
  const batch = db.batch();
  const timestamp = FieldValue.serverTimestamp();
  const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
  const userRef = db.collection('users').doc(userId);

  batch.set(
    subscriptionRef,
    {
      ...subscriptionData,
      ...state,
      userId,
      updatedAt: timestamp,
    },
    { merge: true }
  );

  // Only update user tier if subscription is active
  // This prevents users from appearing upgraded during pending/cancelled states
  const effectiveTier = state.subscriptionStatus === 'active' ? state.subscriptionPlan : 'explorer';
  if (state.subscriptionStatus === 'active') {
    batch.set(
      userRef,
      {
        subscription: {
          ...state,
          updatedAt: timestamp,
        },
        subscriptionTier: state.subscriptionPlan,
        tier: state.subscriptionPlan,
        updatedAt: timestamp,
      },
      { merge: true }
    );
  } else {
    batch.set(
      userRef,
      {
        subscription: {
          ...state,
          updatedAt: timestamp,
        },
        subscriptionTier: effectiveTier,
        tier: effectiveTier,
        updatedAt: timestamp,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

/**
 * Cache subscription tier in Firebase Auth custom claims
 */
export async function cacheSubscriptionClaim(userId: string, tier: SubscriptionPlan): Promise<void> {
  try {
    const user = await auth.getUser(userId);
    await auth.setCustomUserClaims(userId, {
      ...(user.customClaims || {}),
      subscriptionTier: tier,
    });
  } catch (error) {
    console.error(`Failed to cache subscription claim for ${userId}:`, error);
    // Don't throw - this is a non-critical optimization
  }
}

/**
 * Acquire distributed lock for webhook processing
 * Prevents race conditions when processing concurrent webhooks
 */
export async function acquireWebhookLock(
  eventId: string, 
  subscriptionId: string,
  timeoutMs: number = LOCK_TIMEOUT_MS
): Promise<boolean> {
  const lockRef = db.collection(LOCKS_COLLECTION).doc(`${subscriptionId}_${eventId}`);
  const now = Date.now();
  
  try {
    await db.runTransaction(async (transaction) => {
      const lockDoc = await transaction.get(lockRef);
      
      if (lockDoc.exists) {
        const data = lockDoc.data();
        const expiresAt = data?.expiresAt?.toMillis?.() || 0;
        
        if (now < expiresAt) {
          // Lock is still valid
          throw new Error('Lock already held');
        }
      }
      
      // Acquire lock
      transaction.set(lockRef, {
        eventId,
        subscriptionId,
        acquiredAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(now + timeoutMs),
      });
    });
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Release distributed lock after webhook processing
 */
export async function releaseWebhookLock(eventId: string, subscriptionId: string): Promise<void> {
  const lockRef = db.collection(LOCKS_COLLECTION).doc(`${subscriptionId}_${eventId}`);
  try {
    await lockRef.delete();
  } catch (error) {
    // Ignore errors on release
  }
}

/**
 * Check and store idempotency key
 * Prevents duplicate subscription creation/charges
 */
export async function checkIdempotencyKey(userId: string, key: string): Promise<boolean> {
  if (!key) return true;
  
  const idempotencyRef = db.collection('idempotency_keys').doc(`${userId}_${key}`);
  let reserved = false;

  await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(idempotencyRef);

    if (doc.exists) {
      const existing = doc.data() || {};
      const expiresAt = existing.expiresAt;
      const expiryMs = typeof expiresAt?.toMillis === 'function'
        ? expiresAt.toMillis()
        : expiresAt instanceof Date
          ? expiresAt.getTime()
          : typeof expiresAt === 'string' || typeof expiresAt === 'number'
            ? new Date(expiresAt).getTime()
            : 0;

      // A crashed or timed-out checkout may leave only a reservation behind.
      // Reclaim it after expiry, but never reclaim a checkout with a provider URL.
      if (existing.status === 'reserved' && !existing.authorizationUrl && expiryMs > 0 && expiryMs <= Date.now()) {
        transaction.set(idempotencyRef, {
          userId,
          key,
          status: 'reserved',
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }, { merge: true });
        reserved = true;
        return;
      }

      reserved = false;
      return;
    }

    transaction.set(idempotencyRef, {
      userId,
      key,
      status: 'reserved',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    reserved = true;
  });

  return reserved;
}

/**
 * Archive webhook event for audit trail
 */
export async function archiveWebhookEvent(
  eventId: string,
  eventType: string,
  subscriptionId: string,
  payload: unknown,
  processed: boolean = true,
  error?: string
): Promise<void> {
  const archiveRef = db.collection('webhook_archive').doc(eventId);
  
  await archiveRef.set({
    eventId,
    eventType,
    subscriptionId,
    payload,
    processed,
    processedAt: FieldValue.serverTimestamp(),
    error: error || null,
    archivedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Get user's active subscription (if any)
 */
export async function getUserActiveSubscription(userId: string): Promise<{ id: string; data: any } | null> {
  const subsSnapshot = await db
    .collection('subscriptions')
    .where('userId', '==', userId)
    .where('subscriptionStatus', '==', 'active')
    .limit(1)
    .get();
  
  if (subsSnapshot.empty) return null;
  
  const doc = subsSnapshot.docs[0];
  return { id: doc.id, data: doc.data() };
}

/**
 * Calculate prorated amount for plan upgrade
 */
export function calculateProratedUpgrade(
  currentPlan: SubscriptionPlan,
  newPlan: SubscriptionPlan,
  currentPeriodEnd: Date,
  planPrices: Record<SubscriptionPlan, number>
): { amountDue: number; creditsApplied: number } {
  const planWeights: Record<SubscriptionPlan, number> = {
    explorer: 0,
    pro: 1,
    elite: 2,
  };
  
  // Don't allow downgrades through this function
  if (planWeights[newPlan] <= planWeights[currentPlan]) {
    return { amountDue: 0, creditsApplied: 0 };
  }
  
  const now = new Date();
  const daysRemaining = Math.max(0, (currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const daysInPeriod = 30; // Approximate
  
  const currentPrice = planPrices[currentPlan];
  const newPrice = planPrices[newPlan];
  
  // Calculate remaining value
  const remainingValue = (currentPrice / daysInPeriod) * daysRemaining;
  
  // Calculate new charge
  const newCharge = (newPrice / daysInPeriod) * daysRemaining;
  
  // Amount due is difference
  const amountDue = Math.max(0, newCharge - remainingValue);
  
  return {
    amountDue: Math.round(amountDue),
    creditsApplied: Math.round(remainingValue),
  };
}

/**
 * Retry wrapper with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Create audit log entry
 */
export async function createAuditLog(
  action: string,
  userId: string,
  subscriptionId: string,
  details: Record<string, unknown>
): Promise<void> {
  const auditRef = db.collection('audit_logs').doc();
  
  await auditRef.set({
    action,
    userId,
    subscriptionId,
    details,
    timestamp: FieldValue.serverTimestamp(),
  });
}
