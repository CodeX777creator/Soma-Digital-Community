import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { getEffectiveUserTier } from '@/lib/tier';
import {
  PROMO_BENEFIT_TYPES,
  PROMO_CAMPAIGN_STATUSES,
  PROMO_COLLECTIONS,
  PROMO_SURFACES,
  type PromoAudienceRules,
  type PromoBenefit,
  type PromoCampaignDoc,
  type PromoCampaignStatus,
  type PromoRedeemResult,
  type PromoSurface,
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
  applicableSurfaces?: PromoSurface[];
  targetCourseIds?: string[];
  targetProductIds?: string[];
  targetPlanIds?: string[];
  targetCreditBundleIds?: string[];
  audienceRules?: PromoAudienceRules;
  benefits: PromoBenefit[];
  createdBy: string;
};

type UpdatePromoInput = Partial<Omit<CreatePromoInput, 'createdBy'>> & {
  promoId: string;
  updatedBy: string;
};

export type PromoRedeemContext = {
  courseId?: string;
  productId?: string;
  planId?: string;
  creditBundleId?: string;
  checkoutType?: string;
};

const BENEFIT_SURFACES: Record<PromoBenefit['type'], PromoSurface[]> = {
  academy_course_free: ['onboarding', 'dashboard', 'academy_course', 'academy_checkout'],
  academy_course_discount: ['academy_course', 'academy_checkout'],
  subscription_discount: ['dashboard', 'subscription_checkout'],
  creator_credit_bonus: ['onboarding', 'dashboard', 'creator_credits'],
  marketplace_product_free: ['marketplace_product', 'marketplace_checkout'],
  marketplace_product_discount: ['marketplace_product', 'marketplace_checkout'],
  mrr_license_unlock: ['onboarding', 'dashboard', 'academy_course', 'academy_checkout', 'mrr_checkout'],
  mrr_license_discount: ['mrr_checkout'],
};

export const FOUNDER_CAMPAIGN_TEMPLATE = {
  code: 'FOUNDER100',
  name: 'Founder Member Bonus',
  description: 'First 100 founder members receive the Digital Marketing Certification course and MRR eligibility after certification.',
  maxRedemptions: 100,
  applicableSurfaces: ['onboarding', 'dashboard', 'academy_course'] as PromoSurface[],
  targetCourseIds: ['digital-marketing-certification'],
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

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

function normalizeSurfaces(value: unknown): PromoSurface[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((surface): surface is PromoSurface => PROMO_SURFACES.includes(surface))));
}

function inferSurfacesFromBenefits(benefits: PromoBenefit[]) {
  return Array.from(new Set(benefits.flatMap((benefit) => BENEFIT_SURFACES[benefit.type] || [])));
}

function deriveTargetsFromBenefits(benefits: PromoBenefit[]) {
  const courseIds = new Set<string>();
  const productIds = new Set<string>();
  const planIds = new Set<string>();
  for (const benefit of benefits) {
    if ('courseId' in benefit && benefit.courseId) courseIds.add(benefit.courseId);
    if ('productId' in benefit && benefit.productId) productIds.add(benefit.productId);
    if (benefit.type === 'subscription_discount') {
      for (const planId of benefit.planIds || []) planIds.add(planId);
    }
  }
  return {
    targetCourseIds: Array.from(courseIds),
    targetProductIds: Array.from(productIds),
    targetPlanIds: Array.from(planIds),
  };
}

function benefitTargetsMatch(benefit: PromoBenefit, context: PromoRedeemContext) {
  if ('courseId' in benefit && benefit.courseId && context.courseId && benefit.courseId !== context.courseId) return false;
  if ('productId' in benefit && benefit.productId && context.productId && benefit.productId !== context.productId) return false;
  if (benefit.type === 'subscription_discount' && context.planId && benefit.planIds?.length && !benefit.planIds.includes(context.planId)) return false;
  return true;
}

function benefitSupportsSurface(benefit: PromoBenefit, surface: PromoSurface) {
  return (BENEFIT_SURFACES[benefit.type] || []).includes(surface);
}

function benefitGrantKey(benefit: PromoBenefit, index: number) {
  if ('courseId' in benefit && benefit.courseId) return `${benefit.type}:${benefit.courseId}`;
  if ('productId' in benefit && benefit.productId) return `${benefit.type}:${benefit.productId}`;
  if (benefit.type === 'creator_credit_bonus') return `${benefit.type}:${benefit.credits}`;
  return `${benefit.type}:${index}`;
}

