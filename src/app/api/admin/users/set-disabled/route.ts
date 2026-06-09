import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

type SetDisabledRequest = {
  userId?: unknown;
  uid?: unknown;
  disabled?: unknown;
  reason?: unknown;
};

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
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

    const body = (await req.json()) as SetDisabledRequest;
    const userId =
      typeof body.userId === 'string'
        ? body.userId.trim()
        : typeof body.uid === 'string'
          ? body.uid.trim()
          : '';
    const disabled = body.disabled;
    const reason =
      typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim()
        : null;

    if (!userId || typeof disabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing userId or disabled value' },
        { status: 400 }
      );
    }

    if (disabled && userId === callerUid) {
      return NextResponse.json(
        { error: 'Cannot disable yourself' },
        { status: 400 }
      );
    }

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    const previousDisabled = userSnap.data()?.disabled === true;
    const timestamp = FieldValue.serverTimestamp();

    if (disabled) {
      await adminAuth.updateUser(userId, { disabled: true });
      await adminAuth.revokeRefreshTokens(userId);
      await userRef.update({
        disabled: true,
        status: 'banned',
        disabledAt: timestamp,
        disabledBy: callerUid,
        disabledReason: reason,
        updatedAt: timestamp,
      });
    } else {
      await adminAuth.updateUser(userId, { disabled: false });
      await userRef.update({
        disabled: false,
        status: 'active',
        enabledAt: timestamp,
        enabledBy: callerUid,
        updatedAt: timestamp,
      });
    }

    await adminDb.collection('admin').doc('audit').collection('entries').add({
      action: disabled ? 'user_disabled' : 'user_enabled',
      targetUserId: userId,
      previousDisabled,
      disabled,
      adminId: callerUid,
      reason,
      timestamp,
    });

    return NextResponse.json({ success: true, userId, disabled });
  } catch (error) {
    console.error('Failed to update user disabled status:', error);

    return NextResponse.json(
      { error: 'Unable to update user disabled status' },
      { status: 500 }
    );
  }
}
