import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

type ClaimAdminRequest = {
  uid?: unknown;
  email?: unknown;
  setupCode?: unknown;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

export async function POST(req: Request) {
  try {
    // ── 1. Verify Firebase token ─────────────────────────────────────────
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Missing Authorization bearer token' },
        { status: 401 }
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(token);

    // ── 2. Parse and validate body ───────────────────────────────────────
    const body = (await req.json()) as ClaimAdminRequest;
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const setupCode = typeof body.setupCode === 'string' ? body.setupCode.trim() : '';

    if (!uid || !email) {
      return NextResponse.json(
        { error: 'Missing uid or email' },
        { status: 400 }
      );
    }

    // ── 3. CRITICAL: Verify setup code ───────────────────────────────────
    const expectedCode = process.env.ADMIN_SETUP_CODE;
    if (!expectedCode || setupCode !== expectedCode) {
      return NextResponse.json(
        { error: 'Invalid or missing setup code' },
        { status: 403 }
      );
    }

    // ── 4. Verify token matches requested user ───────────────────────────
    if (decodedToken.uid !== uid) {
      return NextResponse.json(
        { error: 'Authenticated user does not match requested uid' },
        { status: 403 }
      );
    }

    const userRecord = await adminAuth.getUser(uid);
    const authEmail = userRecord.email || decodedToken.email;

    if (authEmail && authEmail.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: 'Authenticated user email does not match requested email' },
        { status: 403 }
      );
    }

    // ── 5. Check if already initialized (outside transaction first) ──────
    const configRef = adminDb.collection('system').doc('config');
    const configSnap = await configRef.get();

    if (configSnap.exists && configSnap.data()?.adminSetupComplete === true) {
      return NextResponse.json(
        { error: 'Admin setup is already complete' },
        { status: 409 }
      );
    }

    // ── 6. Atomic transaction ─────────────────────────────────────────────
    await adminDb.runTransaction(async (transaction) => {
      const latestConfigSnap = await transaction.get(configRef);
      const latestConfig = latestConfigSnap.exists ? latestConfigSnap.data() : null;

      if (latestConfig?.adminSetupComplete === true) {
        throw Object.assign(new Error('Admin setup is already complete'), {
          status: 409,
        });
      }

      const now = FieldValue.serverTimestamp();
      const userRef = adminDb.collection('users').doc(uid);

      transaction.set(
        userRef,
        {
          // All three admin patterns used across codebase
          isAdmin: true,           // For Firestore rules: isAdmin == true
          roles: ['admin'],        // For Firestore rules: 'admin' in roles
          role: 'admin',           // For UI checks: role === 'admin'

          // Tier & subscription (give admin elite access)
          subscriptionTier: 'elite',
          tier: 'elite',
          subscription: {
            subscriptionPlan: 'elite',
            subscriptionStatus: 'active',
            provider: 'manual',
            currentPeriodEnd: null,
            updatedAt: now,
          },

          // Profile baseline
          email,
          name: email.split('@')[0] || 'Admin',
          displayName: email.split('@')[0] || 'Admin',
          photoURL: '',
          avatarURL: '',
          avatarUrl: '',
          createdAt: now,
          updatedAt: now,
          lastLogin: now,
        },
        { merge: true }
      );

      transaction.set(
        configRef,
        {
          adminSetupComplete: true,
          setupCodeHash: null, // Clear the code from Firestore
          adminUid: uid,
          adminEmail: email,
          setupAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    // ── 7. Set custom claims (merge with existing) ─────────────────────
    await adminAuth.setCustomUserClaims(uid, {
      ...(userRecord.customClaims || {}),
      admin: true,
      subscriptionTier: 'elite',
    });

    // ── 8. Force token refresh ───────────────────────────────────────────
    await adminAuth.revokeRefreshTokens(uid);

    return NextResponse.json({
      success: true,
      uid,
      email,
      message: 'Admin claim successful. Sign out and sign back in for full admin access.',
    });
  } catch (error: any) {
    console.error('Failed to claim admin user:', error);

    // Handle transaction-thrown status codes
    const status = error.status || 500;
    const message = error.message || 'Unable to claim admin user';

    return NextResponse.json({ error: message }, { status });
  }
}