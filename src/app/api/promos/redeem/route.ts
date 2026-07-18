import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireUserEntitlements } from '@/lib/serverAuth';
import { PROMO_SURFACES, PromoError, recordFailedPromoRedemption, redeemPromoCode, type PromoSurface } from '@/promos';

export const POST = createAPIHandler(async (req) => {
  const entitlements = await requireUserEntitlements(req as any);
  const body = await req.json();
  const surface = PROMO_SURFACES.includes(body.surface) ? body.surface as PromoSurface : 'dashboard';
  const context = typeof body.context === 'object' && body.context
    ? {
        courseId: typeof body.context.courseId === 'string' ? body.context.courseId : undefined,
        productId: typeof body.context.productId === 'string' ? body.context.productId : undefined,
        planId: typeof body.context.planId === 'string' ? body.context.planId : undefined,
        creditBundleId: typeof body.context.creditBundleId === 'string' ? body.context.creditBundleId : undefined,
        checkoutType: typeof body.context.checkoutType === 'string' ? body.context.checkoutType : undefined,
      }
    : {};
  const metadata = {
    source: typeof body.source === 'string' ? body.source : 'manual',
    path: typeof body.path === 'string' ? body.path : undefined,
  };
  let result;
  try {
    result = await redeemPromoCode({
      code: String(body.code || ''),
      userId: entitlements.uid,
      email: entitlements.profile?.email,
      surface,
      context,
      metadata,
    });
  } catch (error) {
    if (error instanceof PromoError) {
      await recordFailedPromoRedemption({
        code: String(body.code || ''),
        userId: entitlements.uid,
        email: entitlements.profile?.email,
        surface,
        context,
        failureReason: error.code,
        metadata,
      }).catch(() => null);
      return apiError(error.message, { status: error.status, code: error.code });
    }
    throw error;
  }
  return apiResponse({ redemption: result }, { status: 201 });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 8 },
});
