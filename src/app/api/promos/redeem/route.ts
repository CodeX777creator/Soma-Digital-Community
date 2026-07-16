import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireUserEntitlements } from '@/lib/serverAuth';
import { redeemPromoCode } from '@/promos';

export const POST = createAPIHandler(async (req) => {
  const entitlements = await requireUserEntitlements(req as any);
  const body = await req.json();
  const result = await redeemPromoCode({
    code: String(body.code || ''),
    userId: entitlements.uid,
    email: entitlements.profile?.email,
    metadata: {
      source: typeof body.source === 'string' ? body.source : 'manual',
      path: typeof body.path === 'string' ? body.path : undefined,
    },
  });
  return apiResponse({ redemption: result }, { status: 201 });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 8 },
});
