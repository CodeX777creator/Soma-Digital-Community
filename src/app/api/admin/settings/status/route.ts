import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function hasAdminAccess(profile: Record<string, any> | undefined) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  return profile?.isAdmin === true || profile?.role === 'admin' || roles.includes('admin');
}

function envStatus(name: string, options: { public?: boolean; required?: boolean } = {}) {
  const value = process.env[name];
  return {
    name,
    public: options.public === true,
    required: options.required === true,
    configured: typeof value === 'string' && value.length > 0,
  };
}

async function countCollection(name: string) {
  try {
    const snapshot = await adminDb.collection(name).count().get();
    return snapshot.data().count;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const callerProfile = callerSnap.exists ? callerSnap.data() : undefined;

    if (!hasAdminAccess(callerProfile)) {
      return NextResponse.json({ error: 'Caller is not admin' }, { status: 403 });
    }

    const configSnap = await adminDb.collection('system').doc('config').get();
    const config = configSnap.exists ? configSnap.data() || {} : {};
    const [users, subscriptions, marketplaceAssets, posts, webhookEvents] = await Promise.all([
      countCollection('users'),
      countCollection('subscriptions'),
      countCollection('marketplaceAssets'),
      countCollection('posts'),
      countCollection('webhook_events'),
    ]);

    const env = [
      envStatus('NEXT_PUBLIC_FIREBASE_PROJECT_ID', { public: true, required: true }),
      envStatus('NEXT_PUBLIC_FIREBASE_API_KEY', { public: true, required: true }),
      envStatus('NEXT_PUBLIC_FIREBASE_APP_ID', { public: true, required: true }),
      envStatus('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', { public: true }),
      envStatus('NEXT_PUBLIC_PAYPAL_CLIENT_ID', { public: true }),
      envStatus('NEXT_PUBLIC_PAYSTACK_AMOUNT_PRO', { public: true }),
      envStatus('NEXT_PUBLIC_PAYSTACK_AMOUNT_ELITE', { public: true }),
      envStatus('FIREBASE_PROJECT_ID', { required: true }),
      envStatus('ADMIN_SETUP_CODE'),
      envStatus('PAYPAL_CLIENT_ID'),
      envStatus('PAYPAL_CLIENT_SECRET'),
      envStatus('PAYPAL_WEBHOOK_ID'),
      envStatus('PAYSTACK_SECRET_KEY'),
      envStatus('PAYSTACK_CURRENCY'),
      envStatus('FRONTEND_URL'),
    ];

    return NextResponse.json({
      setup: {
        configExists: configSnap.exists,
        adminSetupComplete: config.adminSetupComplete === true,
        adminUid: config.adminUid || null,
        adminEmail: config.adminEmail || null,
        setupAt: config.setupAt || null,
        updatedAt: config.updatedAt || null,
      },
      env,
      collections: {
        users,
        subscriptions,
        marketplaceAssets,
        posts,
        webhookEvents,
      },
      system: {
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
        nodeEnv: process.env.NODE_ENV || null,
        firebaseRulesConfigured: true,
        storageRulesConfigured: true,
      },
    });
  } catch (error) {
    console.error('Failed to load admin settings status:', error);
    return NextResponse.json({ error: 'Unable to load settings status' }, { status: 500 });
  }
}
