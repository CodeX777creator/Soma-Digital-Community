import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { cancelScheduledPost, retryScheduledPost } from '@/social';

const handler = createAPIHandler(
  async (req, context) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
    const { postId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';

    if (!postId) {
      return apiError('postId is required', { status: 400, code: 'INVALID_INPUT' });
    }

    if (action === 'retry') {
      const post = await retryScheduledPost(entitlements.uid, postId);
      return apiResponse({ post });
    }

    if (action === 'cancel') {
      const post = await cancelScheduledPost(entitlements.uid, postId);
      return apiResponse({ post });
    }

    return apiError('Unsupported publish control action', { status: 400, code: 'INVALID_ACTION' });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 30000,
  }
);

export const POST = handler;