function validateBenefitSurfaceCompatibility(benefits: PromoBenefit[], surfaces: PromoSurface[]) {
  for (const benefit of benefits) {
    if (!surfaces.some((surface) => benefitSupportsSurface(benefit, surface))) {
      const allowed = BENEFIT_SURFACES[benefit.type]?.join(', ') || 'a supported surface';
      throw new PromoError(`${benefit.type} can only be used on: ${allowed}.`, 'PROMO_INVALID_SURFACE', 400);
    }
  }
}

function assertContextTargets(input: {
  campaign: PromoCampaignDoc;
  surface: PromoSurface;
  context: PromoRedeemContext;
}) {
  const { campaign, surface, context } = input;
  if (!campaign.applicableSurfaces?.includes(surface)) {
    throw new PromoError('This bonus is valid, but it cannot be used here.', 'PROMO_WRONG_SURFACE', 403);
  }
  if (campaign.targetCourseIds?.length && context.courseId && !campaign.targetCourseIds.includes(context.courseId)) {
    throw new PromoError('This Academy bonus is for a different course.', 'PROMO_TARGET_MISMATCH', 403);
  }
  if (campaign.targetProductIds?.length && context.productId && !campaign.targetProductIds.includes(context.productId)) {
    throw new PromoError('This product bonus is for a different Marketplace item.', 'PROMO_TARGET_MISMATCH', 403);
  }
  if (campaign.targetPlanIds?.length && context.planId && !campaign.targetPlanIds.includes(context.planId)) {
    throw new PromoError('This subscription offer is for a different plan.', 'PROMO_TARGET_MISMATCH', 403);
  }
  if (campaign.targetCreditBundleIds?.length && context.creditBundleId && !campaign.targetCreditBundleIds.includes(context.creditBundleId)) {
    throw new PromoError('This Creator Credits offer is for a different bundle.', 'PROMO_TARGET_MISMATCH', 403);
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
  const surfaces = normalizeSurfaces(input.applicableSurfaces);
  validateBenefitSurfaceCompatibility(input.benefits, surfaces.length ? surfaces : inferSurfacesFromBenefits(input.benefits));
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
  const applicableSurfaces = normalizeSurfaces(input.applicableSurfaces);
  const inferredTargets = deriveTargetsFromBenefits(input.benefits);
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
    applicableSurfaces: applicableSurfaces.length ? applicableSurfaces : inferSurfacesFromBenefits(input.benefits),
    targetCourseIds: uniqueStrings(input.targetCourseIds).length ? uniqueStrings(input.targetCourseIds) : inferredTargets.targetCourseIds,
    targetProductIds: uniqueStrings(input.targetProductIds).length ? uniqueStrings(input.targetProductIds) : inferredTargets.targetProductIds,
    targetPlanIds: uniqueStrings(input.targetPlanIds).length ? uniqueStrings(input.targetPlanIds) : inferredTargets.targetPlanIds,
    targetCreditBundleIds: uniqueStrings(input.targetCreditBundleIds),
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
      applicableSurfaces: doc.applicableSurfaces,
      maxRedemptions: doc.maxRedemptions,
    },
  });
  return doc;
}

