import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import axios from 'axios';
import { 
  normalizePlanId, 
  normalizeStatus, 
  buildCanonicalSubscriptionState,
  saveCanonicalSubscriptionState,
  cacheSubscriptionClaim,
  createAuditLog 
} from './billing-helpers';
import type { PayPalAccessTokenResponse } from './paypal-types';

const db = admin.firestore();
const auth = admin.auth();

// Secrets and config
const paypalClientId = defineSecret('PAYPAL_CLIENT_ID');
const paypalClientSecret = defineSecret('PAYPAL_CLIENT_SECRET');
const paystackSecretKey = defineSecret('PAYSTACK_SECRET_KEY');
const paypalEnv = defineString('PAYPAL_ENV', { default: 'sandbox' });

interface SyncResult {
  checked: number;
  updated: number;
  errors: number;
  details: string[];
}

function getPayPalApiBaseUrl(): string {
  return paypalEnv.value() === 'production'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';
}

async function getPayPalAccessToken(): Promise<string> {
  const clientId = paypalClientId.value();
  const clientSecret = paypalClientSecret.value();

  const response = await axios.post<PayPalAccessTokenResponse>(
    `${getPayPalApiBaseUrl()}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    }
  );

  return response.data.access_token;
}

async function syncPayPalSubscription(subscriptionId: string, userId: string): Promise<boolean> {
  try {
    const token = await getPayPalAccessToken();
    
    const response = await axios.get(
      `${getPayPalApiBaseUrl()}/v1/billing/subscriptions/${subscriptionId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      }
    );

    const paypalData = response.data;
    const planId = normalizePlanId(paypalData.plan_id);
    const status = normalizeStatus(paypalData.status?.toLowerCase() || 'expired');
    const currentPeriodEnd = paypalData.billing_info?.next_billing_time || null;

    // Get current state from Firestore
    const subRef = db.collection('subscriptions').doc(subscriptionId);
    const subDoc = await subRef.get();
    
    if (!subDoc.exists) {
      console.warn(`Subscription ${subscriptionId} not found in Firestore`);
      return false;
    }

    const currentData = subDoc.data();
    
    // Check if state needs update
    if (currentData?.subscriptionStatus !== status || 
        currentData?.currentPeriodEnd !== currentPeriodEnd) {
      
      await saveCanonicalSubscriptionState(
        userId,
        subscriptionId,
        buildCanonicalSubscriptionState(planId, status, subscriptionId, currentPeriodEnd, 'paypal'),
        {
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
          paypalStatus: paypalData.status,
        }
      );

      // Update claims if status changed to/from active
      if (status === 'active') {
        await cacheSubscriptionClaim(userId, planId);
      } else if (currentData?.subscriptionStatus === 'active') {
        await cacheSubscriptionClaim(userId, 'explorer');
      }

      await createAuditLog('subscription_synced', userId, subscriptionId, {
        oldStatus: currentData?.subscriptionStatus,
        newStatus: status,
        provider: 'paypal',
      });

      console.log(`Synced PayPal subscription ${subscriptionId}: ${currentData?.subscriptionStatus} -> ${status}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Failed to sync PayPal subscription ${subscriptionId}:`, error);
    return false;
  }
}

async function syncPaystackSubscription(subscriptionId: string, userId: string, paystackRef: string): Promise<boolean> {
  try {
    const secretKey = paystackSecretKey.value();
    
    // Try to fetch subscription details from Paystack
    const response = await axios.get(
      `https://api.paystack.co/subscription/${paystackRef}`,
      {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 10000,
      }
    );

    const paystackData = response.data.data;
    const status = paystackData.status === 'active' ? 'active' : 
                   paystackData.status === 'cancelled' ? 'cancelled' : 'expired';
    
    // Get current state from Firestore
    const subRef = db.collection('subscriptions').doc(subscriptionId);
    const subDoc = await subRef.get();
    
    if (!subDoc.exists) {
      console.warn(`Subscription ${subscriptionId} not found in Firestore`);
      return false;
    }

    const currentData = subDoc.data();
    const planId = normalizePlanId(currentData?.planId);
    
    // Calculate next payment date
    const nextPaymentDate = paystackData.next_payment_date || 
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Check if state needs update
    if (currentData?.subscriptionStatus !== status || 
        currentData?.currentPeriodEnd !== nextPaymentDate) {
      
      await saveCanonicalSubscriptionState(
        userId,
        subscriptionId,
        buildCanonicalSubscriptionState(planId, status, subscriptionId, nextPaymentDate, 'paystack'),
        {
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
          paystackStatus: paystackData.status,
        }
      );

      // Update claims if status changed
      if (status === 'active') {
        await cacheSubscriptionClaim(userId, planId);
      } else if (currentData?.subscriptionStatus === 'active') {
        await cacheSubscriptionClaim(userId, 'explorer');
      }

      await createAuditLog('subscription_synced', userId, subscriptionId, {
        oldStatus: currentData?.subscriptionStatus,
        newStatus: status,
        provider: 'paystack',
      });

      console.log(`Synced Paystack subscription ${subscriptionId}: ${currentData?.subscriptionStatus} -> ${status}`);
      return true;
    }

    return false;
  } catch (error) {
    // Paystack subscription fetch might fail if it's a one-time charge
    console.error(`Failed to sync Paystack subscription ${subscriptionId}:`, error);
    return false;
  }
}

