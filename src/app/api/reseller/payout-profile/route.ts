import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebaseAdmin';

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) throw new Error('UNAUTHENTICATED');
  const token = authHeader.slice(7).trim();
  const decoded = await adminAuth.verifyIdToken(token, true);
  if (!decoded.uid) throw new Error('UNAUTHENTICATED');
  return decoded.uid;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const uid = await verifyUser(request);
    const snap = await adminDb.collection('resellerPayoutProfiles').doc(uid).get();
    return NextResponse.json({ profile: snap.exists ? snap.data() : null });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const uid = await verifyUser(request);
    const body = await request.json().catch(() => ({}));
    const method = typeof body.method === 'string' ? body.method.trim().slice(0, 40) : '';
    const accountName = typeof body.accountName === 'string' ? body.accountName.trim().slice(0, 120) : '';
    const accountDetails = typeof body.accountDetails === 'string' ? body.accountDetails.trim().slice(0, 1000) : '';

    if (!method || !accountName || !accountDetails) {
      return NextResponse.json({ error: 'Payout method, account name, and account details are required' }, { status: 400 });
    }

    await adminDb.collection('resellerPayoutProfiles').doc(uid).set({
      userId: uid,
      method,
      accountName,
      accountDetails,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
