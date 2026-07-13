import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  createScheduledPost,
  getContentCalendarSummary,
  listScheduledPosts,
} from '@/social';
import { sanitizeString } from '@/lib/security';
import { SOCIAL_PLATFORMS, type SocialPlatform, SCHEDULED_POST_STATUSES, type ScheduledPostStatus } from '@/social/types';
import { isScheduledPostContentType } from '@/social/capabilities';

function isAllowedPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function isAllowedStatus(value: unknown): value is ScheduledPostStatus {
  return typeof value === 'string' && (SCHEDULED_POST_STATUSES as readonly string[]).includes(value);
}

function parseMonth(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('month must be in YYYY-MM format');
  }
  return value;
}

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '100');
  if (!Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.floor(value), 1), 250);
}

function parseAssetIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => sanitizeString(item, 160)).filter(Boolean)));
}

function parseHashtags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => sanitizeString(item.replace(/^#/, ''), 80)).filter(Boolean)));
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /social/scheduled-posts] Received request');
    const entitlements = await requireSubscription(req as any, 'explorer');

    if (req.method === 'GET') {
      let month: string | undefined;
      try {
        month = parseMonth(req.nextUrl.searchParams.get('month'));
      } catch (error) {
        return apiError(error instanceof Error ? error.message : 'Invalid month', { status: 400, code: 'INVALID_INPUT' });
      }
      const limit = parseLimit(req);
      const posts = await listScheduledPosts(entitlements.uid, { month, limit });
      const summary = await getContentCalendarSummary(entitlements.uid, month, posts);

      return apiResponse({
        month: month || new Date().toISOString().slice(0, 7),
        summary,
        posts,
      }, {
        cache: {
          maxAge: 30,
          staleWhileRevalidate: 60,
          private: true,
        },
      });
    }

    const body = await req.json();

    if (!isAllowedPlatform(body.platform)) {
      return apiError('Unsupported social platform', { status: 400, code: 'INVALID_PLATFORM' });
    }

    if (!isAllowedStatus(body.status ?? 'draft')) {
      return apiError('Unsupported scheduled post status', { status: 400, code: 'INVALID_STATUS' });
    }

    if (typeof body.scheduledTime !== 'string' || !body.scheduledTime.trim()) {
      return apiError('scheduledTime is required', { status: 400, code: 'INVALID_INPUT' });
    }

    if (typeof body.caption !== 'string') {
      return apiError('caption is required', { status: 400, code: 'INVALID_INPUT' });
    }

    const post = await createScheduledPost({
      platform: body.platform,
      socialAccountId: typeof body.socialAccountId === 'string' ? sanitizeString(body.socialAccountId, 160) : undefined,
      connectedAccountId: typeof body.connectedAccountId === 'string' ? sanitizeString(body.connectedAccountId, 160) : undefined,
      publicationGroupId: typeof body.publicationGroupId === 'string' ? sanitizeString(body.publicationGroupId, 160) : undefined,
      contentType: isScheduledPostContentType(body.contentType) ? body.contentType : undefined,
      scheduledTime: body.scheduledTime,
      caption: sanitizeString(body.caption, 5000),
      hashtags: parseHashtags(body.hashtags),
      cta: typeof body.cta === 'string' ? sanitizeString(body.cta, 500) : undefined,
      title: typeof body.title === 'string' ? sanitizeString(body.title, 160) : undefined,
      assetIds: parseAssetIds(body.assetIds),
      campaignId: typeof body.campaignId === 'string' ? sanitizeString(body.campaignId, 120) : undefined,
      notes: typeof body.notes === 'string' ? sanitizeString(body.notes, 1000) : undefined,
      timezone: typeof body.timezone === 'string' ? sanitizeString(body.timezone, 80) : undefined,
      status: isAllowedStatus(body.status) ? body.status : 'draft',
      platformSettings: body.platformSettings && typeof body.platformSettings === 'object' ? body.platformSettings as Record<string, unknown> : undefined,
      userId: entitlements.uid,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : undefined,
    });

    return apiResponse({ post }, { status: 201 });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 12 },
    timeout: 45000,
  }
);

export const GET = handler;
export const POST = handler;