async function handleExpiredSubscriptions(): Promise<number> {
  const now = new Date().toISOString();
  const expiredSnapshot = await db
    .collection('subscriptions')
    .where('subscriptionStatus', '==', 'active')
    .where('currentPeriodEnd', '<', now)
    .get();

  let expiredCount = 0;

  for (const doc of expiredSnapshot.docs) {
    const data = doc.data();
    const userId = data.userId;
    
    if (!userId) continue;

    try {
      const planId = normalizePlanId(data.planId);
      
      await saveCanonicalSubscriptionState(
        userId,
        doc.id,
        buildCanonicalSubscriptionState(planId, 'expired', doc.id, null, data.provider || 'paypal'),
        {
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          expiryReason: 'period_ended',
        }
      );

      await cacheSubscriptionClaim(userId, 'explorer');
      
      await createAuditLog('subscription_expired', userId, doc.id, {
        previousPeriodEnd: data.currentPeriodEnd,
        reason: 'period_ended',
      });

      expiredCount++;
    } catch (error) {
      console.error(`Failed to expire subscription ${doc.id}:`, error);
    }
  }

  return expiredCount;
}

async function handlePastDueSubscriptions(): Promise<number> {
  // Find subscriptions that have been past_due for more than 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  
  const pastDueSnapshot = await db
    .collection('subscriptions')
    .where('subscriptionStatus', '==', 'past_due')
    .where('updatedAt', '<', threeDaysAgo)
    .get();

  let suspendedCount = 0;

  for (const doc of pastDueSnapshot.docs) {
    const data = doc.data();
    const userId = data.userId;
    
    if (!userId) continue;

    try {
      const planId = normalizePlanId(data.planId);
      
      await saveCanonicalSubscriptionState(
        userId,
        doc.id,
        buildCanonicalSubscriptionState(planId, 'expired', doc.id, null, data.provider || 'paypal'),
        {
          suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
          suspensionReason: 'payment_overdue',
        }
      );

      await cacheSubscriptionClaim(userId, 'explorer');
      
      await createAuditLog('subscription_suspended', userId, doc.id, {
        previousStatus: 'past_due',
        daysPastDue: 3,
      });

      suspendedCount++;
    } catch (error) {
      console.error(`Failed to suspend subscription ${doc.id}:`, error);
    }
  }

  return suspendedCount;
}

export const syncSubscriptions = onSchedule(
  {
    schedule: '0 */6 * * *', // Every 6 hours
    timeZone: 'UTC',
    secrets: [paypalClientId, paypalClientSecret, paystackSecretKey],
  },
  async (event) => {
    const startTime = Date.now();
    const result: SyncResult = {
      checked: 0,
      updated: 0,
      errors: 0,
      details: [],
    };

    try {
      console.log('Starting subscription sync job...');

      // Handle expired subscriptions first
      const expiredCount = await handleExpiredSubscriptions();
      if (expiredCount > 0) {
        result.details.push(`Expired ${expiredCount} ended subscriptions`);
        result.updated += expiredCount;
      }

      // Handle past-due subscriptions
      const suspendedCount = await handlePastDueSubscriptions();
      if (suspendedCount > 0) {
        result.details.push(`Suspended ${suspendedCount} overdue subscriptions`);
        result.updated += suspendedCount;
      }

      // Get active subscriptions to sync with providers
      const activeSnapshot = await db
        .collection('subscriptions')
        .where('subscriptionStatus', 'in', ['active', 'past_due'])
        .get();

      result.checked = activeSnapshot.size;

      // Process in batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < activeSnapshot.docs.length; i += batchSize) {
        const batch = activeSnapshot.docs.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (doc) => {
          const data = doc.data();
          const userId = data.userId;
          const provider = data.provider || 'paypal';

          if (!userId) return;

          try {
            let updated = false;

            if (provider === 'paypal' && data.paypalSubscriptionId) {
              updated = await syncPayPalSubscription(doc.id, userId);
            } else if (provider === 'paystack' && data.paystackReference) {
              updated = await syncPaystackSubscription(doc.id, userId, data.paystackReference);
            }

            if (updated) {
              result.updated++;
            }
          } catch (error) {
            result.errors++;
            console.error(`Error syncing subscription ${doc.id}:`, error);
          }
        }));

        // Rate limiting delay between batches
        if (i + batchSize < activeSnapshot.docs.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Subscription sync completed in ${duration}ms:`, result);

      // Store sync result for monitoring
      await db.collection('system').doc('subscription_sync').set({
        lastRun: admin.firestore.FieldValue.serverTimestamp(),
        duration,
        result,
      });

    } catch (error) {
      console.error('Subscription sync job failed:', error);
      throw error;
    }
  }
);

// Manual trigger for testing
export const runSubscriptionSync = onSchedule(
  {
    schedule: '0 0 1 * *', // Monthly for cleanup
    timeZone: 'UTC',
    secrets: [paypalClientId, paypalClientSecret, paystackSecretKey],
  },
  async (event) => {
    // Cleanup old idempotency keys (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const oldKeys = await db
      .collection('idempotency_keys')
      .where('createdAt', '<', sevenDaysAgo)
      .limit(500)
      .get();

    const batch = db.batch();
    oldKeys.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Cleaned up ${oldKeys.size} old idempotency keys`);
  }
);
