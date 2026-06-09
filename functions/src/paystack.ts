import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import axios from 'axios';
import crypto from 'crypto';
import { createNotification } from './notifications';

const db = admin.firestore();
const auth = admin.auth();

function getFunctionsConfigValue(path: string, envKey: string): string {
  let value: unknown = undefined;
  try {
    const configFn = (functions as unknown as {
      config?: () => Record<string, unknown>;
    }).config;
    const config = typeof configFn === 'function' ? configFn() : {};
    value = path
      .split('.')
      .reduce<unknown>((acc, part) => {
        if (acc && typeof acc === 'object' && part in acc) {
          return (acc as Record<string, unknown>)[part];
        }
        return undefined;
      }, config);
  } catch {
    value = undefined;
  }
  return typeof value === 'string' && value.length > 0
    ? value
    : process.env[envKey] || '';
}

const PAYSTACK_API_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = getFunctionsConfigValue('paystack.secret_key', 'PAYSTACK_SECRET_KEY');
const PAYSTACK_CURRENCY = getFunctionsConfigValue('paystack.currency', 'PAYSTACK_CURRENCY') || 'USD';
const FRONTEND_URL = getFunctionsConfigValue('app.frontend_url', 'FRONTEND_URL');
const PAYSTACK_CALLBACK_URL = FRONTEND_URL
  ? `${FRONTEND_URL}/dashboard?subscription=success`
  : '';

const PAYSTACK_AMOUNTS: Record<SubscriptionPlan, number> = {
  explorer: Number(getFunctionsConfigValue('paystack.amount_explorer', 'PAYSTACK_AMOUNT_EXPLORER') || 0),
  pro: Number(getFunctionsConfigValue('paystack.amount_pro', 'PAYSTACK_AMOUNT_PRO') || 0),
  elite: Number(getFunctionsConfigValue('paystack.amount_elite', 'PAYSTACK_AMOUNT_ELITE') || 0),
};

type SubscriptionPlan = 'explorer' | 'pro' | 'elite';
type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'expired';

interface InitializeTransactionRequest {
  email: string;
  amount: number; // in kobo (smallest currency unit)
  plan?: string;
  metadata?: { userId: string; planId: string };
}

interface InitializeTransactionResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface CanonicalSubscriptionState {
  provider: 'paypal' | 'paystack' | string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionId: string;
  planId?: SubscriptionPlan;
  plan?: SubscriptionPlan;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string | null;
}

function getPaystackHeaders() {
  return {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isPaystackTransactionResponse(data: unknown): data is InitializeTransactionResponse {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const transaction = data as Record<string, unknown>;
  return (
    typeof transaction.authorization_url === 'string' &&
    typeof transaction.access_code === 'string' &&
    typeof transaction.reference === 'string'
  );
}

function normalizePlanId(planId: unknown): SubscriptionPlan {
  if (planId === 'enterprise') {
    return 'elite';
  }

  if (planId === 'elite' || planId === 'pro' || planId === 'explorer') {
    return planId;
  }
  return 'explorer';
}

function normalizeStatus(status: unknown): SubscriptionStatus {
  if (status === 'active' || status === 'cancelled' || status === 'past_due' || status === 'expired') {
    return status;
  }
  return 'expired';
}

function buildCanonicalSubscriptionState(
  planId: SubscriptionPlan,
  status: SubscriptionStatus,
  subscriptionId: string,
  currentPeriodEnd?: string | null
): CanonicalSubscriptionState {
  return {
    provider: 'paystack',
    subscriptionPlan: planId,
    planId,
    plan: planId,
    subscriptionStatus: status,
    status,
    subscriptionId,
    currentPeriodEnd: currentPeriodEnd || null,
  };
}

async function saveCanonicalSubscriptionState(
  userId: string,
  subscriptionId: string,
  state: CanonicalSubscriptionState,
  subscriptionData: Record<string, unknown> = {}
) {
  const batch = db.batch();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
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

  await batch.commit();
}

async function cacheSubscriptionClaim(userId: string, tier: SubscriptionPlan) {
  const user = await auth.getUser(userId);
  await auth.setCustomUserClaims(userId, {
    ...(user.customClaims || {}),
    subscriptionTier: tier,
  });
}

function verifyPaystackSignature(req: functions.https.Request): boolean {
  const signatureHeader = req.headers['x-paystack-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature) {
    return false;
  }

  const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body)).toString('utf8');
  const computedSignature = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  return computedSignature === signature;
}

