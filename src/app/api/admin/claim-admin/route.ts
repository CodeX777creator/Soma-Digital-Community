import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { rateLimit, getClientIP } from '@/lib/api-middleware';
import { ADMIN_RATE_LIMIT, isBlocked, sanitizeString } from '@/lib/security';

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

// Track failed setup attempts per IP
const failedAttempts = new Map<string, { count: number; lockUntil: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 60 * 60 * 1000; // 1 hour

function isLockedOut(identifier: string): boolean {
  const attempt = failedAttempts.get(identifier);
  if (!attempt) return false;
  if (Date.now() < attempt.lockUntil) return true;
  // Clear expired lockout
  failedAttempts.delete(identifier);
  return false;
}

function recordFailedAttempt(identifier: string): void {
  const existing = failedAttempts.get(identifier);
  const count = (existing?.count || 0) + 1;
  
  if (count >= MAX_FAILED_ATTEMPTS) {
    failedAttempts.set(identifier, {
      count,
      lockUntil: Date.now() + LOCKOUT_DURATION,
    });
  } else {
    failedAttempts.set(identifier, {
      count,
      lockUntil: 0,
    });
  }
}

function clearFailedAttempts(identifier: string): void {
  failedAttempts.delete(identifier);
}

export async function POST(req: Request) {
  const clientIP = getClientIP(req as any);
  const identifier = `${clientIP}:admin:claim`;
  
  try {
    // Check for lockout
    if (isLockedOut(identifier)) {
      return NextResponse.json(
        { error: 'Too many failed attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Apply strict rate limiting
    if (isBlocked(identifier)) {
      return NextResponse.json(
        { error: 'Access temporarily blocked due to rate limit violations' },
        { status: 429 }
      );
    }
    
    const limitResult = rateLimit(identifier, ADMIN_RATE_LIMIT);
    
    if (!limitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: Math.ceil((limitResult.resetTime - Date.now()) / 1000) },
        { status: 429 }
      );
    }

    // ── 1. Verify Firebase token ─────────────────────────────────────────
    const token = getBearerToken(req);
    if (!token) {
      recordFailedAttempt(identifier);
      return NextResponse.json(
        { error: 'Missing Authorization bearer token' },
        { status: 401 }
      );
    }

    const decodedToken = await adminAuth.verifyIdToken(token);

    // ── 2. Parse and validate body ───────────────────────────────────────
    const body = (await req.json()) as ClaimAdminRequest;
    const uid = typeof body.uid === 'string' ? sanitizeString(body.uid.trim(), 128) : '';
    const email = typeof body.email === 'string' ? sanitizeString(body.email.trim().toLowerCase(), 254) : '';
    const setupCode = typeof body.setupCode === 'string' ? sanitizeString(body.setupCode.trim(), 256) : '';

    if (!uid || !email) {
      recordFailedAttempt(identifier);
      return NextResponse.json(
        { error: 'Missing uid or email' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      recordFailedAttempt(identifier);
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // ── 3. CRITICAL: Verify setup code ───────────────────────────────────
    const expectedCode = process.env.ADMIN_SETUP_CODE;
    if (!expectedCode || setupCode !== expectedCode) {
      recordFailedAttempt(identifier);
      return NextResponse.json(
        { error: 'Invalid or missing setup code' },
        { status: 403 }
      );
    }

    // ── 4. Verify token matches requested user ───────────────────────────
    if (decodedToken.uid !== uid) {
      recordFailedAttempt(identifier);
      return NextResponse.json(
        { error: 'Authenticated user does not match requested uid' },
        { status: 403 }
      );
    }

    const userRecord = await adminAuth.getUser(uid);
    const authEmail = userRecord.email || decodedToken.email;

    if (authEmail && authEmail.toLowerCase() !== email.toLowerCase()) {
      recordFailedAttempt(identifier);
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

    // Clear failed attempts on success
    clearFailedAttempts(identifier);

    // Log successful admin claim
    await adminDb.collection('admin').doc('audit').collection('entries').add({
      action: 'admin_claimed',
      adminId: uid,
      email,
      ipAddress: clientIP,
      timestamp: FieldValue.serverTimestamp(),
    });

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