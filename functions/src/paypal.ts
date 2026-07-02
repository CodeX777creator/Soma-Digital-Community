import * as admin from 'firebase-admin';
import axios, { AxiosError } from 'axios';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createNotification } from './notifications';
import {
  deriveSubscriptionTransition,
  persistSubscriptionState,
  acquireWebhookLock,
  releaseWebhookLock,
  archiveWebhookEvent,
  createAuditLog,
  checkIdempotencyKey,
} from './billing-helpers';
import type {
  PayPalAccessTokenResponse,
  PayPalSubscriptionLink,
  PayPalSubscriptionResponse,
  PayPalVerificationResponse,
} from './paypal-types';

const db = admin.firestore();
const auth = admin.auth();

type SubscriptionPlan = 'explorer' | 'pro' | 'elite';
type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'expired' | 'suspended';

interface CreateSubscriptionRequest {
  planId: SubscriptionPlan;
  userId: string;
  returnUrl?: string;
  cancelUrl?: string;
}

interface CreateSubscriptionResponse {
  subscriptionId: string;
  approvalUrl: string;
  status: string;
}

interface CancelSubscriptionRequest {
  subscriptionId: string;
}

interface CancelSubscriptionResponse {
  success: boolean;
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



interface PayPalWebhookResource {
  id: string;
  plan_id?: string;
  start_time?: string;
  billing_info?: {
    next_billing_time?: string;
    failed_payments_count?: number;
  };
}

interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource: PayPalWebhookResource;
}

const planToDuration: Record<SubscriptionPlan, number> = {
  explorer: 1,
  pro: 1,
  elite: 1,
};

// Define params
const paypalClientId = defineSecret('PAYPAL_CLIENT_ID');
const paypalClientSecret = defineSecret('PAYPAL_CLIENT_SECRET');
const paypalWebhookId = defineSecret('PAYPAL_WEBHOOK_ID');
const paypalEnv = defineString('PAYPAL_ENV', { default: 'sandbox' });
const frontendUrl = defineString('FRONTEND_URL', { default: 'https://soma-digital-community.vercel.app' });
const paypalPlanExplorer = defineString('PAYPAL_PLAN_EXPLORER', { default: '' });
const paypalPlanPro = defineString('PAYPAL_PLAN_PRO', { default: '' });
const paypalPlanElite = defineString('PAYPAL_PLAN_ELITE', { default: '' });

function getPayPalApiBaseUrl(): string {
  return paypalEnv.value() === 'production'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';
}

function getPayPalPlans(): Record<SubscriptionPlan, string> {
  return {
    explorer: paypalPlanExplorer.value(),
    pro: paypalPlanPro.value(),
    elite: paypalPlanElite.value(),
  };
}