export const initializePaystackTransaction = onCall<InitializeTransactionRequest>(
  async (request): Promise<InitializeTransactionResponse> => {
    const { email, amount, plan, metadata } = request.data;

    if (typeof email !== 'string' || !isValidEmail(email)) {
      throw new HttpsError('invalid-argument', 'A valid email address is required');
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError('invalid-argument', 'Amount must be greater than 0');
    }

    if (!PAYSTACK_SECRET_KEY) {
      throw new HttpsError('internal', 'Paystack secret key is not configured');
    }

    try {
      const response = await axios.post(
        `${PAYSTACK_API_BASE_URL}/transaction/initialize`,
        {
          email,
          amount,
          ...(plan ? { plan } : {}),
          ...(metadata ? { metadata } : {}),
        },
        {
          headers: getPaystackHeaders(),
        }
      );

      const transaction = (response.data as { data?: unknown }).data;

      if (!isPaystackTransactionResponse(transaction)) {
        throw new Error('Paystack returned an invalid transaction response');
      }

      return {
        authorization_url: transaction.authorization_url,
        access_code: transaction.access_code,
        reference: transaction.reference,
      };
    } catch (error) {
      console.error('Failed to initialize Paystack transaction:', error);
      throw new HttpsError('internal', 'Failed to initialize Paystack transaction');
    }
  }
);

/**
 * Create Paystack subscription/charge and return checkout URL
 */
