import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { listSocialPostAnalytics } from '@/social';
import { sanitizeString } from '@/lib/security';

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '100');
  if (!Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.floor(value), 1), 200);
}

const handler = createAPIHandler(
  async (req) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
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
