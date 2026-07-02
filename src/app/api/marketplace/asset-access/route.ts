import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

// Tier hierarchy: higher number = more access
const TIER_RANK: Record<string, number> = {
  free: 0,
  explorer: 1,
  pro: 2,
  elite: 3,
};

type AssetTier = 'free' | 'pro' | 'elite';

interface AssetAccessRequest {
  assetId: string;
}

/**
 * Validates if user tier meets or exceeds required asset tier
 * Business rules:
 * - free users: only free assets (rank 1 >= rank 1)
 * - pro users: free + pro assets (rank 2 >= rank 1 or 2)
 * - elite users: all assets (rank 3 >= any rank)
 */
function validateTierAccess(userTier: string, requiredTier: AssetTier): boolean {
  const userRank = TIER_RANK[userTier] || TIER_RANK.free;
  const requiredRank = TIER_RANK[requiredTier];
  
  if (!requiredRank) {
    console.error(`Invalid required tier: ${requiredTier}`);
    return false;
  }
  
  return userRank >= requiredRank;
}

/**
 * Extracts and validates Bearer token from Authorization header
 */
async function verifyAuthToken(request: NextRequest): Promise<{ uid: string; email?: string }> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    console.warn('Asset access attempt: Missing Authorization header');
    throw new Error('MISSING_AUTH');
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('Asset access attempt: Invalid Authorization format');
    throw new Error('INVALID_AUTH_FORMAT');
  }
  
  const idToken = authHeader.slice(7).trim();
  
  if (!idToken) {
    console.warn('Asset access attempt: Empty Bearer token');
    throw new Error('EMPTY_TOKEN');
  }
  
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken, true);
    
    if (!decodedToken.uid) {
      console.error('Token verification succeeded but no UID in payload');
      throw new Error('INVALID_TOKEN_PAYLOAD');
    }
    
    return { uid: decodedToken.uid, email: decodedToken.email };
  } catch (error: any) {
    console.error('Firebase token verification failed:', error.code || error.message);
    throw new Error('INVALID_TOKEN');
  }
}

/**
 * Fetches user tier from Firestore - SOURCE OF TRUTH
 * NEVER trust client-sent tier information
 */
async function getUserTier(uid: string): Promise<string> {
  try {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      console.warn(`User document not found in Firestore: ${uid}`);
      // Default to free tier for users without explicit tier
      return 'free';
    }
    
    const userData = userDoc.data();
    const subscription = userData?.subscription;
    const isActive = subscription?.subscriptionStatus === 'active' || subscription?.status === 'active';
    const tier = isActive
      ? (subscription?.subscriptionPlan || subscription?.plan || subscription?.planId)
      : 'explorer';
    
    // Normalize tier string
    const normalizedTier = String(tier).toLowerCase().trim();
    
    if (!TIER_RANK[normalizedTier]) {
      console.warn(`Unknown tier "${normalizedTier}" for user ${uid}, defaulting to free`);
      return 'free';
    }
    
    return normalizedTier;
  } catch (error) {
    console.error(`Firestore error fetching user tier for ${uid}:`, error);
    throw new Error('DATABASE_ERROR');
  }
}

function normalizeAssetTier(rawTier: unknown): AssetTier {
  if (rawTier === 'elite' || rawTier === 'enterprise') return 'elite';
  if (rawTier === 'pro') return 'pro';
  return 'free';
}

/**
 * POST handler for marketplace asset access
 * Authenticates user via Firebase Admin and validates tier permissions
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  
  try {
    // 1. Parse and validate request body
    let body: Partial<AssetAccessRequest>;
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn(`[${requestId}] Invalid JSON in request body`);
      return NextResponse.json(
        { error: 'Invalid request body', accessGranted: false },
        { status: 400 }
      );
    }
    
    const { assetId } = body;
    
    if (!assetId || typeof assetId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid assetId', accessGranted: false },
        { status: 400 }
      );
    }
    
    const assetDoc = await adminDb.collection('marketplaceAssets').doc(assetId).get();
    if (!assetDoc.exists) {
      return NextResponse.json(
        { error: 'Asset not found', accessGranted: false },
        { status: 404 }
      );
    }

    const asset = assetDoc.data() || {};
    if (asset.published === false) {
      return NextResponse.json(
        { error: 'Asset is not published', accessGranted: false },
        { status: 404 }
      );
    }

    const requiredTier = normalizeAssetTier(asset.tier);
    const assetUrl = typeof asset.assetUrl === 'string' ? asset.assetUrl : '';
    if (!assetUrl) {
      return NextResponse.json(
        { error: 'Asset file is not configured yet', accessGranted: false },
        { status: 409 }
      );
    }
    
    // 2. Authenticate user via Firebase Admin
    let user: { uid: string; email?: string };
    try {
      user = await verifyAuthToken(request);
    } catch (authError: any) {
      const errorMessage = authError.message;
      
      if (errorMessage === 'MISSING_AUTH') {
        return NextResponse.json(
          { error: 'Authorization header required', accessGranted: false },
          { status: 401 }
        );
      }
      
      if (errorMessage === 'INVALID_TOKEN' || errorMessage === 'INVALID_AUTH_FORMAT' || errorMessage === 'EMPTY_TOKEN') {
        return NextResponse.json(
          { error: 'Invalid or expired authentication token', accessGranted: false },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { error: 'Authentication failed', accessGranted: false },
        { status: 401 }
      );
    }
    
    // 3. Fetch user tier from Firestore (SOURCE OF TRUTH)
    let userTier: string;
    try {
      userTier = await getUserTier(user.uid);
    } catch (dbError: any) {
      console.error(`[${requestId}] Database error for user ${user.uid}:`, dbError);
      return NextResponse.json(
        { error: 'Failed to verify user permissions', accessGranted: false },
        { status: 500 }
      );
    }
    
    // 4. Validate tier permissions
    const hasAccess = validateTierAccess(userTier, requiredTier);
    
    if (!hasAccess) {
      console.info(`[${requestId}] Access denied: user ${user.uid} (tier: ${userTier}) attempted to access ${assetId} (requires: ${requiredTier})`);
      
      return NextResponse.json(
        {
          error: 'Access denied: insufficient subscription tier',
          accessGranted: false,
          currentTier: userTier,
          requiredTier: requiredTier,
          upgradeUrl: '/subscription/upgrade',
        },
        { status: 403 }
      );
    }
    
    // 5. Access granted - return asset URL
    console.info(`[${requestId}] Access granted: user ${user.uid} (tier: ${userTier}) accessing ${assetId}`);
    
    return NextResponse.json(
      {
        assetUrl,
        accessGranted: true,
        assetId,
        asset: {
          title: typeof asset.title === 'string' ? asset.title : 'Marketplace asset',
        },
        userTier,
      },
      { status: 200 }
    );
    
  } catch (error: any) {
    // Catch-all for unexpected errors
    console.error(`[${requestId}] Unhandled error in asset-access route:`, error);
    
    return NextResponse.json(
      { error: 'Internal server error', accessGranted: false },
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.', accessGranted: false },
    { status: 405 }
  );
}

export async function PUT(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.', accessGranted: false },
    { status: 405 }
  );
}

export async function DELETE(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.', accessGranted: false },
    { status: 405 }
  );
}
