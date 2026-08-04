import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { listSocialPostAnalytics } from '@/social';
import { sanitizeString } from '@/lib/security';
import { getTierPrivileges } from '@/lib/tier-privileges';

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '100');
  if (!Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.floor(value), 1), 200);
}

const handler = createAPIHandler(
  async (req) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
    if (!getTierPrivileges(entitlements.subscription.plan).scheduler.advancedAnalytics && entitlements.subscription.plan === 'explorer') {
      return apiResponse({ analytics: [], restricted: true, message: 'Analytics are available on Pro and Elite plans.' });
    }
    const scheduledPostId = req.nextUrl.searchParams.get('scheduledPostId');
    const analytics = await listSocialPostAnalytics(entitlements.uid, {
      scheduledPostId: scheduledPostId ? sanitizeString(scheduledPostId, 160) : undefined,
      limit: parseLimit(req),
    });

    return apiResponse({ analytics });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 30000,
  }
);

export const GET = handler;
