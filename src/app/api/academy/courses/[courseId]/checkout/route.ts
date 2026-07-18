import { FieldValue } from 'firebase-admin/firestore';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAuth } from '@/lib/serverAuth';
import { PromoError, recordFailedPromoRedemption, redeemPromoCode } from '@/promos';

const PAYSTACK_API_BASE_URL = 'https://api.paystack.co';

function normalizeCourse(raw: FirebaseFirestore.DocumentData, courseId: string) {
  const priceCents = Number.isFinite(raw.priceCents) ? Math.max(0, Math.round(raw.priceCents)) : 0;
  const salePriceCents = raw.salePriceCents == null ? null : Math.max(0, Math.round(raw.salePriceCents));
  return {
    courseId,
    title: raw.title || 'Academy course',
    slug: raw.slug || courseId,
    status: raw.status || 'draft',
    pricingType: raw.pricingType || 'free',
    priceCents,
    salePriceCents,
    effectivePriceCents: salePriceCents != null ? salePriceCents : priceCents,
    currency: raw.currency || 'USD',
  };
}

async function getDiscountedPriceCents(userId: string, courseId: string, basePriceCents: number) {
  const discounts = await adminDb.collection('academyCourseEntitlements')
    .where('userId', '==', userId)
    .where('courseId', '==', courseId)
    .where('entitlementType', '==', 'course_discount')
    .where('status', '==', 'active')
    .limit(5)
    .get();
  let price = basePriceCents;
  for (const doc of discounts.docs) {
    const data = doc.data();
    if (data.discountKind === 'percent') {
      price = Math.min(price, Math.max(0, Math.round(basePriceCents * (1 - (Number(data.amount) || 0) / 100))));
    } else if (data.discountKind === 'fixed') {
      price = Math.min(price, Math.max(0, basePriceCents - Math.round(Number(data.amount) || 0)));
    }
  }
  return price;
}

