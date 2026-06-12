import * as admin from 'firebase-admin';
import axios, { AxiosError } from 'axios';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createNotification } from './notifications';
import type {
  PayPalAccessTokenResponse,
  PayPalSubscriptionLink,
  PayPalSubscriptionResponse,
  PayPalVerificationResponse,
} from './paypal-types';

const db = admin.firestore();
const auth = admin.auth();

type SubscriptionPlan = 'explorer' | 'pro' | 'elite';
type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'expired';

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
  const user = await auth.getUser(userId);
  await auth.setCustomUserClaims(userId, {
    ...(user.customClaims || {}),
    subscriptionTier: tier,
  });
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
    secrets: [paypalClientId, paypalClientSecret, paypalPlanExplorer, paypalPlanPro, paypalPlanElite],
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
    const eventRef = db.collection('webhook_events').doc(event.id);
    const eventExists = await eventRef.get();

    if (eventExists.exists) {
      console.log(`Webhook event ${event.id} already processed`);
      res.status(200).json({ success: true });
      return;
    }

    await eventRef.set({
      eventId: event.id,
      eventType,
      subscriptionId,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
    const subscriptionSnap = await subscriptionRef.get();

    if (!subscriptionSnap.exists) {
      console.warn(`Subscription ${subscriptionId} not found`);
      res.status(200).json({ success: true });
      return;
    }

    const subscriptionData = subscriptionSnap.data();
    const userId = typeof subscriptionData?.userId === 'string' ? subscriptionData.userId : '';
    const planId = normalizePlanId(subscriptionData?.planId || resource.plan_id);

    if (!userId) {
      console.warn(`No userId for subscription ${subscriptionId}`);
      res.status(200).json({ success: true });
      return;
    }

    if (eventType === 'BILLING.SUBSCRIPTION.CREATED') {
      await saveCanonicalSubscriptionState(
        userId,
        subscriptionId,
        buildCanonicalSubscriptionState(planId, 'expired', subscriptionId, null),
        {
        status: 'created',
      });
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
        {
        status: 'active',
        currentPeriodEnd,
      });

      await cacheSubscriptionClaim(userId, planId);

      await createNotification(
        userId,
        'subscription',
        'Subscription activated',
        'Your plan is now active. Enjoy premium access.',
        '/settings/billing'
      );

      console.log(`Activated subscription ${subscriptionId} for user ${userId}`);
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
      });

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

    res.status(200).json({ success: true });
  } catch (error: unknown) {
    console.error('Webhook error:', getErrorMessage(error));
    res.status(200).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

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

      const token = await getPayPalAccessToken();
      await axios.post(
        `${getPayPalApiBaseUrl()}/v1/billing/subscriptions/${subscriptionId}/cancel`,
        { reason: 'User-initiated cancellation' },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

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
      });

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
