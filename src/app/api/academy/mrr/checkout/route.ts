import { FieldValue } from 'firebase-admin/firestore';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAuth } from '@/lib/serverAuth';

const PAYSTACK_API_BASE_URL = 'https://api.paystack.co';

export const POST = createAPIHandler(async (req) => {
  const { uid, email } = await requireAuth(req as any);
  const body = await req.json();
  const courseId = String(body.courseId || '').trim();
  if (!courseId) return apiError('courseId is required.', { status: 400, code: 'INVALID_COURSE_ID' });

  const eligibilityId = `${uid}_${courseId}`;
  const eligibilityRef = adminDb.collection('academyMrrEligibility').doc(eligibilityId);
  const [eligibilitySnap, certificateSnap, userSnap] = await Promise.all([
    eligibilityRef.get(),
    adminDb.collection('academyCertificates').where('userId', '==', uid).where('courseId', '==', courseId).where('status', '==', 'active').limit(1).get(),
    adminDb.collection('users').doc(uid).get(),
  ]);

  if (!eligibilitySnap.exists) {
    return apiError('MRR eligibility was not reserved for this course.', { status: 403, code: 'MRR_NOT_RESERVED' });
  }
  const eligibility = eligibilitySnap.data() || {};
  if (eligibility.status === 'purchased') {
    return apiResponse({ status: 'already_purchased', message: 'Master Resell Rights are already active.' });
  }
  if (eligibility.unlockAfterCertificate !== false && certificateSnap.empty) {
    return apiError('Complete the certification before purchasing Master Resell Rights.', { status: 403, code: 'MRR_CERTIFICATE_REQUIRED' });
  }

  const priceCents = typeof eligibility.priceCents === 'number' && eligibility.priceCents > 0 ? eligibility.priceCents : 999;
  const currency = typeof eligibility.currency === 'string' && eligibility.currency ? eligibility.currency : (process.env.PAYSTACK_CURRENCY || 'USD');
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return apiError('Paystack is not configured for MRR purchases.', { status: 503, code: 'PAYSTACK_NOT_CONFIGURED' });
  }

  const userEmail = email || String(userSnap.data()?.email || '');
  if (!userEmail) return apiError('A verified email is required for checkout.', { status: 400, code: 'EMAIL_REQUIRED' });

  const purchaseId = `${uid}_${courseId}`;
  const purchaseRef = adminDb.collection('academyMrrPurchases').doc(purchaseId);
  const existingPurchase = await purchaseRef.get();
  if (existingPurchase.data()?.status === 'paid') {
    return apiResponse({ status: 'already_purchased', message: 'Master Resell Rights are already active.' });
  }

  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.somatoday.com';
  const callbackUrl = `${frontendUrl.replace(/\/$/, '')}/academy/certificates?mrr=success&courseId=${encodeURIComponent(courseId)}`;
  const response = await fetch(`${PAYSTACK_API_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: userEmail,
      amount: priceCents * 100,
      currency,
      callback_url: callbackUrl,
      metadata: {
        kind: 'academy_mrr_purchase',
        purchaseId,
        userId: uid,
        courseId,
        certificateId: certificateSnap.docs[0]?.id || eligibility.certificateId || null,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.status) {
    return apiError(payload?.message || 'Unable to initialize MRR checkout.', { status: 502, code: 'PAYSTACK_INIT_FAILED' });
  }

  await purchaseRef.set({
    purchaseId,
    userId: uid,
    courseId,
    certificateId: certificateSnap.docs[0]?.id || eligibility.certificateId || null,
    status: 'pending',
    provider: 'paystack',
    priceCents,
    currency,
    paystackReference: payload.data?.reference || null,
    authorizationUrl: payload.data?.authorization_url || null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return apiResponse({
    purchaseId,
    status: 'pending',
    authorizationUrl: payload.data?.authorization_url || null,
  }, { status: 201 });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 5 },
  timeout: 20000,
});