export const createPaystackSubscription = functions.https.onCall(
  async (request) => {
    const data = request.data;
    const context = request.auth;

    if (!context?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
    }

    if (!PAYSTACK_SECRET_KEY) {
      throw new functions.https.HttpsError('failed-precondition', 'Paystack secret key is not configured');
    }

    const { planId, userId } = data as { planId: SubscriptionPlan; userId: string };
    const normalizedPlanId = normalizePlanId(planId);
    const amount = PAYSTACK_AMOUNTS[normalizedPlanId];

    if (!amount || !PAYSTACK_CALLBACK_URL) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid Paystack plan configuration');
    }

    if (userId !== context.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Cannot create subscription for another user');
    }

    const userRecord = await auth.getUser(context.uid);
    const email = userRecord.email;
    if (!email) {
      throw new functions.https.HttpsError('failed-precondition', 'User email is required for Paystack checkout');
    }

    try {
      const response = await axios.post(
        `${PAYSTACK_API_BASE_URL}/transaction/initialize`,
        {
          email,
          amount,
          currency: PAYSTACK_CURRENCY,
          callback_url: PAYSTACK_CALLBACK_URL,
          metadata: {
            planId: normalizedPlanId,
            userId,
            provider: 'paystack',
          },
        },
        {
          headers: getPaystackHeaders(),
        }
      );

      const transaction = response.data.data;
      const authorizationUrl = transaction.authorization_url;
      const subscriptionId = transaction.reference;

      if (!authorizationUrl || !subscriptionId) {
        throw new Error('Paystack did not return a checkout URL');
      }

      await saveCanonicalSubscriptionState(
        userId,
        subscriptionId,
        buildCanonicalSubscriptionState(normalizedPlanId, 'expired', subscriptionId, null),
        {
          userId,
          planId: normalizedPlanId,
          paystackReference: subscriptionId,
          provider: 'paystack',
          status: 'approval_pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      );

      return {
        subscriptionId,
        authorizationUrl,
      };
    } catch (error) {
      console.error('Failed to create Paystack subscription:', error);
      throw new functions.https.HttpsError('internal', 'Failed to create Paystack subscription');
    }
  }
);

/**
 * Paystack webhook handler
 */
export const paystackWebhook = functions.https.onRequest(async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY || !verifyPaystackSignature(req)) {
      console.warn('Invalid Paystack webhook signature');
      res.status(401).send('Invalid signature');
      return;
    }

    const body = req.body;
    const eventType = body.event;
    const data = body.data;
    const subscriptionId = data.reference;
    const eventId = data.id ? String(data.id) : `${eventType}-${subscriptionId}`;

    const eventRef = db.collection('webhook_events').doc(eventId);
    const eventExists = await eventRef.get();
    if (eventExists.exists) {
      res.status(200).json({ success: true });
      return;
    }

    await eventRef.set({
      eventId,
      eventType,
      subscriptionId,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
    const subscriptionSnap = await subscriptionRef.get();
    const subscriptionData = subscriptionSnap.exists ? subscriptionSnap.data() : null;
    const userId = subscriptionData?.userId || data.metadata?.userId;
    const planId = normalizePlanId(subscriptionData?.planId || data.metadata?.planId);

    if (!userId) {
      console.warn(`No userId found for Paystack reference ${subscriptionId}`);
      res.status(200).json({ success: true });
      return;
    }

    const currentPeriodEnd = data.next_payment_date
      ? new Date(data.next_payment_date).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    let canonicalState = buildCanonicalSubscriptionState(planId, 'expired', subscriptionId, null);
    let auditUpdate: Record<string, unknown> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (eventType === 'charge.success') {
      canonicalState = buildCanonicalSubscriptionState(planId, 'active', subscriptionId, currentPeriodEnd);
      auditUpdate = {
        ...auditUpdate,
        status: 'active',
        currentPeriodEnd,
      };
    } else if (eventType === 'subscription.disable' || eventType === 'subscription.deactivate') {
      canonicalState = buildCanonicalSubscriptionState(planId, 'cancelled', subscriptionId, null);
      auditUpdate = {
        ...auditUpdate,
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    } else if (eventType === 'charge.dispute' || eventType === 'charge.refund') {
      canonicalState = buildCanonicalSubscriptionState(planId, 'expired', subscriptionId, null);
      auditUpdate = {
        ...auditUpdate,
        status: 'expired',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    }

    await saveCanonicalSubscriptionState(
      userId,
      subscriptionId,
      canonicalState,
      {
        userId,
        planId,
        paystackReference: subscriptionId,
        provider: 'paystack',
        ...(subscriptionSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        ...auditUpdate,
      }
    );

    await cacheSubscriptionClaim(
      userId,
      canonicalState.subscriptionStatus === 'active' ? canonicalState.subscriptionPlan : 'explorer'
    );

    if (eventType === 'charge.success') {
      await createNotification(
        userId,
        'subscription',
        'Subscription activated',
        'Your plan is now active. Welcome to premium access.',
        '/dashboard'
      );
    } else if (eventType === 'subscription.disable' || eventType === 'subscription.deactivate') {
      await createNotification(
        userId,
        'subscription',
        'Subscription cancelled',
        'Your subscription has been cancelled. Re-enable it anytime from your dashboard.',
        '/dashboard'
      );
    } else if (eventType === 'charge.dispute' || eventType === 'charge.refund') {
      await createNotification(
        userId,
        'subscription',
        'Subscription expired',
        'Your subscription has expired. Renew to keep premium access.',
        '/dashboard'
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.status(200).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * Cancel Paystack subscription (user-initiated)
 */
export const cancelPaystackSubscription = functions.https.onCall(
  async (request) => {
    const data = request.data;
    const context = request.auth;

    if (!context?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
    }

    const { subscriptionId } = data as { subscriptionId: string };
    const userId = context.uid;
    const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
    const subscriptionSnap = await subscriptionRef.get();

    if (!subscriptionSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Subscription not found');
    }

    const subscriptionData = subscriptionSnap.data();
    if (subscriptionData?.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'Cannot cancel someone else\'s subscription');
    }

    try {
      if (PAYSTACK_SECRET_KEY && subscriptionData?.paystackReference) {
        try {
          await axios.post(
            `${PAYSTACK_API_BASE_URL}/subscription/${subscriptionData.paystackReference}/disable`,
            {},
            { headers: getPaystackHeaders() }
          );
        } catch (innerError) {
          console.warn('Paystack disable call failed, falling back to local state update', innerError);
        }
      }

      const canonicalState = buildCanonicalSubscriptionState(
        normalizePlanId(subscriptionData?.planId),
        'cancelled',
        subscriptionId,
        null
      );

      await saveCanonicalSubscriptionState(
        userId,
        subscriptionId,
        canonicalState,
        {
          status: 'cancelled',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      );
      await cacheSubscriptionClaim(userId, 'explorer');
      await createNotification(
        userId,
        'subscription',
        'Subscription cancelled',
        'Your Paystack subscription has been cancelled successfully.',
        '/dashboard'
      );

      return { success: true };
    } catch (error) {
      console.error('Failed to cancel Paystack subscription:', error);
      throw new functions.https.HttpsError('internal', 'Failed to cancel Paystack subscription');
    }
  }
);
