import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createPromoCampaign, getPromoAnalytics, listPromoCampaigns, listPromoRedemptions, updatePromoCampaign } from '@/promos';

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
    applicableSurfaces: Array.isArray(body.applicableSurfaces) ? body.applicableSurfaces : [],
    targetCourseIds: Array.isArray(body.targetCourseIds) ? body.targetCourseIds : [],
    targetProductIds: Array.isArray(body.targetProductIds) ? body.targetProductIds : [],
    targetPlanIds: Array.isArray(body.targetPlanIds) ? body.targetPlanIds : [],
    targetCreditBundleIds: Array.isArray(body.targetCreditBundleIds) ? body.targetCreditBundleIds : [],
    audienceRules: body.audienceRules || {},
    benefits: Array.isArray(body.benefits) ? body.benefits : [],
    createdBy: entitlements.uid,
  });
  return apiResponse({ campaign }, { status: 201 });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
});

export const PATCH = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');
  const body = await req.json();
  const campaign = await updatePromoCampaign({
    promoId: String(body.promoId || ''),
    updatedBy: entitlements.uid,
    code: typeof body.code === 'string' ? body.code : undefined,
    name: typeof body.name === 'string' ? body.name : undefined,
    description: typeof body.description === 'string' ? body.description : undefined,
    status: body.status === 'draft' || body.status === 'active' || body.status === 'paused' || body.status === 'expired' || body.status === 'archived'
      ? body.status
      : undefined,
    maxRedemptions: body.maxRedemptions == null || body.maxRedemptions === '' ? undefined : Number(body.maxRedemptions),
    applicableSurfaces: Array.isArray(body.applicableSurfaces) ? body.applicableSurfaces : undefined,
    targetCourseIds: Array.isArray(body.targetCourseIds) ? body.targetCourseIds : undefined,
    targetProductIds: Array.isArray(body.targetProductIds) ? body.targetProductIds : undefined,
    targetPlanIds: Array.isArray(body.targetPlanIds) ? body.targetPlanIds : undefined,
    targetCreditBundleIds: Array.isArray(body.targetCreditBundleIds) ? body.targetCreditBundleIds : undefined,
    audienceRules: body.audienceRules && typeof body.audienceRules === 'object' ? body.audienceRules : undefined,
    benefits: Array.isArray(body.benefits) ? body.benefits : undefined,
  });
  return apiResponse({ campaign });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
});
