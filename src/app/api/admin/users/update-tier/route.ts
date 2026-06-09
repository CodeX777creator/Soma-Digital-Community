import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

type Tier = 'explorer' | 'pro' | 'elite';

type UpdateTierRequest = {
  userId?: unknown;
  uid?: unknown;
  tier?: unknown;
  reason?: unknown;
};

const VALID_TIERS: Tier[] = ['explorer', 'pro', 'elite'];

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && VALID_TIERS.includes(value as Tier);
}

function hasAdminAccess(profile: Record<string, any> | undefined) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  return profile?.isAdmin === true || profile?.role === 'admin' || roles.includes('admin');
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);

    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    }

    let callerUid: string;

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      callerUid = decodedToken.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const callerSnap = await adminDb.collection('users').doc(callerUid).get();
    const callerProfile = callerSnap.exists ? callerSnap.data() : undefined;

    if (!hasAdminAccess(callerProfile)) {
      return NextResponse.json({ error: 'Caller is not admin' }, { status: 403 });
    }

    const body = (await req.json()) as UpdateTierRequest;
    const userId =
      typeof body.userId === 'string'
        ? body.userId.trim()
        : typeof body.uid === 'string'
          ? body.uid.trim()
          : '';
    const tier = body.tier;
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : null;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (!isTier(tier)) {
      return NextResponse.json({ error: 'Invalid tier value' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const userData = userSnap.data() || {};
    const previousTier =
      userData.subscriptionTier ||
      userData.tier ||
      userData.subscription?.subscriptionPlan ||
      userData.subscription?.plan ||
      null;
    const timestamp = FieldValue.serverTimestamp();
    const subscriptionId =
      typeof userData.subscription?.subscriptionId === 'string' && userData.subscription.subscriptionId
        ? userData.subscription.subscriptionId
        : `admin_${userId}`;
    const subscriptionSummary = {
      provider: 'admin',
      subscriptionId,
      userId,
      subscriptionPlan: tier,
      planId: tier,
      plan: tier,
      subscriptionStatus: 'active',
      status: 'active',
      currentPeriodEnd: null,
      updatedAt: timestamp,
    };

    const batch = adminDb.batch();
    batch.set(
      adminDb.collection('subscriptions').doc(subscriptionId),
      {
        ...subscriptionSummary,
        source: 'admin',
        updatedBy: callerUid,
        updateReason: reason,
        createdAt: userData.subscription?.subscriptionId ? userData.subscription?.createdAt || timestamp : timestamp,
      },
      { merge: true }
    );
    batch.update(userRef, {
      subscriptionTier: tier,
      tier,
      subscription: subscriptionSummary,
      tierUpdatedAt: timestamp,
      tierUpdatedBy: callerUid,
      tierUpdateReason: reason,
      updatedAt: timestamp,
    });
    await batch.commit();

    const targetUser = await adminAuth.getUser(userId);
    await adminAuth.setCustomUserClaims(userId, {
      ...(targetUser.customClaims || {}),
      subscriptionTier: tier,
    });

    await adminDb.collection('admin').doc('audit').collection('entries').add({
      action: 'tier_change',
      targetUserId: userId,
      previousTier,
      newTier: tier,
      adminId: callerUid,
      reason,
      timestamp,
    });

    return NextResponse.json({ success: true, userId, newTier: tier });
  } catch (error) {
    console.error('Failed to update user tier:', error);

    return NextResponse.json(
      { error: 'Unable to update user tier' },
      { status: 500 }
    );
  }
}