export async function updatePromoCampaign(input: UpdatePromoInput) {
  const promoId = normalizePromoCode(input.promoId);
  const snapshot = await adminDb.collection(PROMO_COLLECTIONS.campaigns).doc(promoId).get();
  if (!snapshot.exists) {
    throw new PromoError('Promo campaign not found.', 'PROMO_NOT_FOUND', 404);
  }

  const existing = snapshot.data() as PromoCampaignDoc;
  const normalizeIdList = (value: unknown) => Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const merged: CreatePromoInput = {
    code: input.code ?? existing.code,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description ?? '',
    status: input.status ?? existing.status,
    maxRedemptions: input.maxRedemptions ?? existing.maxRedemptions ?? null,
    applicableSurfaces: input.applicableSurfaces ?? existing.applicableSurfaces ?? [],
    targetCourseIds: input.targetCourseIds ?? existing.targetCourseIds ?? [],
    targetProductIds: input.targetProductIds ?? existing.targetProductIds ?? [],
    targetPlanIds: input.targetPlanIds ?? existing.targetPlanIds ?? [],
    targetCreditBundleIds: input.targetCreditBundleIds ?? existing.targetCreditBundleIds ?? [],
    audienceRules: input.audienceRules ?? existing.audienceRules ?? {},
    benefits: input.benefits ?? existing.benefits ?? [],
    createdBy: existing.createdBy,
  };

  const normalizedCode = validateCampaignInput(merged);
  const applicableSurfaces = normalizeSurfaces(merged.applicableSurfaces);
  const inferredTargets = deriveTargetsFromBenefits(merged.benefits);
  const targetCourseIds = normalizeIdList(merged.targetCourseIds).length ? normalizeIdList(merged.targetCourseIds) : inferredTargets.targetCourseIds;
  const targetProductIds = normalizeIdList(merged.targetProductIds).length ? normalizeIdList(merged.targetProductIds) : inferredTargets.targetProductIds;
  const targetPlanIds = normalizeIdList(merged.targetPlanIds).length ? normalizeIdList(merged.targetPlanIds) : inferredTargets.targetPlanIds;
  const targetCreditBundleIds = normalizeIdList(merged.targetCreditBundleIds).length ? normalizeIdList(merged.targetCreditBundleIds) : [];
  validateBenefitSurfaceCompatibility(merged.benefits, applicableSurfaces);
  merged.benefits.forEach(validateBenefit);

  const next = cleanUndefined({
    ...existing,
    promoId: existing.promoId,
    code: merged.code.trim(),
    normalizedCode,
    name: merged.name.trim(),
    description: merged.description?.trim() || undefined,
    status: (merged.status ?? existing.status),
    maxRedemptions: merged.maxRedemptions ?? null,
    applicableSurfaces,
    targetCourseIds,
    targetProductIds,
    targetPlanIds,
    targetCreditBundleIds,
    audienceRules: merged.audienceRules || {},
    benefits: merged.benefits,
    updatedAt: now(),
  }) as PromoCampaignDoc;

  const writeRef = normalizedCode === promoId
    ? adminDb.collection(PROMO_COLLECTIONS.campaigns).doc(promoId)
    : adminDb.collection(PROMO_COLLECTIONS.campaigns).doc(normalizedCode);

  await adminDb.runTransaction(async (tx) => {
    if (normalizedCode !== promoId) {
      const duplicate = await tx.get(writeRef);
      if (duplicate.exists) {
        throw new PromoError('Promo code already exists.', 'PROMO_DUPLICATE_CODE', 409);
      }
      tx.delete(adminDb.collection(PROMO_COLLECTIONS.campaigns).doc(promoId));
    }
    tx.set(writeRef, next);
    tx.set(adminDb.collection(PROMO_COLLECTIONS.auditLogs).doc(`${writeRef.id}_updated_${Date.now()}`), {
      action: 'promo_campaign_updated',
      promoId: writeRef.id,
      code: next.code,
      normalizedCode,
      actorId: input.updatedBy,
      before: existing,
      after: next,
      createdAt: now(),
    });
  });

  return next;
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
  const redemptionsBySurface: Record<string, number> = {};
  const failedRedemptionsByReason: Record<string, number> = {};
  let coursesUnlocked = 0;
  let creditsGranted = 0;
  let marketplaceProductsClaimed = 0;
  let mrrEligibilityReserved = 0;
  let subscriptionDiscountsReserved = 0;
  for (const redemption of redemptions) {
    const benefits = Array.isArray(redemption.benefitsGranted) ? redemption.benefitsGranted : [];
    const surface = String(redemption.surface || redemption.metadata?.surface || 'unknown');
    redemptionsBySurface[surface] = (redemptionsBySurface[surface] || 0) + 1;
    if (redemption.failureReason) {
      const reason = String(redemption.failureReason);
      failedRedemptionsByReason[reason] = (failedRedemptionsByReason[reason] || 0) + 1;
    }
    for (const benefit of benefits) {
      const benefitType = String(benefit).split(':')[0];
      redemptionsByBenefit[benefitType] = (redemptionsByBenefit[benefitType] || 0) + 1;
      if (benefitType === 'academy_course_free') coursesUnlocked += 1;
      if (benefitType === 'marketplace_product_free') marketplaceProductsClaimed += 1;
      if (benefitType === 'mrr_license_unlock') mrrEligibilityReserved += 1;
      if (benefitType === 'subscription_discount') subscriptionDiscountsReserved += 1;
      if (benefitType === 'creator_credit_bonus') creditsGranted += Number(String(benefit).split(':')[1]) || 0;
    }
  }
  const totalMax = campaigns.reduce((sum, campaign: any) => sum + (typeof campaign?.maxRedemptions === 'number' ? campaign.maxRedemptions : 0), 0);
  const totalCount = campaigns.reduce((sum, campaign: any) => sum + (typeof campaign?.redemptionCount === 'number' ? campaign.redemptionCount : 0), 0);
  return {
    totalRedemptions: redemptions.length,
    remainingSlots: totalMax > 0 ? Math.max(0, totalMax - totalCount) : null,
    redemptionsByBenefit,
    redemptionsBySurface,
    failedRedemptionsByReason,
    coursesUnlocked,
    creditsGranted,
    marketplaceProductsClaimed,
    mrrEligibilityReserved,
    subscriptionDiscountsReserved,
    revenueInfluencedCents: 0,
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
  surface?: PromoSurface;
  context?: PromoRedeemContext;
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
    const surface = PROMO_SURFACES.includes(input.surface as PromoSurface) ? input.surface as PromoSurface : 'dashboard';
    const context = input.context || {};
    if (!Array.isArray(campaign.applicableSurfaces) || campaign.applicableSurfaces.length === 0) {
      campaign.applicableSurfaces = inferSurfacesFromBenefits(campaign.benefits || []);
    }
    assertCampaignRedeemable(campaign);
    assertContextTargets({ campaign, surface, context });

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

    const applicableBenefits = campaign.benefits.filter((benefit) => benefitSupportsSurface(benefit, surface) && benefitTargetsMatch(benefit, context));
    if (!applicableBenefits.length) {
      throw new PromoError('This bonus is valid, but it cannot be used here.', 'PROMO_WRONG_SURFACE', 403);
    }
    const benefitsSkipped = campaign.benefits
      .filter((benefit) => !applicableBenefits.includes(benefit))
      .map((benefit, index) => benefitGrantKey(benefit, index));

    const benefitsGranted = applicableBenefits.map((benefit, index) => grantBenefit(tx, {
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
      surface,
      context,
      surfaceAllowed: true,
      targetMatched: true,
      benefitsSkipped,
      metadata: {
        ...(input.metadata || {}),
        source: input.metadata?.source || 'manual',
        path: input.metadata?.path || null,
        context,
        surfaceAllowed: true,
        targetMatched: true,
        benefitsSkipped,
      },
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
      benefitsSkipped,
      createdAt: now(),
      metadata: {
        ...(input.metadata || {}),
        surface,
        context,
      },
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
      surface,
    };
  });
}

export async function recordFailedPromoRedemption(input: {
  code: string;
  userId: string;
  email?: string;
  surface?: PromoSurface;
  context?: PromoRedeemContext;
  failureReason: string;
  metadata?: Record<string, unknown>;
}) {
  const normalizedCode = normalizePromoCode(input.code || '');
  if (!normalizedCode || !input.userId) return null;
  const failureId = `${input.userId}_${normalizedCode}_failed_${Date.now()}`;
  const campaign = await getPromoCampaign(normalizedCode).catch(() => null);
  const doc = {
    redemptionId: failureId,
    promoId: campaign?.promoId || normalizedCode,
    code: campaign?.code || input.code,
    normalizedCode,
    userId: input.userId,
    email: (input.email || '').toString().trim().toLowerCase(),
    status: 'void',
    benefitsGranted: [],
    benefitsSkipped: [],
    failureReason: input.failureReason,
    surface: input.surface || 'dashboard',
    context: input.context || {},
    surfaceAllowed: false,
    targetMatched: false,
    metadata: {
      ...(input.metadata || {}),
      source: input.metadata?.source || 'manual',
      path: input.metadata?.path || null,
      context: input.context || {},
    },
    redeemedAt: now(),
    createdAt: now(),
    updatedAt: now(),
  };
  await adminDb.collection(PROMO_COLLECTIONS.redemptions).doc(failureId).set(doc);
  await adminDb.collection(PROMO_COLLECTIONS.auditLogs).doc(`${failureId}_failed`).set({
    action: 'promo_redemption_failed',
    promoId: doc.promoId,
    code: doc.code,
    normalizedCode,
    actorId: input.userId,
    userId: input.userId,
    redemptionId: failureId,
    failureReason: input.failureReason,
    createdAt: now(),
    metadata: doc.metadata,
  });
  return doc;
}
