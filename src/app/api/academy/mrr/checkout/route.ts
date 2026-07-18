import { FieldValue } from 'firebase-admin/firestore';
import { issueAcademyResellerLicense } from '@/academy/commerce';
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
  const [eligibilitySnap, certificateSnap, userSnap, courseSnap] = await Promise.all([
    eligibilityRef.get(),
    adminDb.collection('academyCertificates').where('userId', '==', uid).where('courseId', '==', courseId).where('status', '==', 'active').limit(1).get(),
    adminDb.collection('users').doc(uid).get(),
    adminDb.collection('academyCourses').doc(courseId).get(),
  ]);

  if (!courseSnap.exists) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  const course = courseSnap.data() || {};
  const mrrEnabled = course.mrrEnabled === true || eligibilitySnap.exists;
  if (!mrrEnabled) return apiError('Master Resell Rights are not available for this course.', { status: 403, code: 'MRR_NOT_AVAILABLE' });
  const eligibility = eligibilitySnap.data() || {};
  if (eligibility.status === 'purchased') {
    return apiResponse({ status: 'already_purchased', message: 'Master Resell Rights are already active.' });
  }
  const requiresCertificate = eligibility.unlockAfterCertificate !== false && course.mrrRequiresCertificate !== false;
  if (requiresCertificate && certificateSnap.empty) {
    return apiError('Complete the certification before purchasing Master Resell Rights.', { status: 403, code: 'MRR_CERTIFICATE_REQUIRED' });
  }

  const coursePriceCents = typeof course.mrrPriceCents === 'number' && course.mrrPriceCents > 0 ? course.mrrPriceCents : 999;
  let priceCents = typeof eligibility.priceCents === 'number' && eligibility.priceCents > 0 ? eligibility.priceCents : coursePriceCents;
  if (eligibility.discountKind === 'percent') {
    priceCents = Math.max(0, Math.round(priceCents * (1 - (Number(eligibility.amount) || 0) / 100)));
  } else if (eligibility.discountKind === 'fixed') {
    priceCents = Math.max(0, priceCents - Math.round(Number(eligibility.amount) || 0));
  }
  const currency = typeof eligibility.currency === 'string' && eligibility.currency ? eligibility.currency : (course.mrrCurrency || process.env.PAYSTACK_CURRENCY || 'USD');
  const licenseVersion = typeof eligibility.licenseVersion === 'string' && eligibility.licenseVersion ? eligibility.licenseVersion : (course.mrrLicenseVersion || 'sdc-academy-mrr-v1');
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

  if (priceCents <= 0) {
    await purchaseRef.set({
      purchaseId,
      userId: uid,
      courseId,
      certificateId: certificateSnap.docs[0]?.id || eligibility.certificateId || null,
      status: 'paid',
      provider: 'manual',
      priceCents: 0,
      currency,
      licenseVersion,
      source: 'mrr_discount',
      paidAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await eligibilityRef.set({
      eligibilityId,
      userId: uid,
      courseId,
      status: 'purchased',
      purchasedAt: FieldValue.serverTimestamp(),
      purchaseId,
      priceCents: 0,
      currency,
      licenseVersion,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await issueAcademyResellerLicense({
      userId: uid,
      courseId,
      purchaseId,
      certificateId: certificateSnap.docs[0]?.id || eligibility.certificateId || null,
      licenseVersion,
      priceCents: 0,
      currency,
      source: 'mrr_discount',
    });
    return apiResponse({ purchaseId, status: 'paid', freeByDiscount: true });
  }

  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.somatoday.com';
  const courseSlug = String(course.slug || courseId);
  const callbackUrl = `${frontendUrl.replace(/\/$/, '')}/academy/${encodeURIComponent(courseSlug)}?mrr=success&courseId=${encodeURIComponent(courseId)}`;
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
        licenseVersion,
        source: eligibility.source || 'academy_course_mrr',
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
    licenseVersion,
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
