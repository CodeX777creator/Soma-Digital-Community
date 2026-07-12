import * as admin from 'firebase-admin';
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString, defineInt } from 'firebase-functions/params';
import axios from 'axios';
import crypto from 'crypto';
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
import type { Request } from 'express';

const db = admin.firestore();
const auth = admin.auth();

// Define params
const paystackSecretKey = defineSecret('PAYSTACK_SECRET_KEY');
const paystackCurrency = defineString('PAYSTACK_CURRENCY', { default: 'USD' });
const frontendUrl = defineString('FRONTEND_URL', { default: 'https://soma-digital-community.vercel.app' });
const paystackAmountExplorer = defineInt('PAYSTACK_AMOUNT_EXPLORER', { default: 0 });
const paystackAmountPro = defineInt('PAYSTACK_AMOUNT_PRO', { default: 970000 });
const paystackAmountElite = defineInt('PAYSTACK_AMOUNT_ELITE', { default: 2970000 });

const PAYSTACK_API_BASE_URL = 'https://api.paystack.co';

function getPaystackHeaders(secretKey: string) {
  return {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };
}

function getPaystackAmounts(): Record<SubscriptionPlan, number> {
  return {
    explorer: paystackAmountExplorer.value(),
    pro: paystackAmountPro.value(),
    elite: paystackAmountElite.value(),
  };
}

type SubscriptionPlan = 'explorer' | 'pro' | 'elite';
type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'expired' | 'suspended';

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

interface CreateAssetPurchaseRequest {
  assetId: string;
  userId: string;
  resellerSlug?: string;
  idempotencyKey?: string;
  mrrLicenseAccepted?: boolean;
  mrrLicenseVersion?: string;
}

interface CreateAssetPurchaseResponse {
  purchaseId: string;
  authorizationUrl: string | null;
  status: string;
  message?: string;
}

interface CreatorCreditBundle {
  id: string;
  label: string;
  credits: number;
  priceCents: number;
  currency: string;
  sortOrder: number;
  active: boolean;
}

interface CreatorCreditConfig {
  tierAllocations?: Record<string, number>;
  bundles?: CreatorCreditBundle[];
  version?: number;
}

interface CreateCreditPurchaseRequest {
  bundleId: string;
  userId: string;
  idempotencyKey?: string;
}

interface CreateCreditPurchaseResponse {
  purchaseId: string;
  authorizationUrl: string | null;
  status: string;
  message?: string;
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

