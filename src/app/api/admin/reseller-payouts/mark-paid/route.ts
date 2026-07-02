import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebaseAdmin';

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('UNAUTHENTICATED');
  }

  const token = authHeader.slice(7).trim();
  const decoded = await adminAuth.verifyIdToken(token, true);
  const profileSnap = await adminDb.collection('users').doc(decoded.uid).get();
  const profile = profileSnap.data() || {};
  const roles = Array.isArray(profile.roles) ? profile.roles : [];
  const isAdmin = profile.isAdmin === true || profile.role === 'admin' || roles.includes('admin');

  if (!isAdmin) {
    throw new Error('FORBIDDEN');
  }

  return decoded.uid;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const adminUid = await verifyAdmin(request);
    const body = await request.json().catch(() => ({}));
    const saleId = typeof body.saleId === 'string' ? body.saleId : '';
    const payoutReference = typeof body.payoutReference === 'string' ? body.payoutReference.trim() : '';
    const payoutNotes = typeof body.payoutNotes === 'string' ? body.payoutNotes.trim().slice(0, 1000) : '';

    if (!saleId) {
      return NextResponse.json({ error: 'saleId is required' }, { status: 400 });
    }

    const saleRef = adminDb.collection('resellerSales').doc(saleId);
    const saleSnap = await saleRef.get();
    if (!saleSnap.exists) {
      return NextResponse.json({ error: 'Commission record not found' }, { status: 404 });
    }

    await saleRef.set({
      status: 'paid',
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      payoutReference: payoutReference || null,
      payoutNotes: payoutNotes || null,
      paidBy: adminUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const sale = saleSnap.data() || {};
    if (typeof sale.resellerUserId === 'string' && sale.resellerUserId) {
      await adminDb.collection('users').doc(sale.resellerUserId).collection('notifications').add({
        type: 'marketplace',
        title: 'Commission paid',
        message: 'An SDC reseller commission has been marked as paid.',
        link: '/reseller',
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Failed to mark reseller payout paid:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
