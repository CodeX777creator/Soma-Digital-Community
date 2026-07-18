import { FieldValue } from 'firebase-admin/firestore';
import { issueAcademyResellerLicense } from '@/academy/commerce';
import { writeAdminAuditLog } from '@/admin/audit';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { ensureInitialAcademyProgress } from '@/academy/service';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAuth } from '@/lib/serverAuth';

const PAYSTACK_API_BASE_URL = 'https://api.paystack.co';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const reference = String(body.reference || body.paystackReference || '').trim();
  if (!reference) return apiError('Payment reference is required.', { status: 400, code: 'PAYMENT_REFERENCE_REQUIRED' });

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) return apiError('Paystack is not configured.', { status: 503, code: 'PAYSTACK_NOT_CONFIGURED' });

  const response = await fetch(`${PAYSTACK_API_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.status) {
    return apiError(payload?.message || 'Unable to verify payment.', { status: 502, code: 'PAYSTACK_VERIFY_FAILED' });
  }

  const data = payload.data || {};
  if (data.status !== 'success') {
    return apiError('Payment has not completed successfully.', { status: 402, code: 'PAYMENT_NOT_SUCCESSFUL' });
  }

  const metadata = data.metadata || {};
  if (metadata.userId !== uid) {
    return apiError('Payment reference does not belong to this account.', { status: 403, code: 'PAYMENT_OWNER_MISMATCH' });
  }

  const courseId = String(metadata.courseId || '');
  if (!courseId) return apiError('Payment is missing course metadata.', { status: 400, code: 'PAYMENT_COURSE_MISSING' });

  const courseSnap = await adminDb.collection('academyCourses').doc(courseId).get();
  if (!courseSnap.exists) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  const course = courseSnap.data() || {};
  const enrollmentId = `${uid}_${courseId}`;
  const paidCents = Math.round((Number(data.amount) || 0) / 100);
  const currency = data.currency || course.currency || 'USD';

  if (metadata.kind === 'academy_mrr_purchase') {
    const purchaseId = String(metadata.purchaseId || `${uid}_${courseId}`);
    const eligibilityId = `${uid}_${courseId}`;
    const batch = adminDb.batch();
    batch.set(adminDb.collection('academyMrrPurchases').doc(purchaseId), {
      purchaseId,
      userId: uid,
      courseId,
      certificateId: metadata.certificateId || null,
      status: 'paid',
      provider: 'paystack',
      priceCents: paidCents,
      currency,
      licenseVersion: metadata.licenseVersion || course.mrrLicenseVersion || 'sdc-academy-mrr-v1',
      paystackReference: reference,
      paidAt: FieldValue.serverTimestamp(),
      providerPayload: {
        id: data.id || null,
        channel: data.channel || null,
        gateway_response: data.gateway_response || null,
      },
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(adminDb.collection('academyMrrEligibility').doc(eligibilityId), {
      eligibilityId,
      userId: uid,
      courseId,
      certificateId: metadata.certificateId || null,
      source: metadata.source || 'academy_mrr_checkout',
      status: 'purchased',
      priceCents: paidCents,
      currency,
      licenseVersion: metadata.licenseVersion || course.mrrLicenseVersion || 'sdc-academy-mrr-v1',
      purchasedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    await issueAcademyResellerLicense({
      userId: uid,
      courseId,
      purchaseId,
      certificateId: metadata.certificateId || null,
      licenseVersion: metadata.licenseVersion || course.mrrLicenseVersion || 'sdc-academy-mrr-v1',
      priceCents: paidCents,
      currency,
      source: metadata.source || 'academy_mrr_checkout',
    });
    await writeAdminAuditLog({
      adminId: 'system',
      action: 'academy_mrr_purchase_verified',
      entityType: 'academyMrrPurchase',
      entityId: purchaseId,
      metadata: { userId: uid, courseId, reference, priceCents: paidCents, currency },
    });
    return apiResponse({ ok: true, status: 'paid', purchaseId, courseId, kind: 'academy_mrr_purchase' });
  }

  if (metadata.kind !== 'academy_course_purchase') {
    return apiError('This payment reference is not for an Academy purchase.', { status: 400, code: 'PAYMENT_KIND_INVALID' });
  }

  const purchaseId = String(metadata.purchaseId || `${uid}_${courseId}`);

  const batch = adminDb.batch();
  batch.set(adminDb.collection('academyCoursePurchases').doc(purchaseId), {
    purchaseId,
    userId: uid,
    courseId,
    status: 'paid',
    provider: 'paystack',
    priceCents: paidCents,
    currency,
    paystackReference: reference,
    paidAt: FieldValue.serverTimestamp(),
    providerPayload: {
      id: data.id || null,
      channel: data.channel || null,
      gateway_response: data.gateway_response || null,
    },
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(adminDb.collection('academyCourseEntitlements').doc(enrollmentId), {
    entitlementId: enrollmentId,
    userId: uid,
    courseId,
    entitlementType: 'paid_course',
    source: 'academy_checkout',
    status: 'active',
    pricePaidCents: paidCents,
    grantedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(adminDb.collection('academyEnrollments').doc(enrollmentId), {
    enrollmentId,
    userId: uid,
    courseId,
    cohortId: null,
    status: 'active',
    source: 'paid_purchase',
    enrolledAt: FieldValue.serverTimestamp(),
    completedAt: null,
    lastAccessedAt: FieldValue.serverTimestamp(),
    progressPercent: 0,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (typeof metadata.resellerUserId === 'string' && metadata.resellerUserId && metadata.resellerUserId !== uid) {
    const grossAmount = paidCents / 100;
    batch.set(adminDb.collection('resellerSales').doc(`${purchaseId}_${reference}`), {
      resellerUserId: metadata.resellerUserId,
      buyerUserId: uid,
      assetId: courseId,
      itemType: 'academy_course',
      purchaseId,
      grossAmount,
      commissionBase: 'full_price',
      commissionableAmount: grossAmount,
      platformFee: 0,
      resellerEarnings: grossAmount,
      commissionType: 'percentage',
      commissionValue: 100,
      status: 'payable',
      provider: 'paystack',
      paystackReference: reference,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  if (metadata.checkoutSessionId) {
    batch.set(adminDb.collection('academyCourseCheckoutSessions').doc(String(metadata.checkoutSessionId)), {
      status: 'paid',
      verifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
  await ensureInitialAcademyProgress(uid, courseId);
  await writeAdminAuditLog({
    adminId: 'system',
    action: 'academy_course_purchase_verified',
    entityType: 'academyCoursePurchase',
    entityId: purchaseId,
    metadata: { userId: uid, courseId, reference, priceCents: paidCents, currency },
  });

  return apiResponse({ ok: true, status: 'paid', purchaseId, courseId, kind: 'academy_course_purchase' });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
  timeout: 20000,
});
