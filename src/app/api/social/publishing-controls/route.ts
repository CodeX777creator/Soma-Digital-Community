import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { getSocialPublishingPause, setSocialPublishingPaused } from '@/social';
import { sanitizeString } from '@/lib/security';

export const GET = createAPIHandler(
  async (req) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
    const controls = await getSocialPublishingPause(entitlements.uid);
    return apiResponse({ controls });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 15000,
  }
);

export const POST = createAPIHandler(
  async (req) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
    const body = await req.json().catch(() => ({}));

    if (typeof body.paused !== 'boolean') {
      return apiError('paused must be a boolean', { status: 400, code: 'INVALID_INPUT' });
    }

    const controls = await setSocialPublishingPaused(
      entitlements.uid,
      body.paused,
      typeof body.reason === 'string' ? sanitizeString(body.reason, 300) : undefined
    );

    return apiResponse({ controls });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 12 },
    timeout: 30000,
  }
);
