import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { getEffectiveUserTier } from '@/lib/tier';
import {
  PROMO_BENEFIT_TYPES,
  PROMO_CAMPAIGN_STATUSES,
  PROMO_COLLECTIONS,
  type PromoAudienceRules,
  type PromoBenefit,
  type PromoCampaignDoc,
  type PromoCampaignStatus,
  type PromoRedeemResult,
} from './types';

export class PromoError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = 'PromoError';
  }
}

type CreatePromoInput = {
  code: string;
  name: string;
  description?: string;
  status?: PromoCampaignStatus;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  maxRedemptions?: number | null;
  audienceRules?: PromoAudienceRules;
  benefits: PromoBenefit[];
  createdBy: string;
};

export const FOUNDER_CAMPAIGN_TEMPLATE = {
  code: 'FOUNDER100',
  name: 'Founder Member Bonus',
  description: 'First 100 founder members receive the Digital Marketing Certification course and MRR eligibility after certification.',
  maxRedemptions: 100,
  audienceRules: {
    onePerUser: true,
    onePerEmail: true,
  },
  benefits: [
    {
      type: 'academy_course_free' as const,
      courseId: 'digital-marketing-certification',
      label: 'Digital Marketing Certification included',
    },
    {
      type: 'mrr_license_unlock' as const,
      courseId: 'digital-marketing-certification',
      unlockAfterCertificate: true,
      priceCents: 999,
      currency: 'USD',
      label: 'MRR eligibility reserved',
    },
  ],
};

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

function now() {
  return FieldValue.serverTimestamp();
}

function asTimestamp(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new PromoError('Invalid promo campaign date.', 'PROMO_INVALID_DATE', 400);
  }
  return Timestamp.fromDate(date);
}

function timestampMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function cleanUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function assertPositiveNumber(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new PromoError(`${field} must be a positive number.`, 'PROMO_INVALID_BENEFIT', 400);
  }
}

function validateBenefit(benefit: PromoBenefit) {
  if (!PROMO_BENEFIT_TYPES.includes(benefit.type)) {
    throw new PromoError('Unsupported promo benefit type.', 'PROMO_INVALID_BENEFIT', 400);
  }

  switch (benefit.type) {
    case 'academy_course_free':
    case 'academy_course_discount':
    case 'mrr_license_unlock':
    case 'mrr_license_discount':
      if (!benefit.courseId || typeof benefit.courseId !== 'string') {
        throw new PromoError('Academy promo benefits require a courseId.', 'PROMO_INVALID_BENEFIT', 400);
      }
      break;
    case 'marketplace_product_free':
    case 'marketplace_product_discount':
      if (!benefit.productId || typeof benefit.productId !== 'string') {
        throw new PromoError('Marketplace promo benefits require a productId.', 'PROMO_INVALID_BENEFIT', 400);
      }
      break;
  }

  if ('amount' in benefit) assertPositiveNumber(benefit.amount, 'Discount amount');
  if (benefit.type === 'creator_credit_bonus') assertPositiveNumber(benefit.credits, 'Creator credits');
}

function validateCampaignInput(input: CreatePromoInput) {
  const normalizedCode = normalizePromoCode(input.code || '');
  if (!normalizedCode || normalizedCode.length < 3 || normalizedCode.length > 64) {
    throw new PromoError('Promo code must be between 3 and 64 characters.', 'PROMO_INVALID_CODE', 400);
  }
  if (!input.name || input.name.trim().length < 2) {
    throw new PromoError('Promo campaign name is required.', 'PROMO_INVALID_NAME', 400);
  }
  if (!Array.isArray(input.benefits) || input.benefits.length === 0) {
    throw new PromoError('At least one promo benefit is required.', 'PROMO_MISSING_BENEFITS', 400);
  }
  input.benefits.forEach(validateBenefit);
  if (input.maxRedemptions != null && (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions <= 0)) {
    throw new PromoError('maxRedemptions must be a positive integer.', 'PROMO_INVALID_LIMIT', 400);
  }
  if (input.status && !PROMO_CAMPAIGN_STATUSES.includes(input.status)) {
    throw new PromoError('Invalid promo campaign status.', 'PROMO_INVALID_STATUS', 400);
  }
  return normalizedCode;
}

