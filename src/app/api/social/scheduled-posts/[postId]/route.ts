import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { deleteScheduledPost, moveScheduledPost, updateScheduledPost } from '@/social';
import { sanitizeString } from '@/lib/security';
import { SOCIAL_PLATFORMS, type SocialPlatform, SCHEDULED_POST_STATUSES, type ScheduledPostStatus } from '@/social/types';

function isAllowedPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function isAllowedStatus(value: unknown): value is ScheduledPostStatus | undefined {
  return value === undefined || (typeof value === 'string' && (SCHEDULED_POST_STATUSES as readonly string[]).includes(value));
}

function parseAssetIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => sanitizeString(item, 160)).filter(Boolean)));
}

const handler = createAPIHandler(
  async (req, context) => {
    logger.info('[API /social/scheduled-posts/[postId]] Received request');
    const entitlements = await requireSubscription(req as any, 'explorer');
    const { postId } = await context.params;

    if (!postId) {
      return apiError('postId is required', { status: 400, code: 'INVALID_INPUT' });
    }

    if (req.method === 'DELETE') {
      await deleteScheduledPost(entitlements.uid, postId);
      return apiResponse({ success: true });
    }

    const body = await req.json();

    if (typeof body.scheduledTime === 'string' && body.scheduledTime.trim() && !isAllowedStatus(body.status)) {
      return apiError('Unsupported scheduled post status', { status: 400, code: 'INVALID_STATUS' });
    }

    if (typeof body.scheduledTime === 'string' && body.scheduledTime.trim() && body.moveOnly === true) {
      const moved = await moveScheduledPost(entitlements.uid, postId, body.scheduledTime);
      return apiResponse({ post: moved });
    }

    const post = await updateScheduledPost(entitlements.uid, postId, {
      platform: isAllowedPlatform(body.platform) ? body.platform : undefined,
      socialAccountId: typeof body.socialAccountId === 'string' ? sanitizeString(body.socialAccountId, 160) : undefined,
      scheduledTime: typeof body.scheduledTime === 'string' ? body.scheduledTime : undefined,
      caption: typeof body.caption === 'string' ? sanitizeString(body.caption, 5000) : undefined,
      title: typeof body.title === 'string' ? sanitizeString(body.title, 160) : undefined,
      assetIds: parseAssetIds(body.assetIds),
      campaignId: typeof body.campaignId === 'string' ? sanitizeString(body.campaignId, 120) : undefined,
      notes: typeof body.notes === 'string' ? sanitizeString(body.notes, 1000) : undefined,
      timezone: typeof body.timezone === 'string' ? sanitizeString(body.timezone, 80) : undefined,
      status: isAllowedStatus(body.status) ? body.status : undefined,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : undefined,
    });

    return apiResponse({ post });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 12 },
    timeout: 45000,
  }
);

export const PATCH = handler;
export const DELETE = handler;
