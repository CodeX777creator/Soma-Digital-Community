import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createPromoCampaign, FOUNDER_CAMPAIGN_TEMPLATE, PromoError } from '@/promos';

export const POST = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');
  const body = await req.json().catch(() => ({}));
  try {
    const campaign = await createPromoCampaign({
      ...FOUNDER_CAMPAIGN_TEMPLATE,
      status: body.status === 'active' ? 'active' : 'draft',
      startsAt: body.startsAt ?? null,
      endsAt: body.endsAt ?? null,
      benefits: Array.isArray(body.benefits) && body.benefits.length ? body.benefits : FOUNDER_CAMPAIGN_TEMPLATE.benefits,
      createdBy: entitlements.uid,
    });
    return apiResponse({ campaign }, { status: 201 });
  } catch (error) {
    if (error instanceof PromoError && error.code === 'PROMO_CODE_EXISTS') {
      return apiResponse({ status: 'already_exists', code: FOUNDER_CAMPAIGN_TEMPLATE.code }, { status: 200 });
    }
    throw error;
  }
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
});
