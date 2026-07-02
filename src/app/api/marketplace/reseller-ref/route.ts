import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug') || '';
  const assetId = searchParams.get('assetId') || '';

  if (!slug || !assetId) {
    return NextResponse.json({ reseller: null });
  }

  try {
    const linkSnap = await adminDb
      .collection('resellerLinks')
      .where('slug', '==', slug)
      .where('assetId', '==', assetId)
      .limit(1)
      .get();

    if (linkSnap.empty) {
      return NextResponse.json({ reseller: null });
    }

    const link = linkSnap.docs[0].data();
    if (link.active === false || typeof link.userId !== 'string') {
      return NextResponse.json({ reseller: null });
    }

    const userSnap = await adminDb.collection('users').doc(link.userId).get();
    const user = userSnap.data() || {};

    return NextResponse.json({
      reseller: {
        userId: link.userId,
        name: user.name || user.displayName || 'SDC reseller',
      },
    });
  } catch (error) {
    console.error('Failed to resolve reseller ref:', error);
    return NextResponse.json({ reseller: null }, { status: 500 });
  }
}