function isHttpsError(error: unknown): error is HttpsError {
  return error instanceof HttpsError;
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError: AxiosError = error;
    return axiosError.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
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

function buildCanonicalSubscriptionState(
  planId: SubscriptionPlan,
  status: SubscriptionStatus,
  subscriptionId: string,
  currentPeriodEnd?: string | null
): CanonicalSubscriptionState {
  return {
    provider: 'paypal',
    subscriptionPlan: planId,
    planId,
    plan: planId,
    subscriptionStatus: status,
    status,
    subscriptionId,
    currentPeriodEnd: currentPeriodEnd || null,
  } as CanonicalSubscriptionState;
}

async function saveCanonicalSubscriptionState(
  userId: string,
  subscriptionId: string,
  state: CanonicalSubscriptionState,
  subscriptionData: Record<string, unknown> = {}
): Promise<void> {
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

async function cacheSubscriptionClaim(userId: string, tier: SubscriptionPlan): Promise<void> {
  try {
    const user = await auth.getUser(userId);
    await auth.setCustomUserClaims(userId, {
      ...(user.customClaims || {}),
      subscriptionTier: tier,
    });
  } catch (error) {
    console.error(`Failed to cache subscription claim for ${userId}:`, error);
  }
}

function assertCreateSubscriptionRequest(
  data: Partial<CreateSubscriptionRequest>
): asserts data is CreateSubscriptionRequest {
  if (!data.planId || !data.userId) {
    throw new HttpsError('invalid-argument', 'planId and userId are required');
  }
}

function assertCancelSubscriptionRequest(
  data: Partial<CancelSubscriptionRequest>
): asserts data is CancelSubscriptionRequest {
  if (!data.subscriptionId) {
    throw new HttpsError('invalid-argument', 'subscriptionId is required');
  }
}

function parsePayPalWebhookEvent(body: unknown): PayPalWebhookEvent {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid PayPal webhook body');
  }

  const event = body as Record<string, unknown>;
  const resource = event.resource;

  if (
    typeof event.id !== 'string' ||
    typeof event.event_type !== 'string' ||
    !resource ||
    typeof resource !== 'object'
  ) {
    throw new Error('Invalid PayPal webhook event');
  }

  const resourceRecord = resource as Record<string, unknown>;

  if (typeof resourceRecord.id !== 'string') {
    throw new Error('Invalid PayPal webhook resource');
  }

  const billingInfo = resourceRecord.billing_info;
  const parsedResource: PayPalWebhookResource = {
    id: resourceRecord.id,
    plan_id: typeof resourceRecord.plan_id === 'string' ? resourceRecord.plan_id : undefined,
    start_time: typeof resourceRecord.start_time === 'string' ? resourceRecord.start_time : undefined,
    billing_info: billingInfo && typeof billingInfo === 'object'
      ? {
          next_billing_time:
            typeof (billingInfo as Record<string, unknown>).next_billing_time === 'string'
              ? (billingInfo as Record<string, string>).next_billing_time
              : undefined,
          failed_payments_count:
            typeof (billingInfo as Record<string, unknown>).failed_payments_count === 'number'
              ? (billingInfo as Record<string, number>).failed_payments_count
              : undefined,
        }
      : undefined,
  };

  return {
    id: event.id,
    event_type: event.event_type,
    resource: parsedResource,
  };
}

async function getPayPalAccessToken(): Promise<string> {
  const clientId = paypalClientId.value();
  const clientSecret = paypalClientSecret.value();

  if (!clientId || !clientSecret) {
    throw new HttpsError('failed-precondition', 'PayPal credentials are not configured');
  }

  try {
    const response = await axios.post<PayPalAccessTokenResponse>(
      `${getPayPalApiBaseUrl()}/v1/oauth2/token`,
      'grant_type=client_credentials',
      {
        auth: {
          username: clientId,
          password: clientSecret,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data.access_token;
  } catch (error: unknown) {
    console.error('Failed to get PayPal access token:', getErrorMessage(error));
    if (isHttpsError(error)) {
      throw error;
    }
    throw new HttpsError('internal', 'Failed to authenticate with PayPal');
  }
}

export const createPayPalSubscription = onCall<CreateSubscriptionRequest>(
  {

    secrets: [paypalClientId, paypalClientSecret],
  },
  async (request): Promise<CreateSubscriptionResponse> => {
    
    const data = request.data as Partial<CreateSubscriptionRequest>;
    
    const context = request.auth;

    if (!context?.uid) {
      throw new HttpsError('unauthenticated', 'User not authenticated');
    }

    assertCreateSubscriptionRequest(data);

    const { planId, userId } = data;
    const PAYPAL_PLANS = getPayPalPlans();
    const planPayPalId = PAYPAL_PLANS[planId];

    if (!planPayPalId) {
      throw new HttpsError('invalid-argument', 'Invalid plan ID');
    }

    if (userId !== context.uid) {
      throw new HttpsError('permission-denied', 'Cannot create subscription for another user');
    }

    try {
      const token = await getPayPalAccessToken();
      const userRecord = await auth.getUser(context.uid);

      if (!userRecord.email) {
        throw new HttpsError('failed-precondition', 'User email is required for PayPal checkout');
      }

      const idempotencyKeyParam = (data as { idempotencyKey?: string }).idempotencyKey;
      const idempotencyKey = typeof idempotencyKeyParam === 'string' && idempotencyKeyParam
        ? idempotencyKeyParam
        : `paypal:${context.uid}:${planId}`;
      const idempotencyReserved = await checkIdempotencyKey(context.uid, idempotencyKey);

      if (!idempotencyReserved) {
        const existingDoc = await db.collection('idempotency_keys').doc(`${context.uid}_${idempotencyKey}`).get();
        const existingData = existingDoc.data();
        if (existingDoc.exists && typeof existingData?.subscriptionId === 'string' && existingData.subscriptionId) {
          return {
            subscriptionId: existingData.subscriptionId as string,
            approvalUrl: typeof existingData.approvalUrl === 'string' ? existingData.approvalUrl : '',
            status: typeof existingData.status === 'string' ? existingData.status : 'approval_pending',
          };
        }
      }

      const response = await axios.post<PayPalSubscriptionResponse>(
        `${getPayPalApiBaseUrl()}/v1/billing/subscriptions`,
        {
          plan_id: planPayPalId,
          subscriber: {
            name: {
              given_name: 'User',
            },
            email_address: userRecord.email,
          },
          application_context: {
            brand_name: 'Soma Digital',
            locale: 'en-US',
            user_action: 'SUBSCRIBE_NOW',
            return_url: data.returnUrl || `${frontendUrl.value()}/dashboard?subscription=success`,
            cancel_url: data.cancelUrl || `${frontendUrl.value()}/dashboard?subscription=cancelled`,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const subscriptionId = response.data.id;
      const approvalLink = response.data.links.find(
        (link: PayPalSubscriptionLink) => link.rel === 'approve'
      )?.href;

      if (!approvalLink) {
        throw new Error('No approval URL in PayPal response');
      }

      await saveCanonicalSubscriptionState(
        userId,
        subscriptionId,
        buildCanonicalSubscriptionState(planId, 'expired', subscriptionId, null),
        {
          userId,
          planId,
          paypalSubscriptionId: subscriptionId,
          status: 'approval_pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      );

      await db.collection('idempotency_keys').doc(`${userId}_${idempotencyKey}`).set({
        userId,
        key: idempotencyKey,
        subscriptionId,
        approvalUrl: approvalLink,
        status: 'approval_pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }, { merge: true });

      console.log(`Created PayPal subscription ${subscriptionId} for user ${userId}`);

      return {
        subscriptionId,
        approvalUrl: approvalLink,
        status: response.data.status,
      };
    } catch (error: unknown) {
      console.error('Failed to create PayPal subscription:', getErrorMessage(error));
      if (isHttpsError(error)) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to create subscription');
    }
  }
);

export const paypalWebhook = onRequest(
  {
    secrets: [paypalClientId, paypalClientSecret, paypalWebhookId],
  },
  async (req, res): Promise<void> => {
    try {
      const webhookId = paypalWebhookId.value();
      const token = await getPayPalAccessToken();
      const event = parsePayPalWebhookEvent(req.body);

      const verificationResponse = await axios.post<PayPalVerificationResponse>(
        `${getPayPalApiBaseUrl()}/v1/notifications/verify-webhook-signature`,
        {
          transmission_id: req.headers['paypal-transmission-id'],
          transmission_time: req.headers['paypal-transmission-time'],
          cert_url: req.headers['paypal-cert-url'],
          auth_algo: req.headers['paypal-auth-algo'],
          transmission_sig: req.headers['paypal-transmission-sig'],
          webhook_id: webhookId,
          webhook_event: req.body,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

    if (verificationResponse.data.verification_status !== 'SUCCESS') {
      console.warn('Invalid webhook signature');
      res.status(401).send('Invalid signature');
      return;
    }

    const eventType = event.event_type;
    const resource = event.resource;
    const subscriptionId = resource.id;

    // Acquire distributed lock FIRST (before duplicate check) to prevent race conditions
    const lockAcquired = await acquireWebhookLock(event.id, subscriptionId);
    if (!lockAcquired) {
      // Another instance is processing this event - return 200 to prevent retry storm
      res.status(200).json({ success: true, duplicate: true, reason: 'concurrent_processing' });
      return;
    }

    try {
      const eventRef = db.collection('webhook_events').doc(event.id);
      const eventExists = await eventRef.get();

      if (eventExists.exists) {
        console.log(`Webhook event ${event.id} already processed`);
        res.status(200).json({ success: true, message: 'Already processed' });
        return;
      }

      await eventRef.set({
        eventId: event.id,
        eventType,
        subscriptionId,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'processing',
      });

      const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
      const subscriptionSnap = await subscriptionRef.get();

      if (!subscriptionSnap.exists) {
        console.warn(`Subscription ${subscriptionId} not found`);
        await eventRef.update({ status: 'skipped', reason: 'subscription_not_found' });
        res.status(200).json({ success: true, message: 'Subscription not found' });
        return;
      }

      const subscriptionData = subscriptionSnap.data();
      const userId = typeof subscriptionData?.userId === 'string' ? subscriptionData.userId : '';
      const planId = normalizePlanId(subscriptionData?.planId || resource.plan_id);

      if (!userId) {
        console.warn(`No userId for subscription ${subscriptionId}`);
        await eventRef.update({ status: 'skipped', reason: 'no_user_id' });
        res.status(200).json({ success: true, message: 'No userId' });
        return;
      }

      if (eventType === 'BILLING.SUBSCRIPTION.CREATED') {
        await saveCanonicalSubscriptionState(
          userId,
          subscriptionId,
          buildCanonicalSubscriptionState(planId, 'expired', subscriptionId, null),
          { status: 'created', eventType }
        );
      } else if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
        const currentPeriodEnd = resource.billing_info?.next_billing_time
          ? new Date(resource.billing_info.next_billing_time).toISOString()
          : resource.start_time
            ? new Date(
                new Date(resource.start_time).setMonth(
                  new Date(resource.start_time).getMonth() + (planToDuration[planId] || 1)
                )
              ).toISOString()
            : null;

        await saveCanonicalSubscriptionState(
          userId,
          subscriptionId,
          buildCanonicalSubscriptionState(planId, 'active', subscriptionId, currentPeriodEnd),
          { status: 'active', currentPeriodEnd, eventType }
        );

        await cacheSubscriptionClaim(userId, planId);

        await createNotification(
          userId,
          'subscription',
          'Subscription activated',
          'Your plan is now active. Enjoy premium access.',
          '/settings/billing'
        );

        console.log(`Activated subscription ${subscriptionId} for user ${userId}`);
      } else if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
        const failedPaymentsCount = resource.billing_info?.failed_payments_count || 1;
        const currentPeriodEnd = subscriptionData?.currentPeriodEnd || null;

        await saveCanonicalSubscriptionState(
          userId,
          subscriptionId,
          buildCanonicalSubscriptionState(planId, 'past_due', subscriptionId, currentPeriodEnd),
          {
            status: 'past_due',
            failedPaymentsCount,
            lastPaymentFailedAt: admin.firestore.FieldValue.serverTimestamp(),
            eventType,
          }
        );

        await createNotification(
          userId,
          'subscription',
          'Payment failed',
          "We couldn't process your payment. Please update your payment method to keep your subscription active.",
          '/settings/billing'
        );

        console.log(`Payment failed for subscription ${subscriptionId}, attempt ${failedPaymentsCount}`);
      } else if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
        await saveCanonicalSubscriptionState(
          userId,
          subscriptionId,
          buildCanonicalSubscriptionState(planId, 'suspended', subscriptionId, null),
          {
            status: 'suspended',
            suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
            eventType,
          }
        );

        await cacheSubscriptionClaim(userId, 'explorer');

        await createNotification(
          userId,
          'subscription',
          'Subscription suspended',
          'Your subscription has been suspended due to payment issues. Please contact support.',
          '/settings/billing'
        );
      } else if (eventType === 'BILLING.SUBSCRIPTION.RE-ACTIVATED') {
        const currentPeriodEnd = resource.billing_info?.next_billing_time
          ? new Date(resource.billing_info.next_billing_time).toISOString()
          : null;

        await saveCanonicalSubscriptionState(
          userId,
          subscriptionId,
          buildCanonicalSubscriptionState(planId, 'active', subscriptionId, currentPeriodEnd),
          {
            status: 'active',
            reactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
            eventType,
          }
        );

      await cacheSubscriptionClaim(userId, planId);

        await createNotification(
          userId,
          'subscription',
          'Subscription reactivated',
          'Welcome back! Your subscription is now active.',
          '/settings/billing'
        );
      } else if (eventType === 'BILLING.SUBSCRIPTION.UPDATED') {
        const currentPeriodEnd = resource.billing_info?.next_billing_time
          ? new Date(resource.billing_info.next_billing_time).toISOString()
          : null;

        await saveCanonicalSubscriptionState(
          userId,
          subscriptionId,
          buildCanonicalSubscriptionState(planId, 'active', subscriptionId, currentPeriodEnd),
          {
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            eventType,
          }
        );

        await cacheSubscriptionClaim(userId, planId);
      } else if (
        eventType === 'BILLING.SUBSCRIPTION.CANCELLED' ||
        eventType === 'BILLING.SUBSCRIPTION.EXPIRED'
      ) {
        const status: SubscriptionStatus = eventType === 'BILLING.SUBSCRIPTION.CANCELLED'
          ? 'cancelled'
          : 'expired';

        await saveCanonicalSubscriptionState(
          userId,
          subscriptionId,
          buildCanonicalSubscriptionState(planId, status, subscriptionId, null),
          {
            status,
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            eventType,
          }
        );

        await cacheSubscriptionClaim(userId, 'explorer');

        await createNotification(
          userId,
          'subscription',
          status === 'cancelled' ? 'Subscription cancelled' : 'Subscription expired',
          status === 'cancelled'
            ? 'Your subscription was cancelled. You can rejoin anytime.'
            : 'Your plan has expired. Renew to keep premium access.',
          '/settings/billing'
        );

        console.log(
          `${status === 'cancelled' ? 'Cancelled' : 'Expired'} subscription ${subscriptionId} for user ${userId}`
        );
      }

      await eventRef.update({ status: 'success' });
      res.status(200).json({ success: true });
    } catch (processingError: unknown) {
      console.error('Webhook processing error:', getErrorMessage(processingError));
      // Update event with error
      try {
        await db.collection('webhook_events').doc(event.id).update({
          status: 'error',
          error: processingError instanceof Error ? processingError.message : 'Unknown error',
        });
      } catch { /* ignore */ }
      // Return 500 to trigger provider retry
      res.status(500).json({ error: 'Processing failed' });
    } finally {
      await releaseWebhookLock(event.id, subscriptionId);
    }
  } catch (error: unknown) {
    console.error('Webhook fatal error:', getErrorMessage(error));
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export const checkSubscriptionStatus = onCall(
  { secrets: [paypalClientId, paypalClientSecret] },
  async (request) => {
    const context = request.auth;
    if (!context?.uid) {
      throw new HttpsError('unauthenticated', 'User not authenticated');
    }
    const { userId } = request.data as { userId: string };
    if (userId !== context.uid) {
      throw new HttpsError('permission-denied', 'Cannot check another user\'s subscription');
    }
    try {
      const userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        return { tier: 'explorer', expiresAt: null, status: 'expired', provider: 'none' };
      }
      const subscription = userDoc.data()?.subscription;
      if (subscription?.subscriptionStatus === 'active') {
        return {
          tier: subscription.subscriptionPlan || 'explorer',
          expiresAt: subscription.currentPeriodEnd || null,
          status: subscription.subscriptionStatus,
          provider: subscription.provider || 'unknown',
          subscriptionId: subscription.subscriptionId,
        };
      }
      const subsSnapshot = await db
        .collection('subscriptions')
        .where('userId', '==', userId)
        .where('subscriptionStatus', '==', 'active')
        .orderBy('updatedAt', 'desc')
        .limit(1)
        .get();
      if (subsSnapshot.empty) {
        return { tier: 'explorer', expiresAt: null, status: 'expired', provider: 'none' };
      }
      const subDoc = subsSnapshot.docs[0];
      const subData = subDoc.data();
      return {
        tier: subData.subscriptionPlan || 'explorer',
        expiresAt: subData.currentPeriodEnd || null,
        status: subData.subscriptionStatus || 'expired',
        provider: subData.provider || 'unknown',
        subscriptionId: subDoc.id,
      };
    } catch (error) {
      console.error('Failed to check subscription status:', error);
      throw new HttpsError('internal', 'Failed to check subscription status');
    }
  }
);

export const cancelPayPalSubscription = onCall<CancelSubscriptionRequest>(
  {
    secrets: [paypalClientId, paypalClientSecret],
  },
  async (request): Promise<CancelSubscriptionResponse> => {
    const data = request.data as Partial<CancelSubscriptionRequest>;
    const context = request.auth;

    if (!context?.uid) {
      throw new HttpsError('unauthenticated', 'User not authenticated');
    }

    assertCancelSubscriptionRequest(data);

    const { subscriptionId } = data;
    const userId = context.uid;

    try {
      const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
      const subscriptionSnap = await subscriptionRef.get();

      if (!subscriptionSnap.exists) {
        throw new HttpsError('not-found', 'Subscription not found');
      }

      const subscriptionData = subscriptionSnap.data();

      if (subscriptionData?.userId !== userId) {
        throw new HttpsError('permission-denied', 'Cannot cancel someone else\'s subscription');
      }

      // Only call PayPal API if subscription is still active
      if (subscriptionData?.subscriptionStatus === 'active') {
        try {
          const token = await getPayPalAccessToken();
          await axios.post(
            `${getPayPalApiBaseUrl()}/v1/billing/subscriptions/${subscriptionId}/cancel`,
            { reason: 'User-initiated cancellation' },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            }
          );
        } catch (apiError) {
          // If PayPal says already cancelled, that's fine
          const errorMessage = getErrorMessage(apiError);
          if (!errorMessage.includes('SUBSCRIPTION_ALREADY_CANCELLED') && 
              !errorMessage.includes('ALREADY_CANCELLED')) {
            throw apiError;
          }
          console.log(`PayPal subscription ${subscriptionId} already cancelled`);
        }
      }

      await saveCanonicalSubscriptionState(
        userId,
        subscriptionId,
        buildCanonicalSubscriptionState(
          normalizePlanId(subscriptionData?.planId),
          'cancelled',
          subscriptionId,
          null
        ),
        {
          status: 'user_cancelled',
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancellationReason: 'user_initiated',
        }
      );

      await createNotification(
        userId,
        'subscription',
        'Subscription cancelled',
        'Your subscription has been cancelled successfully.',
        '/settings/billing'
      );

      await cacheSubscriptionClaim(userId, 'explorer');

      console.log(`User ${userId} cancelled subscription ${subscriptionId}`);

      return { success: true };
    } catch (error: unknown) {
      console.error('Failed to cancel PayPal subscription:', getErrorMessage(error));
      if (isHttpsError(error)) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to cancel subscription');
    }
  }
);
