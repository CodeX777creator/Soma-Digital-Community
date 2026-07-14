import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { hasPlan, isSubscriptionActive, normalizeSubscription, SubscriptionPlan, UserEntitlements } from '@/lib/entitlements';

class APIError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function authError(message = 'Unauthorized') {
  return new APIError(401, message);
}

export function permissionError(message = 'Forbidden') {
  return new APIError(403, message);
}

export function hasAdminAccess(profile: Record<string, any> | undefined | null): boolean {
  if (!profile) return false;

  const roles = Array.isArray(profile.roles) ? profile.roles : [];
  return profile.isAdmin === true || profile.role === 'admin' || roles.includes('admin');
}

export async function requireAuth(req: NextRequest): Promise<{ uid: string; email?: string }> {
  const authHeader = req.headers.get('authorization') || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!idToken) {
    throw authError('Missing authorization token');
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.uid) {
      throw authError('Invalid token payload');
    }
    return { uid: decoded.uid, email: decoded.email };
    } catch (error) {
    throw authError('Invalid or expired token');
  }
}

export async function requireUserEntitlements(req: NextRequest): Promise<UserEntitlements> {
  const { uid } = await requireAuth(req);
  const userRef = adminDb.doc(`users/${uid}`);
  let userSnap = await userRef.get();

  if (!userSnap.exists) {
    const firebaseUser = await adminAuth.getUser(uid);
    const timestamp = FieldValue.serverTimestamp();
    const subscriptionId = `system_explorer_${uid}`;
    const subscription = {
      provider: 'system',
      subscriptionId,
      userId: uid,
      subscriptionPlan: 'explorer',
      planId: 'explorer',
      plan: 'explorer',
      subscriptionStatus: 'active',
      status: 'active',
      currentPeriodEnd: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const displayName = firebaseUser.displayName || 'Explorer';
    const batch = adminDb.batch();
    batch.set(adminDb.collection('subscriptions').doc(subscriptionId), subscription, { merge: true });
    batch.set(userRef, {
      uid,
      email: firebaseUser.email || '',
      name: displayName,
      displayName,
      photoURL: firebaseUser.photoURL || null,
      avatarURL: firebaseUser.photoURL || null,
      emailVerified: firebaseUser.emailVerified === true,
      role: 'member',
      roles: [],
      isAdmin: false,
      tier: 'explorer',
      subscriptionTier: 'explorer',
      subscriptionPlan: 'explorer',
      subscriptionStatus: 'active',
      subscription,
      onboardingComplete: false,
      xp: 0,
      level: 1,
      streak: 0,
      roadmapGenerated: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });
    batch.set(adminDb.collection('publicProfiles').doc(uid), {
      uid,
      name: displayName,
      displayName,
      photoURL: firebaseUser.photoURL || null,
      avatarURL: firebaseUser.photoURL || null,
      tier: 'explorer',
      xp: 0,
      level: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });
    await batch.commit();
    userSnap = await userRef.get();
  }

  const profile = userSnap.data();
  if (!profile) {
    throw authError('Authenticated user profile is missing');
  }

  const subscription = await getCanonicalSubscription(uid, profile.subscription);
  const roles = Array.isArray(profile.roles) ? profile.roles : [];
  const isAdmin = hasAdminAccess(profile);

  return {
    uid,
    isAdmin,
    roles,
    subscription,
    profile,
  };
}

async function getCanonicalSubscription(
  uid: string,
  summary: Record<string, any> | null | undefined
) {
  const summarySubscription = normalizeSubscription(summary);

  if (summarySubscription.subscriptionId) {
    const subscriptionSnap = await adminDb
      .collection('subscriptions')
      .doc(summarySubscription.subscriptionId)
      .get();

    if (subscriptionSnap.exists) {
      const data = subscriptionSnap.data() || {};
      if (data.userId === uid) {
        return normalizeSubscription({
          ...data,
          subscriptionId: subscriptionSnap.id,
        });
      }
    }
  }

  const subscriptionsSnap = await adminDb
    .collection('subscriptions')
    .where('userId', '==', uid)
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();

  if (!subscriptionsSnap.empty) {
    const subscriptionDoc = subscriptionsSnap.docs[0];
    return normalizeSubscription({
      ...subscriptionDoc.data(),
      subscriptionId: subscriptionDoc.id,
    });
  }

  return summarySubscription;
}

export async function requireSubscription(
  req: NextRequest,
  minimumPlan: SubscriptionPlan = 'explorer'
): Promise<UserEntitlements> {
  const entitlements = await requireUserEntitlements(req);

  if (!isSubscriptionActive(entitlements.subscription)) {
    throw permissionError('Subscription is not active');
  }

  if (!hasPlan(entitlements.subscription, minimumPlan)) {
    throw permissionError('Subscription plan does not permit this action');
  }

  return entitlements;
}

export async function requireRole(req: NextRequest, role: string): Promise<UserEntitlements> {
  const entitlements = await requireUserEntitlements(req);

  if (role === 'admin') {
    if (!entitlements.isAdmin) {
      throw permissionError('Admin privileges required');
    }
    return entitlements;
  }

  if (!entitlements.roles.includes(role)) {
    throw permissionError('Required role not found');
  }

  return entitlements;
}

export { APIError };
