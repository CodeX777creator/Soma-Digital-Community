export const PROMO_COLLECTIONS = {
  campaigns: 'promoCampaigns',
  redemptions: 'promoRedemptions',
  academyCourseEntitlements: 'academyCourseEntitlements',
  academyMrrEligibility: 'academyMrrEligibility',
  marketplaceEntitlements: 'marketplaceEntitlements',
  subscriptionDiscountEntitlements: 'subscriptionDiscountEntitlements',
  emailLocks: 'promoRedemptionEmailLocks',
  auditLogs: 'promoAuditLogs',
} as const;

export const PROMO_CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'expired', 'archived'] as const;
export type PromoCampaignStatus = (typeof PROMO_CAMPAIGN_STATUSES)[number];

export const PROMO_BENEFIT_TYPES = [
  'academy_course_free',
  'academy_course_discount',
  'subscription_discount',
  'creator_credit_bonus',
  'marketplace_product_free',
  'marketplace_product_discount',
  'mrr_license_unlock',
  'mrr_license_discount',
] as const;
export type PromoBenefitType = (typeof PROMO_BENEFIT_TYPES)[number];

export type PromoDiscountKind = 'percent' | 'fixed';

export const PROMO_SURFACES = [
  'onboarding',
  'dashboard',
  'academy_course',
  'academy_checkout',
  'mrr_checkout',
  'creator_credits',
  'subscription_checkout',
  'marketplace_product',
  'marketplace_checkout',
] as const;
export type PromoSurface = (typeof PROMO_SURFACES)[number];

export interface PromoAudienceRules {
  newUsersOnly?: boolean;
  onePerUser?: boolean;
  onePerEmail?: boolean;
  allowedPlans?: Array<'explorer' | 'pro' | 'elite' | 'enterprise'>;
}

export interface PromoBenefitBase {
  type: PromoBenefitType;
  label?: string;
}

export interface AcademyCourseFreeBenefit extends PromoBenefitBase {
  type: 'academy_course_free';
  courseId: string;
}

export interface AcademyCourseDiscountBenefit extends PromoBenefitBase {
  type: 'academy_course_discount';
  courseId: string;
  discountKind: PromoDiscountKind;
  amount: number;
}

export interface SubscriptionDiscountBenefit extends PromoBenefitBase {
  type: 'subscription_discount';
  planIds?: string[];
  discountKind: PromoDiscountKind;
  amount: number;
  durationMonths?: number | null;
}

export interface CreatorCreditBonusBenefit extends PromoBenefitBase {
  type: 'creator_credit_bonus';
  credits: number;
}

export interface MarketplaceProductFreeBenefit extends PromoBenefitBase {
  type: 'marketplace_product_free';
  productId: string;
}

export interface MarketplaceProductDiscountBenefit extends PromoBenefitBase {
  type: 'marketplace_product_discount';
  productId: string;
  discountKind: PromoDiscountKind;
  amount: number;
}

export interface MrrLicenseUnlockBenefit extends PromoBenefitBase {
  type: 'mrr_license_unlock';
  courseId: string;
  unlockAfterCertificate: boolean;
  priceCents?: number | null;
  currency?: string;
}

export interface MrrLicenseDiscountBenefit extends PromoBenefitBase {
  type: 'mrr_license_discount';
  courseId: string;
  discountKind: PromoDiscountKind;
  amount: number;
}

export type PromoBenefit =
  | AcademyCourseFreeBenefit
  | AcademyCourseDiscountBenefit
  | SubscriptionDiscountBenefit
  | CreatorCreditBonusBenefit
  | MarketplaceProductFreeBenefit
  | MarketplaceProductDiscountBenefit
  | MrrLicenseUnlockBenefit
  | MrrLicenseDiscountBenefit;

export interface PromoCampaignDoc {
  promoId: string;
  code: string;
  normalizedCode: string;
  name: string;
  description?: string;
  status: PromoCampaignStatus;
  startsAt?: FirebaseFirestore.Timestamp | Date | string | null;
  endsAt?: FirebaseFirestore.Timestamp | Date | string | null;
  maxRedemptions?: number | null;
  redemptionCount: number;
  applicableSurfaces: PromoSurface[];
  targetCourseIds?: string[];
  targetProductIds?: string[];
  targetPlanIds?: string[];
  targetCreditBundleIds?: string[];
  audienceRules: PromoAudienceRules;
  benefits: PromoBenefit[];
  createdBy: string;
  createdAt?: FirebaseFirestore.Timestamp | Date | string | null;
  updatedAt?: FirebaseFirestore.Timestamp | Date | string | null;
}

export interface PromoRedemptionDoc {
  redemptionId: string;
  promoId: string;
  code: string;
  normalizedCode: string;
  userId: string;
  email: string;
  status: 'redeemed' | 'void' | 'revoked';
  benefitsGranted: string[];
  benefitsSkipped?: string[];
  surface?: PromoSurface;
  context?: Record<string, unknown>;
  surfaceAllowed?: boolean;
  targetMatched?: boolean;
  failureReason?: string | null;
  redeemedAt?: FirebaseFirestore.Timestamp | Date | string | null;
  metadata?: Record<string, unknown>;
}

export interface PromoRedeemResult {
  promoId: string;
  code: string;
  redemptionId: string;
  benefitsGranted: string[];
  surface: PromoSurface;
}

export interface PromoAnalyticsSummary {
  totalRedemptions: number;
  remainingSlots: number | null;
  redemptionsByBenefit: Record<string, number>;
  redemptionsBySurface?: Record<string, number>;
  failedRedemptionsByReason?: Record<string, number>;
  coursesUnlocked?: number;
  creditsGranted?: number;
  marketplaceProductsClaimed?: number;
  mrrEligibilityReserved?: number;
  subscriptionDiscountsReserved?: number;
  revenueInfluencedCents?: number;
  failedRedemptions: number;
}