  // Only update user tier if subscription is active
  // This prevents users from appearing upgraded during pending/cancelled states
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
    // For non-active states, only update the subscription object without changing tier
    // This preserves the user's current tier until payment is confirmed
    batch.set(
      userRef,
      {
        subscription: {
          ...state,
          updatedAt: timestamp,
        },
        updatedAt: timestamp,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

async function cacheSubscriptionClaim(userId: string, tier: SubscriptionPlan) {
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

const defaultCreditBundles: CreatorCreditBundle[] = [
  { id: 'credits_5', label: '5 Credits', credits: 5, priceCents: 125, currency: 'USD', sortOrder: 10, active: true },
  { id: 'credits_10', label: '10 Credits', credits: 10, priceCents: 225, currency: 'USD', sortOrder: 20, active: true },
  { id: 'credits_25', label: '25 Credits', credits: 25, priceCents: 500, currency: 'USD', sortOrder: 30, active: true },
  { id: 'credits_50', label: '50 Credits', credits: 50, priceCents: 450, currency: 'USD', sortOrder: 40, active: true },
  { id: 'credits_100', label: '100 Credits', credits: 100, priceCents: 800, currency: 'USD', sortOrder: 50, active: true },
  { id: 'credits_250', label: '250 Credits', credits: 250, priceCents: 1750, currency: 'USD', sortOrder: 60, active: true },
];

function normalizeCreditBundles(config: CreatorCreditConfig | undefined): CreatorCreditBundle[] {
  const rawBundles = Array.isArray(config?.bundles) ? config.bundles : defaultCreditBundles;
  const seen = new Set<string>();
  const bundles = rawBundles
    .map((bundle, index) => {
      if (!bundle || typeof bundle !== 'object') return null;
      const id = typeof bundle.id === 'string' ? bundle.id.trim() : '';
      const credits = typeof bundle.credits === 'number' && Number.isFinite(bundle.credits) ? bundle.credits : 0;
      const priceCents = typeof bundle.priceCents === 'number' && Number.isFinite(bundle.priceCents) ? bundle.priceCents : -1;
      if (!id || seen.has(id) || credits <= 0 || priceCents < 0) return null;
      seen.add(id);
      return {
        id,
        label: typeof bundle.label === 'string' && bundle.label.trim() ? bundle.label.trim() : `${credits} Credits`,
        credits,
        priceCents,
        currency: typeof bundle.currency === 'string' && bundle.currency.trim() ? bundle.currency.trim().toUpperCase() : 'USD',
        sortOrder: typeof bundle.sortOrder === 'number' && Number.isFinite(bundle.sortOrder) ? bundle.sortOrder : (index + 1) * 10,
        active: bundle.active !== false,
      };
    })
    .filter((bundle): bundle is CreatorCreditBundle => Boolean(bundle))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.credits - b.credits);

  return bundles.length ? bundles : defaultCreditBundles;
}

async function getActiveCreditBundle(bundleId: string): Promise<CreatorCreditBundle | null> {
  const snap = await db.collection('config').doc('creatorCredits').get();
  const config = snap.exists ? snap.data() as CreatorCreditConfig : undefined;
  return normalizeCreditBundles(config).find((bundle) => bundle.id === bundleId && bundle.active) || null;
}

async function processCreditPurchaseWebhook(eventId: string, eventType: string, data: any) {
  if (data?.metadata?.kind !== 'creator_credit_purchase') {
    return { handled: false };
  }

  const purchaseId = typeof data.metadata.purchaseId === 'string' ? data.metadata.purchaseId : '';
  const userId = typeof data.metadata.userId === 'string' ? data.metadata.userId : '';
  if (!purchaseId || !userId) {
    return { handled: true, response: { success: true, ignored: true, reason: 'missing_credit_purchase_metadata' } };
  }

  const purchaseRef = db.collection('creatorCreditPurchases').doc(purchaseId);
  const purchaseSnap = await purchaseRef.get();
  if (!purchaseSnap.exists) {
    return { handled: true, response: { success: true, ignored: true, reason: 'credit_purchase_not_found' } };
  }

  const purchase = purchaseSnap.data() || {};
  if (purchase.status === 'paid') {
    return { handled: true, response: { success: true, duplicate: true } };
  }

  if (eventType !== 'charge.success') {
    await purchaseRef.set({
      status: eventType === 'charge.failed' ? 'failed' : 'ignored',
      eventType,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { handled: true, response: { success: true, ignored: true, reason: 'non_success_credit_event' } };
  }

  const credits = typeof purchase.credits === 'number' && Number.isFinite(purchase.credits) ? purchase.credits : Number(data.metadata.credits || 0);
  if (credits <= 0) {
    await purchaseRef.set({
      status: 'failed',
      failureReason: 'invalid_credit_amount',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { handled: true, response: { success: true, ignored: true, reason: 'invalid_credit_amount' } };
  }

  await db.runTransaction(async (transaction) => {
    const freshPurchase = await transaction.get(purchaseRef);
    if (freshPurchase.data()?.status === 'paid') return;

    transaction.set(purchaseRef, {
      status: 'paid',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      eventId,
      paystackReference: data.reference || purchase.paystackReference || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(db.collection('users').doc(userId), {
      credits: {
        purchased: admin.firestore.FieldValue.increment(credits),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  await createNotification(
    userId,
    'success',
    'Creator Credits added',
    `${credits} Creator Credits have been added to your account.`,
    '/settings/credits'
  );

  return { handled: true, response: { success: true, flow: 'creator_credit_purchase' } };
}

async function processAssetPurchaseWebhook(
  eventId: string,
  eventType: string,
  data: any
): Promise<{ handled: boolean; response?: Record<string, unknown> }> {
  const metadata = data?.metadata || {};
  if (metadata.kind !== 'asset_purchase') {
    return { handled: false };
  }

  const purchaseId = typeof metadata.purchaseId === 'string' ? metadata.purchaseId : '';
  const assetId = typeof metadata.assetId === 'string' ? metadata.assetId : '';
  const userId = typeof metadata.userId === 'string' ? metadata.userId : '';
  const resellerUserId = typeof metadata.resellerUserId === 'string' ? metadata.resellerUserId : null;

  if (!purchaseId || !assetId || !userId) {
    await archiveWebhookEvent(eventId, eventType, String(data?.reference || 'unknown'), data, false, 'missing_asset_purchase_metadata');
    return { handled: true, response: { success: true, ignored: true, reason: 'missing_asset_purchase_metadata' } };
  }

  const purchaseRef = db.collection('assetPurchases').doc(purchaseId);
  const purchaseSnap = await purchaseRef.get();
  const purchase = purchaseSnap.data() || {};
  const grossAmount = typeof purchase.pricePaid === 'number'
    ? purchase.pricePaid
    : typeof data?.amount === 'number'
      ? data.amount / 100
      : 0;

  if (eventType !== 'charge.success') {
    await purchaseRef.set({
      status: eventType === 'charge.failed' ? 'failed' : 'payment_pending',
      lastEventType: eventType,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await archiveWebhookEvent(eventId, eventType, String(data?.reference || purchaseId), data, true);
    return { handled: true, response: { success: true, ignored: true, reason: 'non_success_asset_purchase_event' } };
  }

  await purchaseRef.set({
    status: 'paid',
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    paystackReference: data?.reference || purchase.paystackReference || null,
  }, { merge: true });

  if (resellerUserId) {
    const assetSnap = await db.collection('marketplaceAssets').doc(assetId).get();
    const asset = assetSnap.data() || {};
    const commissionType = asset.resellerCommissionType === 'fixed' ? 'fixed' : 'percentage';
    const commissionValue = typeof asset.resellerCommissionValue === 'number' ? asset.resellerCommissionValue : 0;
    const commissionBase = asset.commissionBase === 'course_price' ? 'course_price' : 'full_price';
    const courseValue = typeof asset.courseValue === 'number' ? asset.courseValue : grossAmount;
    const commissionableAmount = commissionBase === 'course_price' ? courseValue : grossAmount;
    const resellerEarnings = commissionType === 'fixed'
      ? Math.min(commissionValue, commissionableAmount)
      : Math.round(commissionableAmount * commissionValue) / 100;

    await db.collection('resellerSales').doc(`${purchaseId}_${eventId}`).set({
      resellerUserId,
      buyerUserId: userId,
      assetId,
      purchaseId,
      grossAmount,
      commissionBase,
      commissionableAmount,
      platformFee: Math.max(0, grossAmount - resellerEarnings),
      resellerEarnings,
      commissionType,
      commissionValue,
      status: 'payable',
      provider: 'paystack',
      paystackReference: data?.reference || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await createNotification(
    userId,
    'marketplace',
    'Course purchase confirmed',
    'Your marketplace course is now available in your account.',
    '/marketplace'
  );
  await archiveWebhookEvent(eventId, eventType, String(data?.reference || purchaseId), data, true);

  return { handled: true, response: { success: true } };
}

/**
 * Generate a unique, deterministic event ID for webhook deduplication
 * Uses both Paystack event ID and payload hash for robustness
 */
function generateEventId(body: any): string {
  const data = body?.data;
  const eventType = body?.event || 'unknown';
  
  // If Paystack provides an event ID, use it with subscription reference
  if (data?.id && data?.reference) {
    return `paystack-${data.id}-${data.reference}`;
  }
  
  // Fallback: deterministic hash of the entire payload
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex')
    .slice(0, 32);
  
  const subscriptionId = data?.reference || data?.subscription_code || 'unknown';
  return `paystack-${eventType}-${subscriptionId}-${payloadHash}`;
}

/**
 * Verify Paystack webhook signature using raw body
 * IMPORTANT: Requires Firebase Functions to preserve raw body
 * See: https://firebase.google.com/docs/functions/http-events
 */
function verifyPaystackSignature(req: Request, secretKey: string): boolean {
  const signatureHeader = req.headers['x-paystack-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!signature || !secretKey) {
    console.warn('Missing signature or secret key');
    return false;
  }

  // Get raw body - try multiple methods for Firebase Functions v2 compatibility
  let rawBody: string | null = null;
  
  // Method 1: Check for rawBody (set by Firebase Functions when body parsing is disabled)
  if ((req as any).rawBody) {
    rawBody = (req as any).rawBody.toString('utf8');
  }
  // Method 2: Buffer body
  else if (Buffer.isBuffer(req.body)) {
    rawBody = req.body.toString('utf8');
  }
  // Method 3: String body
  else if (typeof req.body === 'string') {
    rawBody = req.body;
  }
  // Method 4: Object body - MUST re-serialize exactly as received
  else if (req.body && typeof req.body === 'object') {
    // This is risky as middleware may have modified the body
    // Log warning for debugging
    console.warn('Re-serializing body - signature may fail if body was modified by middleware');
    rawBody = JSON.stringify(req.body);
  }

  if (!rawBody) {
    console.error('Could not extract raw body from request');
    return false;
  }

  const computedSignature = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const computedBuffer = Buffer.from(computedSignature, 'hex');
    if (sigBuffer.length !== computedBuffer.length) {
      console.warn('Signature length mismatch');
      return false;
    }
    return crypto.timingSafeEqual(sigBuffer, computedBuffer);
  } catch (error) {
    console.error('Signature comparison failed:', error);
    return false;
  }
}

export const initializePaystackTransaction = onCall<InitializeTransactionRequest>(
  {
    secrets: [paystackSecretKey],
  },
  async (request): Promise<InitializeTransactionResponse> => {
    const { email, amount, plan, metadata } = request.data;
    const secretKey = paystackSecretKey.value();

    if (typeof email !== 'string' || !isValidEmail(email)) {
      throw new HttpsError('invalid-argument', 'A valid email address is required');
    }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpsError('invalid-argument', 'Amount must be greater than 0');
    }

    if (!secretKey) {
      throw new HttpsError('internal', 'Paystack secret key is not configured');
    }

    try {
      const response = await axios.post(
        `${PAYSTACK_API_BASE_URL}/transaction/initialize`,
        { email, amount, ...(plan ? { plan } : {}), ...(metadata ? { metadata } : {}) },
        { headers: getPaystackHeaders(secretKey) }
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
 * Includes idempotency check to prevent duplicate subscriptions
 */
export const createPaystackSubscription = onCall(
  {
    secrets: [paystackSecretKey],
  },
  async (request) => {
    const data = request.data;
    const context = request.auth;
    const secretKey = paystackSecretKey.value();
    const callbackUrl = `${frontendUrl.value()}/dashboard?subscription=success`;

    if (!context?.uid) {
      throw new HttpsError('unauthenticated', 'User not authenticated');
    }

    if (!secretKey) {
      throw new HttpsError('failed-precondition', 'Paystack secret key is not configured');
    }

    const { planId, userId } = data as { planId: SubscriptionPlan; userId: string };
    const normalizedPlanId = normalizePlanId(planId);
    const idempotencyKeyParam = (data as { idempotencyKey?: string }).idempotencyKey;
    const idempotencyKey = typeof idempotencyKeyParam === 'string' && idempotencyKeyParam
      ? idempotencyKeyParam
      : `paystack:${context.uid}:${normalizedPlanId}`;
    const idempotencyReserved = await checkIdempotencyKey(context.uid, idempotencyKey);

    if (!idempotencyReserved) {
      const existingDoc = await db.collection('idempotency_keys').doc(`${context.uid}_${idempotencyKey}`).get();
      const existingData = existingDoc.data();
      if (existingDoc.exists && typeof existingData?.subscriptionId === 'string' && existingData.subscriptionId) {
        return {
          subscriptionId: existingData.subscriptionId as string,
          authorizationUrl: typeof existingData.authorizationUrl === 'string' ? existingData.authorizationUrl : '',
        };
      }

      throw new HttpsError(
        'aborted',
        'Your checkout is still being prepared. Please try again in a moment.'
      );
    }
    const PAYSTACK_AMOUNTS = getPaystackAmounts();
    const amount = PAYSTACK_AMOUNTS[normalizedPlanId];

    if (!amount || !callbackUrl) {
      throw new HttpsError('invalid-argument', 'Invalid Paystack plan configuration');
    }

    if (userId !== context.uid) {
      throw new HttpsError('permission-denied', 'Cannot create subscription for another user');
    }

    // IDEMPOTENCY CHECK: Check for existing pending or active subscription
    const existingSubQuery = await db
      .collection('subscriptions')
      .where('userId', '==', userId)
      .where('planId', '==', normalizedPlanId)
      .where('status', 'in', ['approval_pending', 'active'])
      .limit(1)
      .get();
    
    if (!existingSubQuery.empty) {
      const existingSub = existingSubQuery.docs[0];
      const existingData = existingSub.data();
      
      // If already active, return success
      if (existingData.status === 'active') {
        console.log(`User ${userId} already has active ${normalizedPlanId} subscription`);
        return { 
          subscriptionId: existingSub.id, 
          authorizationUrl: null,
          status: 'already_active',
          message: 'You already have an active subscription for this plan'
        };
      }
      
      // If pending, check if it's recent (< 1 hour) and return existing URL
      const createdAt = existingData.createdAt?.toDate?.();
      if (createdAt && (Date.now() - createdAt.getTime()) < 60 * 60 * 1000) {
        console.log(`User ${userId} has pending subscription, returning existing URL`);
        return { 
          subscriptionId: existingSub.id, 
          authorizationUrl: existingData.authorizationUrl || null,
          status: 'pending',
          message: 'You have a pending subscription. Complete payment or wait for it to expire.'
        };
      }
      
      // Old pending subscription - clean it up and create new one
      console.log(`Cleaning up expired pending subscription for user ${userId}`);
      await existingSub.ref.update({
        status: 'expired',
        expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        expiryReason: 'superseded_by_new_attempt'
      });
    }

    // Also check if user has any active subscription on a DIFFERENT plan
    const activeSubQuery = await db
      .collection('subscriptions')
      .where('userId', '==', userId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!activeSubQuery.empty) {
      const activeSub = activeSubQuery.docs[0];
      const activeData = activeSub.data();
      
      if (activeData.planId !== normalizedPlanId) {
        // User is trying to change plans - this should use the change plan flow
        console.warn(`User ${userId} attempted to create new subscription while having active ${activeData.planId} subscription`);
        throw new HttpsError(
          'failed-precondition', 
          `You already have an active ${activeData.planId} subscription. Please use the change plan feature to switch plans.`,
          { currentPlan: activeData.planId, requestedPlan: normalizedPlanId }
        );
      }
    }

    const userRecord = await auth.getUser(context.uid);
    const email = userRecord.email;
    if (!email) {
      throw new HttpsError('failed-precondition', 'User email is required for Paystack checkout');
    }

    try {
      const response = await axios.post(
        `${PAYSTACK_API_BASE_URL}/transaction/initialize`,
        {
          email,
          amount,
          currency: paystackCurrency.value(),
          callback_url: callbackUrl,
          metadata: { planId: normalizedPlanId, userId, provider: 'paystack' },
        },
        { headers: getPaystackHeaders(secretKey) }
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
          authorizationUrl, // Store for idempotency recovery
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      );

      await db.collection('idempotency_keys').doc(`${userId}_${idempotencyKey}`).set({
        userId,
        key: idempotencyKey,
        provider: 'paystack',
        planId: normalizedPlanId,
        subscriptionId,
        authorizationUrl,
        status: 'approval_pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }, { merge: true });

      return { subscriptionId, authorizationUrl, status: 'created' };
    } catch (error) {
      console.error('Failed to create Paystack subscription:', error);
      throw new HttpsError('internal', 'Failed to create Paystack subscription');
    }
  }
);

export const createPaystackAssetPurchase = onCall(
  {
    secrets: [paystackSecretKey],
  },
  async (request): Promise<CreateAssetPurchaseResponse> => {
    const data = request.data as Partial<CreateAssetPurchaseRequest>;
    const context = request.auth;
    const secretKey = paystackSecretKey.value();
    const callbackUrl = `${frontendUrl.value()}/marketplace/success?assetId=${encodeURIComponent(String(data.assetId || ''))}`;

    if (!context?.uid) {
      throw new HttpsError('unauthenticated', 'User not authenticated');
    }

    if (!secretKey) {
      throw new HttpsError('failed-precondition', 'Paystack secret key is not configured');
    }

    const assetId = typeof data.assetId === 'string' ? data.assetId : '';
    const userId = typeof data.userId === 'string' ? data.userId : '';
    const resellerSlug = typeof data.resellerSlug === 'string' ? data.resellerSlug : null;

    if (!assetId || !userId) {
      throw new HttpsError('invalid-argument', 'assetId and userId are required');
    }

    if (userId !== context.uid) {
      throw new HttpsError('permission-denied', 'Cannot create purchase for another user');
    }

    const assetSnap = await db.collection('marketplaceAssets').doc(assetId).get();
    if (!assetSnap.exists || assetSnap.data()?.published === false) {
      throw new HttpsError('not-found', 'Asset not found');
    }

    const asset = assetSnap.data() || {};
    const price = typeof asset.price === 'number' ? asset.price : 0;
    if (price <= 0) {
      throw new HttpsError('failed-precondition', 'This asset does not require purchase');
    }

    const licenseType = asset.licenseType === 'mrr' ? 'mrr' : 'standard';
    const resaleRights = licenseType === 'mrr' && asset.resaleEnabled === true;
    if (resaleRights && data.mrrLicenseAccepted !== true) {
      throw new HttpsError('failed-precondition', 'You must accept the MRR license agreement before purchasing this course.');
    }

    const purchaseId = `${userId}_${assetId}`;
    const purchaseRef = db.collection('assetPurchases').doc(purchaseId);
    const existingPurchase = await purchaseRef.get();
    const existingData = existingPurchase.data();
    if (existingPurchase.exists && existingData?.status === 'paid') {
      return {
        purchaseId,
        authorizationUrl: null,
        status: 'already_owned',
        message: 'You already own this asset',
      };
    }

    if (
      existingPurchase.exists &&
      existingData?.status === 'approval_pending' &&
      typeof existingData.authorizationUrl === 'string' &&
      existingData.authorizationUrl
    ) {
      return {
        purchaseId,
        authorizationUrl: existingData.authorizationUrl,
        status: 'pending',
      };
    }

    const idempotencyKey = data.idempotencyKey || `paystack-asset:${userId}:${assetId}`;
    const idempotencyReserved = await checkIdempotencyKey(userId, idempotencyKey);
    if (!idempotencyReserved) {
      const existingKey = await db.collection('idempotency_keys').doc(`${userId}_${idempotencyKey}`).get();
      const existingKeyData = existingKey.data();
      if (typeof existingKeyData?.authorizationUrl === 'string' && existingKeyData.authorizationUrl) {
        return {
          purchaseId,
          authorizationUrl: existingKeyData.authorizationUrl,
          status: typeof existingKeyData.status === 'string' ? existingKeyData.status : 'approval_pending',
        };
      }
      throw new HttpsError('aborted', 'Your checkout is still being prepared. Please try again in a moment.');
    }

    const userRecord = await auth.getUser(context.uid);
    if (!userRecord.email) {
      throw new HttpsError('failed-precondition', 'User email is required for Paystack checkout');
    }

    const resellerLinkSnap = resellerSlug
      ? await db.collection('resellerLinks').where('slug', '==', resellerSlug).where('assetId', '==', assetId).limit(1).get()
      : null;
    const resellerLink = resellerLinkSnap && !resellerLinkSnap.empty ? resellerLinkSnap.docs[0].data() : null;
    const resellerUserId = typeof resellerLink?.userId === 'string' && resellerLink.userId !== userId
      ? resellerLink.userId
      : null;

    try {
      const response = await axios.post(
        `${PAYSTACK_API_BASE_URL}/transaction/initialize`,
        {
          email: userRecord.email,
          amount: Math.round(price * 100),
          currency: paystackCurrency.value(),
          callback_url: callbackUrl,
          metadata: {
            kind: 'asset_purchase',
            purchaseId,
            assetId,
            userId,
            resellerSlug,
            resellerUserId,
          },
        },
        { headers: getPaystackHeaders(secretKey) }
      );

      const transaction = response.data.data;
      const authorizationUrl = transaction.authorization_url;
      const paystackReference = transaction.reference;

      if (!authorizationUrl || !paystackReference) {
        throw new Error('Paystack did not return a checkout URL');
      }

      await purchaseRef.set({
        userId,
        uid: userId,
        assetId,
        assetTitle: typeof asset.title === 'string' ? asset.title : 'Marketplace asset',
        pricePaid: price,
        currency: paystackCurrency.value(),
        provider: 'paystack',
        paystackReference,
        authorizationUrl,
        status: 'approval_pending',
        licenseType,
        resaleRights,
        mrrLicenseAccepted: resaleRights ? true : false,
        mrrLicenseAcceptedAt: resaleRights ? admin.firestore.FieldValue.serverTimestamp() : null,
        mrrLicenseVersion: resaleRights
          ? (typeof data.mrrLicenseVersion === 'string' && data.mrrLicenseVersion ? data.mrrLicenseVersion : 'sdc-mrr-v1')
          : null,
        commissionBase: asset.commissionBase === 'course_price' ? 'course_price' : 'full_price',
        courseValue: typeof asset.courseValue === 'number' ? asset.courseValue : price,
        externalPlatform: typeof asset.externalPlatform === 'string' ? asset.externalPlatform : '',
        provisioningStatus: asset.externalPlatform ? 'access_pending' : 'not_required',
        resellerSlug,
        resellerUserId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await db.collection('idempotency_keys').doc(`${userId}_${idempotencyKey}`).set({
        userId,
        key: idempotencyKey,
        provider: 'paystack',
        purchaseId,
        assetId,
        authorizationUrl,
        status: 'approval_pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }, { merge: true });

      return { purchaseId, authorizationUrl, status: 'created' };
    } catch (error) {
      console.error('Failed to create Paystack asset purchase:', error);
      throw new HttpsError('internal', 'Failed to create asset purchase');
    }
  }
);

export const createPaystackCreditPurchase = onCall(
  {
    secrets: [paystackSecretKey],
  },
  async (request): Promise<CreateCreditPurchaseResponse> => {
    const data = request.data as Partial<CreateCreditPurchaseRequest>;
    const context = request.auth;
    const secretKey = paystackSecretKey.value();

    if (!context?.uid) {
      throw new HttpsError('unauthenticated', 'User not authenticated');
    }

    if (!secretKey) {
      throw new HttpsError('failed-precondition', 'Paystack secret key is not configured');
    }

    const bundleId = typeof data.bundleId === 'string' ? data.bundleId : '';
    const userId = typeof data.userId === 'string' ? data.userId : '';
    if (!bundleId || !userId) {
      throw new HttpsError('invalid-argument', 'bundleId and userId are required');
    }

    if (userId !== context.uid) {
      throw new HttpsError('permission-denied', 'Cannot create credit purchase for another user');
    }

    const bundle = await getActiveCreditBundle(bundleId);
    if (!bundle) {
      throw new HttpsError('not-found', 'Creator Credit bundle is not available');
    }

    const purchaseId = `${userId}_${bundle.id}_${Date.now()}`;
    const idempotencyKey = data.idempotencyKey || `paystack-credits:${userId}:${bundle.id}`;
    const idempotencyReserved = await checkIdempotencyKey(userId, idempotencyKey);
    if (!idempotencyReserved) {
      const existingKey = await db.collection('idempotency_keys').doc(`${userId}_${idempotencyKey}`).get();
      const existingKeyData = existingKey.data();
      if (typeof existingKeyData?.authorizationUrl === 'string' && existingKeyData.authorizationUrl) {
        return {
          purchaseId: String(existingKeyData.purchaseId || purchaseId),
          authorizationUrl: existingKeyData.authorizationUrl,
          status: typeof existingKeyData.status === 'string' ? existingKeyData.status : 'approval_pending',
        };
      }
      throw new HttpsError('aborted', 'Your checkout is still being prepared. Please try again in a moment.');
    }

    const userRecord = await auth.getUser(context.uid);
    if (!userRecord.email) {
      throw new HttpsError('failed-precondition', 'User email is required for Paystack checkout');
    }

    const callbackUrl = `${frontendUrl.value()}/settings/credits?purchase=success`;
    const purchaseRef = db.collection('creatorCreditPurchases').doc(purchaseId);

    try {
      const response = await axios.post(
        `${PAYSTACK_API_BASE_URL}/transaction/initialize`,
        {
          email: userRecord.email,
          amount: bundle.priceCents,
          currency: bundle.currency || paystackCurrency.value(),
          callback_url: callbackUrl,
          metadata: {
            kind: 'creator_credit_purchase',
            purchaseId,
            bundleId: bundle.id,
            credits: bundle.credits,
            userId,
          },
        },
        { headers: getPaystackHeaders(secretKey) }
      );

      const transaction = response.data.data;
      const authorizationUrl = transaction.authorization_url;
      const paystackReference = transaction.reference;

      if (!authorizationUrl || !paystackReference) {
        throw new Error('Paystack did not return a checkout URL');
      }

      await purchaseRef.set({
        userId,
        bundleId: bundle.id,
        bundleLabel: bundle.label,
        credits: bundle.credits,
        priceCents: bundle.priceCents,
        currency: bundle.currency || paystackCurrency.value(),
        provider: 'paystack',
        paystackReference,
        authorizationUrl,
        status: 'approval_pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await db.collection('idempotency_keys').doc(`${userId}_${idempotencyKey}`).set({
        userId,
        key: idempotencyKey,
        provider: 'paystack',
        purchaseId,
        bundleId: bundle.id,
        authorizationUrl,
        status: 'approval_pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }, { merge: true });

      return { purchaseId, authorizationUrl, status: 'created' };
    } catch (error) {
      console.error('Failed to create Creator Credit purchase:', error);
      throw new HttpsError('internal', 'Failed to create Creator Credit purchase');
    }
  }
);

/**
 * Paystack webhook handler
 * Handles: charge.success, subscription.disable, subscription.not_funded, invoice.create, invoice.update
 */
export const paystackWebhook = onRequest(
  {
    secrets: [paystackSecretKey],
    cors: false,
  },
  async (req, res) => {
    const secretKey = paystackSecretKey.value();
    let eventId = 'unknown';
    let subscriptionId = 'unknown';

    try {
      // Verify signature first
      if (!secretKey || !verifyPaystackSignature(req, secretKey)) {
        console.warn('Invalid Paystack webhook signature');
        const body = req.body;
        eventId = generateEventId(body);
        await archiveWebhookEvent(
          eventId, 
          String(body?.event || 'unknown'), 
          String(body?.data?.reference || 'unknown'), 
          body, 
          false, 
          'invalid_signature'
        );
        res.status(401).send('Invalid signature');
        return;
      }

      const body = req.body;
      const eventType = body.event;
      const data = body.data;
      subscriptionId = data.reference;
      
      // Generate unique event ID for deduplication
      eventId = generateEventId(body);

      // Acquire distributed lock BEFORE checking duplicate
      // This prevents race conditions between concurrent webhooks
      const lockAcquired = await acquireWebhookLock(eventId, subscriptionId);
      if (!lockAcquired) {
        // Another instance is processing this event - return 200 to prevent retry
        res.status(200).json({ success: true, duplicate: true, reason: 'concurrent_processing' });
        return;
      }

      try {
        // Check for duplicate after acquiring lock
        const eventRef = db.collection('webhook_events').doc(eventId);
        const eventExists = await eventRef.get();
        if (eventExists.exists) {
          res.status(200).json({ success: true, duplicate: true });
          return;
        }

        // Store event as processing
        await eventRef.set({
          eventId,
          eventType,
          subscriptionId,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'processing',
        });

        const assetPurchaseResult = await processAssetPurchaseWebhook(eventId, eventType, data);
        if (assetPurchaseResult.handled) {
          await eventRef.update({ status: 'success', flow: 'asset_purchase' });
          res.status(200).json(assetPurchaseResult.response || { success: true });
          return;
        }

        const creditPurchaseResult = await processCreditPurchaseWebhook(eventId, eventType, data);
        if (creditPurchaseResult.handled) {
          await eventRef.update({ status: 'success', flow: 'creator_credit_purchase' });
          res.status(200).json(creditPurchaseResult.response || { success: true });
          return;
        }

        const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
        const subscriptionSnap = await subscriptionRef.get();
        const subscriptionData = subscriptionSnap.exists ? subscriptionSnap.data() : null;
        const userId = subscriptionData?.userId || data.metadata?.userId;
        const planId = normalizePlanId(subscriptionData?.planId || data.metadata?.planId);

        if (!userId) {
          console.warn(`No userId found for Paystack reference ${subscriptionId}`);
          await eventRef.update({ status: 'skipped', reason: 'missing_user_id' });
          await archiveWebhookEvent(eventId, eventType, subscriptionId, req.body, false, 'missing_user_id');
          // Return 200 - this isn't a retryable error
          res.status(200).json({ success: true, ignored: true, reason: 'missing_user_id' });
          return;
        }

        // Calculate current period end
        const currentPeriodEnd = data.next_payment_date
          ? new Date(data.next_payment_date).toISOString()
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        // Determine status based on event type
        let targetStatus: SubscriptionStatus = 'active';
        let shouldNotify = true;

        switch (eventType) {
          case 'charge.success':
            targetStatus = 'active';
            break;
          case 'subscription.disable':
          case 'subscription.deactivate':
            targetStatus = 'cancelled';
            break;
          case 'subscription.not_funded':
            targetStatus = 'past_due';
            break;
          case 'charge.failed':
            targetStatus = 'past_due';
            break;
          case 'invoice.create':
          case 'invoice.update':
            // These are informational, don't change status
            shouldNotify = false;
            break;
          default:
            console.log(`Unhandled Paystack event type: ${eventType}`);
            await eventRef.update({ status: 'skipped', reason: 'unhandled_event_type' });
            res.status(200).json({ success: true, ignored: true, reason: 'unhandled_event_type' });
            return;
        }

        // Build canonical state
        const state = buildCanonicalSubscriptionState(
          planId,
          targetStatus,
          subscriptionId,
          targetStatus === 'active' ? currentPeriodEnd : subscriptionData?.currentPeriodEnd
        );

        // Persist state
        await persistSubscriptionState(userId, subscriptionId, state, {
          userId,
          planId,
          paystackReference: subscriptionId,
          provider: 'paystack',
          ...(subscriptionSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
          ...(targetStatus === 'active' ? { currentPeriodEnd } : {}),
          ...(targetStatus === 'cancelled' ? { cancelledAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
          status: targetStatus,
          eventType,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Update event status
        await eventRef.update({ status: 'success' });

        // Create audit log
        await createAuditLog('paystack_webhook_processed', userId, subscriptionId, {
          eventId,
          eventType,
          previousStatus: subscriptionData?.subscriptionStatus,
          newStatus: targetStatus,
        });

        // Archive webhook
        await archiveWebhookEvent(eventId, eventType, subscriptionId, req.body, true);

        // Send notifications
        if (shouldNotify) {
          if (targetStatus === 'active' && subscriptionData?.subscriptionStatus !== 'active') {
            await createNotification(
              userId,
              'subscription',
              'Subscription activated',
              'Your plan is now active. Welcome to premium access.',
              '/settings/billing'
            );
          } else if (targetStatus === 'cancelled') {
            await createNotification(
              userId,
              'subscription',
              'Subscription cancelled',
              'Your subscription has been cancelled. Re-enable it anytime from your dashboard.',
              '/settings/billing'
            );
          } else if (targetStatus === 'past_due') {
            await createNotification(
              userId,
              'subscription',
              'Payment failed',
              "We couldn't process your payment. Please update your payment method to keep your subscription active.",
              '/settings/billing'
            );
          }
        }

        res.status(200).json({ success: true });
      } catch (processingError) {
        // Processing error - release lock and return 500 for retry
        console.error('Paystack webhook processing error:', processingError);
        
        try {
          const eventRef = db.collection('webhook_events').doc(eventId);
          await eventRef.update({
            status: 'error',
            error: processingError instanceof Error ? processingError.message : 'Unknown error',
          });
        } catch { /* ignore */ }
        
        // Return 500 to trigger Paystack retry
        res.status(500).json({ 
          error: processingError instanceof Error ? processingError.message : 'Processing failed' 
        });
      } finally {
        await releaseWebhookLock(eventId, subscriptionId);
      }
    } catch (error) {
      // Fatal error (before processing) - return 500
      console.error('Paystack webhook fatal error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
);

/**
 * Cancel Paystack subscription (user-initiated)
 */
export const cancelPaystackSubscription = onCall(
  {
    secrets: [paystackSecretKey],
  },
  async (request) => {
    const data = request.data;
    const context = request.auth;
    const secretKey = paystackSecretKey.value();

    if (!context?.uid) {
      throw new HttpsError('unauthenticated', 'User not authenticated');
    }

    const { subscriptionId } = data as { subscriptionId: string };
    const userId = context.uid;
    const subscriptionRef = db.collection('subscriptions').doc(subscriptionId);
    const subscriptionSnap = await subscriptionRef.get();

    if (!subscriptionSnap.exists) {
      throw new HttpsError('not-found', 'Subscription not found');
    }

    const subscriptionData = subscriptionSnap.data();
    if (subscriptionData?.userId !== userId) {
      throw new HttpsError('permission-denied', 'Cannot cancel someone else\'s subscription');
    }

    try {
      if (secretKey && subscriptionData?.paystackReference) {
        try {
          await axios.post(
            `${PAYSTACK_API_BASE_URL}/subscription/${subscriptionData.paystackReference}/disable`,
            {},
            { headers: getPaystackHeaders(secretKey) }
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

      await saveCanonicalSubscriptionState(userId, subscriptionId, canonicalState, {
        status: 'cancelled',
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await cacheSubscriptionClaim(userId, 'explorer');
      await createNotification(userId, 'subscription', 'Subscription cancelled', 'Your Paystack subscription has been cancelled successfully.', '/settings/billing');

      return { success: true };
    } catch (error) {
      console.error('Failed to cancel Paystack subscription:', error);
      throw new HttpsError('internal', 'Failed to cancel Paystack subscription');
    }
  }
);