export const POST = createAPIHandler(async (req, context) => {
  const { uid, email } = await requireAuth(req as any);
  const { courseId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const resellerSlug = typeof body.resellerSlug === 'string' ? body.resellerSlug.trim().slice(0, 120) : '';
  const promoCode = typeof body.promoCode === 'string' ? body.promoCode.trim() : '';
  const courseSnap = await adminDb.collection('academyCourses').doc(courseId).get();
  if (!courseSnap.exists) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });

  const course = normalizeCourse(courseSnap.data() || {}, courseSnap.id);
  if (course.status !== 'published') return apiError('Academy course is not available.', { status: 404, code: 'ACADEMY_COURSE_NOT_AVAILABLE' });
  if (course.pricingType === 'free') return apiError('This course is free. Enroll directly.', { status: 400, code: 'ACADEMY_COURSE_FREE' });
  if (course.pricingType === 'promo_only') return apiError('This course requires an Academy unlock code.', { status: 403, code: 'ACADEMY_PROMO_REQUIRED' });

  const purchaseId = `${uid}_${courseId}`;
  const purchaseRef = adminDb.collection('academyCoursePurchases').doc(purchaseId);
  const existingPurchase = await purchaseRef.get();
  if (existingPurchase.data()?.status === 'paid') {
    return apiResponse({ status: 'already_purchased', purchaseId, message: 'Course purchase is already active.' });
  }

  let promoRedemption: Awaited<ReturnType<typeof redeemPromoCode>> | null = null;
  if (promoCode) {
    try {
      promoRedemption = await redeemPromoCode({
        code: promoCode,
        userId: uid,
        email,
        surface: 'academy_checkout',
        context: { courseId, checkoutType: 'academy_course' },
        metadata: {
          source: 'academy_checkout',
          path: `/academy/${course.slug}`,
        },
      });
    } catch (error) {
      if (error instanceof PromoError) {
        await recordFailedPromoRedemption({
          code: promoCode,
          userId: uid,
          email,
          surface: 'academy_checkout',
          context: { courseId, checkoutType: 'academy_course' },
          failureReason: error.code,
          metadata: {
            source: 'academy_checkout',
            path: `/academy/${course.slug}`,
          },
        }).catch(() => null);
        return apiError(error.message, { status: error.status, code: error.code });
      }
      throw error;
    }
  }

  if (promoRedemption?.benefitsGranted.some((benefit) => benefit === `academy_course_free:${courseId}`)) {
    return apiResponse({
      status: 'unlocked',
      purchaseId,
      freeByPromo: true,
      message: 'Founder Member Bonus applied. Your Academy course is included.',
      promo: {
        code: promoRedemption.code,
        benefitsGranted: promoRedemption.benefitsGranted,
      },
    });
  }

  const priceCents = await getDiscountedPriceCents(uid, courseId, course.effectivePriceCents);
  if (priceCents <= 0) {
    await adminDb.collection('academyCourseEntitlements').doc(purchaseId).set({
      entitlementId: purchaseId,
      userId: uid,
      email: email || null,
      courseId,
      entitlementType: 'free_course',
      source: 'course_discount',
      promoId: promoRedemption?.promoId || null,
      promoCode: promoRedemption?.code || null,
      status: 'active',
      pricePaidCents: 0,
      grantedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return apiResponse({
      status: 'unlocked',
      purchaseId,
      freeByDiscount: true,
      promo: promoRedemption ? {
        code: promoRedemption.code,
        benefitsGranted: promoRedemption.benefitsGranted,
      } : null,
    });
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return apiError('Paystack is not configured for Academy purchases.', { status: 503, code: 'PAYSTACK_NOT_CONFIGURED' });
  const userSnap = await adminDb.collection('users').doc(uid).get();
  const userEmail = email || String(userSnap.data()?.email || '');
  if (!userEmail) return apiError('A verified email is required for checkout.', { status: 400, code: 'EMAIL_REQUIRED' });

  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.somatoday.com';
  const callbackUrl = `${frontendUrl.replace(/\/$/, '')}/academy/${encodeURIComponent(course.slug)}?purchase=success&courseId=${encodeURIComponent(courseId)}`;
  const checkoutRef = adminDb.collection('academyCourseCheckoutSessions').doc();
  let resellerUserId = '';
  if (resellerSlug) {
    const linkSnap = await adminDb
      .collection('resellerLinks')
      .where('slug', '==', resellerSlug)
      .where('courseId', '==', courseId)
      .limit(1)
      .get();
    const link = linkSnap.docs[0]?.data() || null;
    if (link?.active !== false && typeof link?.userId === 'string' && link.userId !== uid) {
      resellerUserId = link.userId;
    }
  }

  const response = await fetch(`${PAYSTACK_API_BASE_URL}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: userEmail,
      amount: priceCents * 100,
      currency: course.currency,
      callback_url: callbackUrl,
      metadata: {
        kind: 'academy_course_purchase',
        checkoutSessionId: checkoutRef.id,
        purchaseId,
        userId: uid,
        courseId,
        resellerSlug: resellerUserId ? resellerSlug : undefined,
        resellerUserId: resellerUserId || undefined,
        promoCode: promoRedemption?.code || undefined,
        promoId: promoRedemption?.promoId || undefined,
        promoBenefitsGranted: promoRedemption?.benefitsGranted || undefined,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.status) {
    return apiError(payload?.message || 'Unable to initialize Academy checkout.', { status: 502, code: 'PAYSTACK_INIT_FAILED' });
  }

  const reference = payload.data?.reference || null;
  await checkoutRef.set({
    checkoutSessionId: checkoutRef.id,
    purchaseId,
    userId: uid,
    email: userEmail,
    courseId,
    status: 'pending',
    provider: 'paystack',
    priceCents,
    currency: course.currency,
    paystackReference: reference,
    authorizationUrl: payload.data?.authorization_url || null,
    resellerSlug: resellerUserId ? resellerSlug : null,
    resellerUserId: resellerUserId || null,
    promoCode: promoRedemption?.code || null,
    promoId: promoRedemption?.promoId || null,
    promoBenefitsGranted: promoRedemption?.benefitsGranted || [],
    originalPriceCents: course.effectivePriceCents,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await purchaseRef.set({
    purchaseId,
    userId: uid,
    courseId,
    status: 'pending',
    provider: 'paystack',
    priceCents,
    currency: course.currency,
    paystackReference: reference,
    checkoutSessionId: checkoutRef.id,
    resellerSlug: resellerUserId ? resellerSlug : null,
    resellerUserId: resellerUserId || null,
    promoCode: promoRedemption?.code || null,
    promoId: promoRedemption?.promoId || null,
    promoBenefitsGranted: promoRedemption?.benefitsGranted || [],
    originalPriceCents: course.effectivePriceCents,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return apiResponse({
    purchaseId,
    checkoutSessionId: checkoutRef.id,
    status: 'pending',
    authorizationUrl: payload.data?.authorization_url || null,
    promo: promoRedemption ? {
      code: promoRedemption.code,
      benefitsGranted: promoRedemption.benefitsGranted,
    } : null,
  }, { status: 201 });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 5 },
  timeout: 20000,
});
