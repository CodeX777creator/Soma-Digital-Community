import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebaseAdmin';

const VALID_STATUSES = new Set(['not_required', 'access_pending', 'access_sent', 'registration_completed']);

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('UNAUTHENTICATED');
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7).trim(), true);
  const profileSnap = await adminDb.collection('users').doc(decoded.uid).get();
  const profile = profileSnap.data() || {};
  const roles = Array.isArray(profile.roles) ? profile.roles : [];
  if (profile.isAdmin !== true && profile.role !== 'admin' && !roles.includes('admin')) {
    throw new Error('FORBIDDEN');
  }
  return decoded.uid;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const adminUid = await verifyAdmin(request);
    const body = await request.json().catch(() => ({}));
    const purchaseId = typeof body.purchaseId === 'string' ? body.purchaseId : '';
    const provisioningStatus = typeof body.provisioningStatus === 'string' ? body.provisioningStatus : '';
    const provisioningNotes = typeof body.provisioningNotes === 'string' ? body.provisioningNotes.trim().slice(0, 1000) : '';

    if (!purchaseId || !VALID_STATUSES.has(provisioningStatus)) {
      return NextResponse.json({ error: 'Valid purchaseId and provisioningStatus are required' }, { status: 400 });
    }

    await adminDb.collection('assetPurchases').doc(purchaseId).set({
      provisioningStatus,
      provisioningNotes: provisioningNotes || null,
      provisioningUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      provisioningUpdatedBy: adminUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Failed to update provisioning:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
