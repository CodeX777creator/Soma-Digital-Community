import { FieldValue } from 'firebase-admin/firestore';
import { issueAcademyResellerLicense } from '@/academy/commerce';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAuth } from '@/lib/serverAuth';
import { PromoError, recordFailedPromoRedemption, redeemPromoCode } from '@/promos';

const PAYSTACK_API_BASE_URL = 'https://api.paystack.co';

export const POST = createAPIHandler(async (req) => {
  const { uid, email } = await requireAuth(req as any);
  const body = await req.json();
  const courseId = String(body.courseId || '').trim();
  const promoCode = typeof body.promoCode === 'string' ? body.promoCode.trim() : '';
  if (!courseId) return apiError('courseId is required.', { status: 400, code: 'INVALID_COURSE_ID' });

  const eligibilityId = `${uid}_${courseId}`;
  const eligibilityRef = adminDb.collection('academyMrrEligibility').doc(eligibilityId);
  let [eligibilitySnap, certificateSnap, userSnap, courseSnap] = await Promise.all([
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

  let promoRedemption: Awaited<ReturnType<typeof redeemPromoCode>> | null = null;
  if (promoCode) {
    try {
      promoRedemption = await redeemPromoCode({
        code: promoCode,
        userId: uid,
        email,
        surface: 'mrr_checkout',
        context: { courseId, checkoutType: 'academy_mrr' },
        metadata: {
          source: 'mrr_checkout',
          path: `/academy/${String(course.slug || courseId)}`,
        },
      });
      eligibilitySnap = await eligibilityRef.get();
    } catch (error) {
      if (error instanceof PromoError) {
        await recordFailedPromoRedemption({
          code: promoCode,
          userId: uid,
          email,
          surface: 'mrr_checkout',
          context: { courseId, checkoutType: 'academy_mrr' },
          failureReason: error.code,
          metadata: {
            source: 'mrr_checkout',
            path: `/academy/${String(course.slug || courseId)}`,
          },
        }).catch(() => null);
        return apiError(error.message, { status: error.status, code: error.code });
      }
      throw error;
    }
  }

  const updatedEligibility = eligibilitySnap.data() || eligibility;
  const coursePriceCents = typeof course.mrrPriceCents === 'number' && course.mrrPriceCents > 0 ? course.mrrPriceCents : 999;
  let priceCents = typeof updatedEligibility.priceCents === 'number' && updatedEligibility.priceCents > 0 ? updatedEligibility.priceCents : coursePriceCents;
  if (updatedEligibility.discountKind === 'percent') {
    priceCents = Math.max(0, Math.round(priceCents * (1 - (Number(updatedEligibility.amount) || 0) / 100)));
  } else if (updatedEligibility.discountKind === 'fixed') {
    priceCents = Math.max(0, priceCents - Math.round(Number(updatedEligibility.amount) || 0));
  }
  const currency = typeof updatedEligibility.currency === 'string' && updatedEligibility.currency ? updatedEligibility.currency : (course.mrrCurrency || process.env.PAYSTACK_CURRENCY || 'USD');
  const licenseVersion = typeof updatedEligibility.licenseVersion === 'string' && updatedEligibility.licenseVersion ? updatedEligibility.licenseVersion : (course.mrrLicenseVersion || 'sdc-academy-mrr-v1');
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
      certificateId: certificateSnap.docs[0]?.id || updatedEligibility.certificateId || null,
      status: 'paid',
      provider: 'manual',
      priceCents: 0,
      currency,
      licenseVersion,
      source: 'mrr_discount',
      promoId: promoRedemption?.promoId || null,
      promoCode: promoRedemption?.code || null,
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
      promoId: promoRedemption?.promoId || null,
      promoCode: promoRedemption?.code || null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await issueAcademyResellerLicense({
      userId: uid,
      courseId,
      purchaseId,
      certificateId: certificateSnap.docs[0]?.id || updatedEligibility.certificateId || null,
      licenseVersion,
      priceCents: 0,
      currency,
      source: 'mrr_discount',
    });
    return apiResponse({
      purchaseId,
      status: 'paid',
      freeByDiscount: true,
      promo: promoRedemption ? { code: promoRedemption.code, benefitsGranted: promoRedemption.benefitsGranted } : null,
    });
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
      amount: priceCents,
      currency,
      callback_url: callbackUrl,
      metadata: {
        kind: 'academy_mrr_purchase',
        purchaseId,
        userId: uid,
        courseId,
        certificateId: certificateSnap.docs[0]?.id || updatedEligibility.certificateId || null,
        licenseVersion,
        source: updatedEligibility.source || 'academy_course_mrr',
        promoCode: promoRedemption?.code || undefined,
        promoId: promoRedemption?.promoId || undefined,
        promoBenefitsGranted: promoRedemption?.benefitsGranted || undefined,
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
    certificateId: certificateSnap.docs[0]?.id || updatedEligibility.certificateId || null,
    status: 'pending',
    provider: 'paystack',
    priceCents,
    currency,
    licenseVersion,
    paystackReference: payload.data?.reference || null,
    authorizationUrl: payload.data?.authorization_url || null,
    promoCode: promoRedemption?.code || null,
    promoId: promoRedemption?.promoId || null,
    promoBenefitsGranted: promoRedemption?.benefitsGranted || [],
    originalPriceCents: coursePriceCents,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return apiResponse({
    purchaseId,
    status: 'pending',
    authorizationUrl: payload.data?.authorization_url || null,
    promo: promoRedemption ? { code: promoRedemption.code, benefitsGranted: promoRedemption.benefitsGranted } : null,
  }, { status: 201 });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 5 },
  timeout: 20000,
});