export async function createPromoCampaign(input: CreatePromoInput) {
  const normalizedCode = validateCampaignInput(input);
  const campaignRef = adminDb.collection(PROMO_COLLECTIONS.campaigns).doc(normalizedCode);
  const existing = await campaignRef.get();
  if (existing.exists) {
    throw new PromoError('Promo code already exists.', 'PROMO_CODE_EXISTS', 409);
  }

  const doc = cleanUndefined({
    promoId: campaignRef.id,
    code: input.code.trim(),
    normalizedCode,
    name: input.name.trim(),
    description: input.description?.trim() || '',
    status: input.status || 'draft',
    startsAt: asTimestamp(input.startsAt),
    endsAt: asTimestamp(input.endsAt),
    maxRedemptions: input.maxRedemptions ?? null,
    redemptionCount: 0,
    audienceRules: {
      onePerUser: true,
      onePerEmail: true,
      ...(input.audienceRules || {}),
    },
    benefits: input.benefits,
    createdBy: input.createdBy,
    createdAt: now(),
    updatedAt: now(),
  });

  await campaignRef.set(doc);
  await adminDb.collection(PROMO_COLLECTIONS.auditLogs).add({
    action: 'promo_campaign_created',
    promoId: campaignRef.id,
    code: normalizedCode,
    actorId: input.createdBy,
    createdAt: now(),
    metadata: {
      status: doc.status,
      benefitTypes: input.benefits.map((benefit) => benefit.type),
      maxRedemptions: doc.maxRedemptions,
    },
  });
  return doc;
}

