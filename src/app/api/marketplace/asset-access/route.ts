import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { getEffectiveUserTier } from '@/lib/tier';

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
    const tier = getEffectiveUserTier(userData);
    
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

async function getPaidAssetPurchase(uid: string, assetId: string) {
  const directPurchaseDoc = await adminDb
    .collection('assetPurchases')
    .doc(`${uid}_${assetId}`)
    .get();

  if (directPurchaseDoc.exists && directPurchaseDoc.data()?.status === 'paid') {
    return directPurchaseDoc.data() || null;
  }

  const purchaseSnapshot = await adminDb
    .collection('assetPurchases')
    .where('userId', '==', uid)
    .where('assetId', '==', assetId)
    .where('status', '==', 'paid')
    .limit(1)
    .get();

  if (purchaseSnapshot.empty) return null;
  return purchaseSnapshot.docs[0].data();
}

async function getResellerLink(uid: string, assetId: string) {
  const linkDoc = await adminDb
    .collection('resellerLinks')
    .doc(`${uid}_${assetId}`)
    .get();

  if (!linkDoc.exists) return null;
  const data = linkDoc.data() || {};
  if (data.active === false) return null;
  return data;
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
    const storagePath = typeof asset.storagePath === 'string' ? asset.storagePath : '';
    const externalAccessUrl = typeof asset.externalAccessUrl === 'string' && asset.externalAccessUrl
      ? asset.externalAccessUrl
      : '';
    const deliveryType = asset.type === 'external_course'
      ? 'external_access'
      : asset.deliveryType === 'external_access' || asset.deliveryType === 'hybrid'
        ? asset.deliveryType
        : 'download';
    const externalDelivery = deliveryType === 'external_access' || deliveryType === 'hybrid';
    const requiresExternalFulfillment = externalDelivery;
    if (externalDelivery && !externalAccessUrl) {
      return NextResponse.json(
        { error: 'External access is not configured yet', accessGranted: false },
        { status: 409 }
      );
    }
    if (!assetUrl && !storagePath && !externalAccessUrl) {
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
    
    // 4. Validate tier permissions or direct asset ownership
    const purchase = await getPaidAssetPurchase(user.uid, assetId);
    const hasPurchaseAccess = Boolean(purchase);
    const price = typeof asset.price === 'number' ? asset.price : 0;
    const requiresPurchase = price > 0 || requiresExternalFulfillment;
    const hasAccess = hasPurchaseAccess || (!requiresPurchase && !requiresExternalFulfillment && validateTierAccess(userTier, requiredTier));
    
    if (!hasAccess) {
      console.info(`[${requestId}] Access denied: user ${user.uid} (tier: ${userTier}) attempted to access ${assetId} (requires: ${requiredTier})`);
      
      return NextResponse.json(
        {
          error: 'Access denied: insufficient subscription tier',
          accessGranted: false,
          currentTier: userTier,
          requiredTier: requiredTier,
          requiresPurchase,
          upgradeUrl: '/subscription/upgrade',
        },
        { status: 403 }
      );
    }
    
    if (requiresExternalFulfillment && (!purchase || !['access_sent', 'registration_completed'].includes(String(purchase.provisioningStatus || 'access_pending')))) {
      console.info(`[${requestId}] External access pending fulfillment for user ${user.uid} and asset ${assetId}`);
      return NextResponse.json(
        {
          error: 'Payment confirmed. Your external access is being prepared.',
          message: 'SDC will send your login details after your access has been set up.',
          accessGranted: false,
          fulfillmentPending: true,
          provisioningStatus: purchase?.provisioningStatus || 'access_pending',
          assetId,
        },
        { status: 202 }
      );
    }

    // 5. Access granted - return asset URL
    console.info(`[${requestId}] Access granted: user ${user.uid} (tier: ${userTier}) accessing ${assetId}`);
    const licenseType = asset.licenseType === 'mrr' ? 'mrr' : 'standard';
    const resaleEnabled = asset.resaleEnabled === true;
    const resellerLink = licenseType === 'mrr' && resaleEnabled
      ? await getResellerLink(user.uid, assetId)
      : null;
    let finalAssetUrl = externalAccessUrl || assetUrl;
    if (!externalAccessUrl && storagePath) {
      const [signedUrl] = await adminStorage.bucket().file(storagePath).getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
      });
      finalAssetUrl = signedUrl;
    }
    await adminDb.collection('marketplaceDownloadEvents').add({
      userId: user.uid,
      productId: assetId,
      purchaseId: purchase?.purchaseId || purchase?.id || null,
      assetId,
      requestedAt: new Date(),
      userAgent: request.headers.get('user-agent') || null,
      status: 'granted',
    });
    
    return NextResponse.json(
      {
        assetUrl: finalAssetUrl,
        accessGranted: true,
        assetId,
        asset: {
          title: typeof asset.title === 'string' ? asset.title : 'Marketplace asset',
          licenseType,
          resaleEnabled,
          externalPlatform: typeof asset.externalPlatform === 'string' ? asset.externalPlatform : '',
          accessInstructions: typeof asset.accessInstructions === 'string' ? asset.accessInstructions : '',
          websiteOnboardingInstructions: typeof asset.websiteOnboardingInstructions === 'string'
            ? asset.websiteOnboardingInstructions
            : '',
        },
        userTier,
        accessSource: hasPurchaseAccess ? 'purchase' : 'subscription',
        purchase: purchase ? {
          licenseType: purchase.licenseType === 'mrr' ? 'mrr' : 'standard',
          resaleRights: purchase.resaleRights === true,
        } : null,
        resellerLink: resellerLink ? {
          slug: typeof resellerLink.slug === 'string' ? resellerLink.slug : '',
          url: typeof resellerLink.url === 'string' ? resellerLink.url : '',
        } : null,
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
