import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { buildNormalizedPublishPayload } from '@/social';

const handler = createAPIHandler(
  async (req, context) => {
    if (req.method !== 'GET') {
      return apiError('Method not allowed', { status: 405, code: 'METHOD_NOT_ALLOWED' });
    }

    const entitlements = await requireSubscription(req as any, 'explorer');
    const { postId } = await context.params;
    if (!postId) {
      return apiError('postId is required', { status: 400, code: 'INVALID_INPUT' });
    }

    const payload = await buildNormalizedPublishPayload(entitlements.uid, postId);
    return apiResponse({ payload });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 30000,
  }
);

export const GET = handler;
