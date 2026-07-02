import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebaseAdmin';

interface ResellerLinkRequest {
  assetId: string;
}

async function verifyAuthToken(request: NextRequest): Promise<{ uid: string; email?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('INVALID_AUTH');
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw new Error('INVALID_AUTH');
  }

  const decodedToken = await adminAuth.verifyIdToken(idToken, true);
  if (!decodedToken.uid) {
    throw new Error('INVALID_AUTH');
  }

  return { uid: decodedToken.uid, email: decodedToken.email };
}

function buildSlug(seed: string) {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
}

function getBaseUrl(request: NextRequest) {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, '');

  const origin = request.headers.get('origin');
  if (origin) return origin.replace(/\/$/, '');

  const host = request.headers.get('host') || 'localhost:9002';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

async function findPaidPurchase(uid: string, assetId: string) {
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    let body: Partial<ResellerLinkRequest>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const assetId = body.assetId;
    if (!assetId || typeof assetId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid assetId' }, { status: 400 });
    }

    let user: { uid: string; email?: string };
    try {
      user = await verifyAuthToken(request);
    } catch {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const assetDoc = await adminDb.collection('marketplaceAssets').doc(assetId).get();
    if (!assetDoc.exists || assetDoc.data()?.published === false) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const asset = assetDoc.data() || {};
    if (asset.licenseType !== 'mrr' || asset.resaleEnabled !== true) {
      return NextResponse.json({ error: 'This asset is not enabled for resale' }, { status: 403 });
    }

    const purchase = await findPaidPurchase(user.uid, assetId);
    if (!purchase || purchase.licenseType !== 'mrr' || purchase.resaleRights !== true) {
      return NextResponse.json({ error: 'MRR purchase required before creating a reseller link' }, { status: 403 });
    }

    const linkRef = adminDb.collection('resellerLinks').doc(`${user.uid}_${assetId}`);
    const existingLink = await linkRef.get();
    if (existingLink.exists) {
      const existingData = existingLink.data() || {};
      return NextResponse.json({
        resellerLink: {
          slug: existingData.slug || '',
          url: existingData.url || '',
          active: existingData.active !== false,
        },
      });
    }

    const titleSlug = buildSlug(typeof asset.title === 'string' ? asset.title : assetId) || 'asset';
    const userSlug = user.uid.slice(0, 8).toLowerCase();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const slug = `${titleSlug}-${userSlug}-${randomSuffix}`;
    const baseUrl = getBaseUrl(request);
    const url = `${baseUrl}/marketplace?asset=${encodeURIComponent(assetId)}&ref=${encodeURIComponent(slug)}`;

    await linkRef.set({
      userId: user.uid,
      assetId,
      slug,
      url,
      active: true,
      licenseType: 'mrr',
      resalePrice: typeof asset.resalePrice === 'number' ? asset.resalePrice : asset.price || 0,
      resellerCommissionType: asset.resellerCommissionType === 'fixed' ? 'fixed' : 'percentage',
      resellerCommissionValue: typeof asset.resellerCommissionValue === 'number' ? asset.resellerCommissionValue : 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      resellerLink: {
        slug,
        url,
        active: true,
      },
    });
  } catch (error) {
    console.error('Failed to create reseller link:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
