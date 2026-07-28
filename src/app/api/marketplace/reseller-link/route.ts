import { NextRequest, NextResponse } from 'next/server';
import { createAcademyResellerLink } from '@/academy/commerce';
import { admin, adminAuth, adminDb } from '@/lib/firebaseAdmin';

interface ResellerLinkRequest {
  assetId: string;
  courseId?: string;
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

    const assetId = typeof body.assetId === 'string' ? body.assetId : '';
    const courseId = typeof body.courseId === 'string' ? body.courseId : '';
    if (!assetId && !courseId) {
      return NextResponse.json({ error: 'Missing product or course ID' }, { status: 400 });
    }

    let user: { uid: string; email?: string };
    try {
      user = await verifyAuthToken(request);
    } catch {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (courseId) {
      const [courseDoc, licenseDoc] = await Promise.all([
        adminDb.collection('academyCourses').doc(courseId).get(),
        adminDb.collection('academyResellerLicenses').doc(`${user.uid}_${courseId}`).get(),
      ]);
      if (!courseDoc.exists || courseDoc.data()?.status !== 'published') {
        return NextResponse.json({ error: 'Academy course not found' }, { status: 404 });
      }
      if (!licenseDoc.exists || licenseDoc.data()?.status !== 'active') {
        return NextResponse.json({ error: 'Academy MRR license required before creating a reseller link' }, { status: 403 });
      }
      const course = courseDoc.data() || {};
      const link = await createAcademyResellerLink({
        userId: user.uid,
        courseId,
        courseTitle: String(course.title || 'Academy course'),
        courseSlug: String(course.slug || courseId),
        resalePriceCents: typeof course.priceCents === 'number' ? course.priceCents : 0,
        baseUrl: getBaseUrl(request),
      });
      return NextResponse.json({
        resellerLink: {
          slug: link?.slug || '',
          url: link?.url || '',
          active: link?.active !== false,
        },
      });
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
    const slug = `${titleSlug}-${userSlug}-${assetId.slice(0, 8).toLowerCase()}`;
    const baseUrl = getBaseUrl(request);
    const url = `${baseUrl}/marketplace/${encodeURIComponent(assetId)}?ref=${encodeURIComponent(slug)}`;

    await adminDb.runTransaction(async (transaction) => {
      const latest = await transaction.get(linkRef);
      if (latest.exists) return;
      transaction.set(linkRef, {
      userId: user.uid,
      assetId,
      slug,
      url,
      canonicalUrl: url,
      active: true,
      status: 'active',
      itemType: 'marketplace_product',
      licenseType: 'mrr',
      resalePriceCents: Math.round((typeof asset.resalePrice === 'number' ? asset.resalePrice : asset.price || 0) * 100),
      resellerCommissionType: asset.resellerCommissionType === 'fixed' ? 'fixed' : 'percentage',
      resellerCommissionValue: typeof asset.resellerCommissionValue === 'number' ? asset.resellerCommissionValue : 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
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
