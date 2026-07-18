import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebaseAdmin';

const PAYOUT_METHODS = new Set(['bank', 'mpesa', 'paypal', 'paystack', 'mobile_money', 'other']);

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
    const rawMethod = typeof body.method === 'string' ? body.method.trim().slice(0, 40) : '';
    const method = PAYOUT_METHODS.has(rawMethod) ? rawMethod : rawMethod ? 'other' : '';
    const accountName = typeof body.accountName === 'string' ? body.accountName.trim().slice(0, 120) : '';
    const accountDetails = typeof body.accountDetails === 'string' ? body.accountDetails.trim().slice(0, 1000) : '';
    const country = typeof body.country === 'string' ? body.country.trim().slice(0, 80) : '';
    const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase().slice(0, 8) : 'USD';

    if (!method || !accountName || !accountDetails) {
      return NextResponse.json({ error: 'Payout method, account name, and account details are required' }, { status: 400 });
    }

    await adminDb.collection('resellerPayoutProfiles').doc(uid).set({
      userId: uid,
      method,
      accountName,
      accountDetails,
      country,
      currency: currency || 'USD',
      status: 'pending_review',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
}