export async function listPromoCampaigns(options: { limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  const snap = await adminDb
    .collection(PROMO_COLLECTIONS.campaigns)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((doc) => doc.data());
}

export async function getPromoCampaign(promoId: string) {
  const snap = await adminDb.collection(PROMO_COLLECTIONS.campaigns).doc(normalizePromoCode(promoId)).get();
  if (!snap.exists) return null;
  return snap.data() as PromoCampaignDoc;
}

export async function listPromoRedemptions(options: { promoId?: string; userId?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(options.limit || 100, 1), 500);
  let query: FirebaseFirestore.Query = adminDb.collection(PROMO_COLLECTIONS.redemptions);
  if (options.promoId) query = query.where('promoId', '==', normalizePromoCode(options.promoId));
  if (options.userId) query = query.where('userId', '==', options.userId);
  const snap = await query.limit(limit).get();
  return snap.docs
    .map((doc) => doc.data())
    .sort((a, b) => (timestampMillis(b.redeemedAt) || 0) - (timestampMillis(a.redeemedAt) || 0));
}

export async function getPromoAnalytics(promoId?: string) {
  const [campaigns, redemptions] = await Promise.all([
    promoId ? Promise.all([getPromoCampaign(promoId)]).then((items) => items.filter(Boolean)) : listPromoCampaigns({ limit: 250 }),
    listPromoRedemptions({ promoId, limit: 500 }),
  ]);
  const redemptionsByBenefit: Record<string, number> = {};
  for (const redemption of redemptions) {
    const benefits = Array.isArray(redemption.benefitsGranted) ? redemption.benefitsGranted : [];
    for (const benefit of benefits) {
      redemptionsByBenefit[String(benefit).split(':')[0]] = (redemptionsByBenefit[String(benefit).split(':')[0]] || 0) + 1;
    }
  }
  const totalMax = campaigns.reduce((sum, campaign: any) => sum + (typeof campaign?.maxRedemptions === 'number' ? campaign.maxRedemptions : 0), 0);
  const totalCount = campaigns.reduce((sum, campaign: any) => sum + (typeof campaign?.redemptionCount === 'number' ? campaign.redemptionCount : 0), 0);
  return {
    totalRedemptions: redemptions.length,
    remainingSlots: totalMax > 0 ? Math.max(0, totalMax - totalCount) : null,
    redemptionsByBenefit,
    failedRedemptions: redemptions.filter((redemption) => redemption.status !== 'redeemed').length,
    campaigns,
    redemptions,
  };
}

function assertCampaignRedeemable(campaign: PromoCampaignDoc) {
  if (campaign.status !== 'active') {
    throw new PromoError('This promo code is not active.', 'PROMO_NOT_ACTIVE', 400);
  }

  const current = Date.now();
  const startsAt = timestampMillis(campaign.startsAt);
  const endsAt = timestampMillis(campaign.endsAt);
  if (startsAt && current < startsAt) {
    throw new PromoError('This promo code is not active yet.', 'PROMO_NOT_STARTED', 400);
  }
  if (endsAt && current > endsAt) {
    throw new PromoError('This promo code has expired.', 'PROMO_EXPIRED', 400);
  }
  if (campaign.maxRedemptions != null && campaign.redemptionCount >= campaign.maxRedemptions) {
    throw new PromoError('This promo code has reached its redemption limit.', 'PROMO_REDEMPTION_LIMIT_REACHED', 409);
  }
}

function assertAudienceEligible(input: {
  campaign: PromoCampaignDoc;
  userId: string;
  email: string;
  profile: Record<string, any>;
}) {
  const rules = input.campaign.audienceRules || {};
  const tier = getEffectiveUserTier(input.profile);
  if (rules.allowedPlans?.length && !rules.allowedPlans.includes(tier as any)) {
    throw new PromoError('Your current plan is not eligible for this promo.', 'PROMO_PLAN_NOT_ELIGIBLE', 403);
  }

  if (rules.newUsersOnly) {
    const createdAt = timestampMillis(input.profile.createdAt);
    const campaignStartsAt = timestampMillis(input.campaign.startsAt);
    if (createdAt && campaignStartsAt && createdAt < campaignStartsAt) {
      throw new PromoError('This promo is only available for new users.', 'PROMO_NEW_USERS_ONLY', 403);
    }
  }
}

function academyEntitlementId(userId: string, courseId: string) {
  return `${userId}_${courseId}`;
}

function marketplaceEntitlementId(userId: string, productId: string) {
  return `${userId}_${productId}`;
}

function mrrEligibilityId(userId: string, courseId: string) {
  return `${userId}_${courseId}`;
}

function subscriptionDiscountId(userId: string, promoId: string, index: number) {
  return `${userId}_${promoId}_${index}`;
}

function ledgerId(redemptionId: string, index: number) {
  return `${redemptionId}_${index}`;
}

function emailLockId(normalizedCode: string, email: string) {
  return `${normalizedCode}_${createHash('sha256').update(email).digest('hex')}`;
}

function grantBenefit(tx: FirebaseFirestore.Transaction, input: {
  userId: string;
  email: string;
  campaign: PromoCampaignDoc;
  redemptionId: string;
  benefit: PromoBenefit;
  index: number;
}) {
  const base = {
    userId: input.userId,
    email: input.email,
    promoId: input.campaign.promoId,
    code: input.campaign.code,
    normalizedCode: input.campaign.normalizedCode,
    source: 'promo',
    status: 'active',
    grantedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };

  switch (input.benefit.type) {
    case 'academy_course_free': {
      const ref = adminDb.collection(PROMO_COLLECTIONS.academyCourseEntitlements).doc(academyEntitlementId(input.userId, input.benefit.courseId));
      const enrollmentRef = adminDb.collection('academyEnrollments').doc(academyEntitlementId(input.userId, input.benefit.courseId));
      tx.set(ref, {
        ...base,
        courseId: input.benefit.courseId,
        entitlementType: 'free_course',
        pricePaidCents: 0,
      }, { merge: true });
      tx.set(enrollmentRef, {
        enrollmentId: academyEntitlementId(input.userId, input.benefit.courseId),
        userId: input.userId,
        courseId: input.benefit.courseId,
        cohortId: null,
        status: 'active',
        source: 'promo',
        promoId: input.campaign.promoId,
        enrolledAt: now(),
        completedAt: null,
        lastAccessedAt: now(),
        progressPercent: 0,
        createdAt: now(),
        updatedAt: now(),
      }, { merge: true });
      return `academy_course_free:${input.benefit.courseId}`;
    }
    case 'academy_course_discount': {
      const ref = adminDb.collection(PROMO_COLLECTIONS.academyCourseEntitlements).doc(`${academyEntitlementId(input.userId, input.benefit.courseId)}_discount_${input.campaign.promoId}`);
      tx.set(ref, {
        ...base,
        courseId: input.benefit.courseId,
        entitlementType: 'course_discount',
        discountKind: input.benefit.discountKind,
        amount: input.benefit.amount,
      }, { merge: true });
      return `academy_course_discount:${input.benefit.courseId}`;
    }
    case 'mrr_license_unlock': {
      const ref = adminDb.collection(PROMO_COLLECTIONS.academyMrrEligibility).doc(mrrEligibilityId(input.userId, input.benefit.courseId));
      tx.set(ref, {
        ...base,
        courseId: input.benefit.courseId,
        unlockAfterCertificate: input.benefit.unlockAfterCertificate !== false,
        priceCents: input.benefit.priceCents ?? null,
        currency: input.benefit.currency || 'USD',
        purchasedAt: null,
      }, { merge: true });
      return `mrr_license_unlock:${input.benefit.courseId}`;
    }
    case 'mrr_license_discount': {
      const ref = adminDb.collection(PROMO_COLLECTIONS.academyMrrEligibility).doc(mrrEligibilityId(input.userId, input.benefit.courseId));
      tx.set(ref, {
        ...base,
        courseId: input.benefit.courseId,
        unlockAfterCertificate: true,
        discountKind: input.benefit.discountKind,
        amount: input.benefit.amount,
        purchasedAt: null,
      }, { merge: true });
      return `mrr_license_discount:${input.benefit.courseId}`;
    }
    case 'marketplace_product_free': {
      const ref = adminDb.collection(PROMO_COLLECTIONS.marketplaceEntitlements).doc(marketplaceEntitlementId(input.userId, input.benefit.productId));
      tx.set(ref, {
        ...base,
        productId: input.benefit.productId,
        entitlementType: 'free_product',
        pricePaidCents: 0,
      }, { merge: true });
      return `marketplace_product_free:${input.benefit.productId}`;
    }
    case 'marketplace_product_discount': {
      const ref = adminDb.collection(PROMO_COLLECTIONS.marketplaceEntitlements).doc(`${marketplaceEntitlementId(input.userId, input.benefit.productId)}_discount_${input.campaign.promoId}`);
      tx.set(ref, {
        ...base,
        productId: input.benefit.productId,
        entitlementType: 'product_discount',
        discountKind: input.benefit.discountKind,
        amount: input.benefit.amount,
      }, { merge: true });
      return `marketplace_product_discount:${input.benefit.productId}`;
    }
    case 'subscription_discount': {
      const ref = adminDb.collection(PROMO_COLLECTIONS.subscriptionDiscountEntitlements).doc(subscriptionDiscountId(input.userId, input.campaign.promoId, input.index));
      tx.set(ref, {
        ...base,
        planIds: input.benefit.planIds || [],
        discountKind: input.benefit.discountKind,
        amount: input.benefit.amount,
        durationMonths: input.benefit.durationMonths ?? null,
        redeemed: false,
      }, { merge: true });
      return `subscription_discount:${input.index}`;
    }
    case 'creator_credit_bonus': {
      const ref = adminDb.collection('creatorCreditLedger').doc(ledgerId(input.redemptionId, input.index));
      tx.set(ref, {
        userId: input.userId,
        transactionType: 'promo_bonus',
        source: 'promo',
        promoId: input.campaign.promoId,
        code: input.campaign.code,
        credits: input.benefit.credits,
        creditsReserved: 0,
        creditsCharged: 0,
        creditsRefunded: 0,
        creditsGranted: input.benefit.credits,
        status: 'granted',
        billingSource: 'promo',
        createdAt: now(),
        metadata: {
          redemptionId: input.redemptionId,
          benefitType: input.benefit.type,
        },
      }, { merge: false });
      tx.set(adminDb.collection('creatorCreditAccounts').doc(input.userId), {
        userId: input.userId,
        purchasedCreditsRemaining: FieldValue.increment(input.benefit.credits),
        lifetimeCreditsGranted: FieldValue.increment(input.benefit.credits),
        updatedAt: now(),
      }, { merge: true });
      return `creator_credit_bonus:${input.benefit.credits}`;
    }
  }
}

export async function redeemPromoCode(input: {
  code: string;
  userId: string;
  email?: string;
  metadata?: Record<string, unknown>;
}): Promise<PromoRedeemResult> {
  const normalizedCode = normalizePromoCode(input.code || '');
  if (!normalizedCode) {
    throw new PromoError('Promo code is required.', 'PROMO_CODE_REQUIRED', 400);
  }

  const campaignRef = adminDb.collection(PROMO_COLLECTIONS.campaigns).doc(normalizedCode);
  const userRef = adminDb.collection('users').doc(input.userId);
  const redemptionId = `${input.userId}_${normalizedCode}`;
  const redemptionRef = adminDb.collection(PROMO_COLLECTIONS.redemptions).doc(redemptionId);

  return adminDb.runTransaction(async (tx) => {
    const [campaignSnap, userSnap, existingRedemption] = await Promise.all([
      tx.get(campaignRef),
      tx.get(userRef),
      tx.get(redemptionRef),
    ]);

    if (!campaignSnap.exists) {
      throw new PromoError('Promo code was not found.', 'PROMO_NOT_FOUND', 404);
    }
    if (!userSnap.exists) {
      throw new PromoError('User profile is required before redeeming promos.', 'PROMO_PROFILE_REQUIRED', 400);
    }
    if (existingRedemption.exists && existingRedemption.data()?.status === 'redeemed') {
      throw new PromoError('You have already redeemed this promo code.', 'PROMO_ALREADY_REDEEMED', 409);
    }

    const campaign = campaignSnap.data() as PromoCampaignDoc;
    assertCampaignRedeemable(campaign);

    const profile = userSnap.data() || {};
    const email = (input.email || profile.email || '').toString().trim().toLowerCase();
    assertAudienceEligible({ campaign, userId: input.userId, email, profile });

    const emailLockRef = campaign.audienceRules?.onePerEmail && email
      ? adminDb.collection(PROMO_COLLECTIONS.emailLocks).doc(emailLockId(normalizedCode, email))
      : null;
    const emailLockSnap = emailLockRef ? await tx.get(emailLockRef) : null;
    if (emailLockSnap?.exists) {
      throw new PromoError('This email has already redeemed this promo code.', 'PROMO_EMAIL_ALREADY_REDEEMED', 409);
    }

    const benefitsGranted = campaign.benefits.map((benefit, index) => grantBenefit(tx, {
      userId: input.userId,
      email,
      campaign,
      redemptionId,
      benefit,
      index,
    }));

    tx.set(redemptionRef, {
      redemptionId,
      promoId: campaign.promoId,
      code: campaign.code,
      normalizedCode,
      userId: input.userId,
      email,
      status: 'redeemed',
      benefitsGranted,
      failureReason: null,
      metadata: input.metadata || {},
      redeemedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    });
    tx.update(campaignRef, {
      redemptionCount: FieldValue.increment(1),
      updatedAt: now(),
    });
    tx.set(adminDb.collection(PROMO_COLLECTIONS.auditLogs).doc(`${redemptionId}_redeemed`), {
      action: 'promo_redeemed',
      promoId: campaign.promoId,
      code: campaign.code,
      normalizedCode,
      actorId: input.userId,
      userId: input.userId,
      redemptionId,
      benefitsGranted,
      createdAt: now(),
      metadata: input.metadata || {},
    });
    if (emailLockRef) {
      tx.set(emailLockRef, {
        promoId: campaign.promoId,
        normalizedCode,
        emailHash: emailLockRef.id.split('_').pop(),
        userId: input.userId,
        redemptionId,
        createdAt: now(),
      });
    }

    return {
      promoId: campaign.promoId,
      code: campaign.code,
      redemptionId,
      benefitsGranted,
    };
  });
}
