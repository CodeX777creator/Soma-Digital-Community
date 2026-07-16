import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createPromoCampaign, getPromoAnalytics, listPromoCampaigns, listPromoRedemptions } from '@/promos';

export const GET = createAPIHandler(async (req) => {
  await requireRole(req as any, 'admin');
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') || 100);
  const [campaigns, redemptions, analytics] = await Promise.all([
    listPromoCampaigns({ limit }),
    listPromoRedemptions({ limit: 200 }),
    getPromoAnalytics(),
  ]);
  return apiResponse({ campaigns, redemptions, analytics });
});

export const POST = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');
  const body = await req.json();
  const campaign = await createPromoCampaign({
    code: String(body.code || ''),
    name: String(body.name || ''),
    description: typeof body.description === 'string' ? body.description : '',
    status: body.status,
    startsAt: body.startsAt ?? null,
    endsAt: body.endsAt ?? null,
    maxRedemptions: body.maxRedemptions ?? null,
    audienceRules: body.audienceRules || {},
    benefits: Array.isArray(body.benefits) ? body.benefits : [],
    createdBy: entitlements.uid,
  });
  return apiResponse({ campaign }, { status: 201 });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
});
