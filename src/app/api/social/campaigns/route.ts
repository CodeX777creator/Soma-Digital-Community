import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  createSocialCampaign,
  getContentCalendarCampaignSummary,
  listSocialCampaigns,
} from '@/social/service';
import { sanitizeString } from '@/lib/security';
import { SOCIAL_PLATFORMS, type SocialPlatform, SOCIAL_CAMPAIGN_STATUSES, type SocialCampaignStatus } from '@/social/types';

function isAllowedPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function isAllowedStatus(value: unknown): value is SocialCampaignStatus {
  return typeof value === 'string' && (SOCIAL_CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '24');
  if (!Number.isFinite(value)) return 24;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /social/campaigns] Received request');
    const entitlements = await requireSubscription(req as any, 'pro');

    if (req.method === 'GET') {
      const limit = parseLimit(req);
      const campaigns = await listSocialCampaigns(entitlements.uid);
      const summary = await getContentCalendarCampaignSummary(entitlements.uid);

      return apiResponse({
        summary,
        campaigns: campaigns.slice(0, limit),
      }, {
        cache: {
          maxAge: 30,
          staleWhileRevalidate: 60,
          private: true,
        },
      });
    }

    const body = await req.json();
    if (typeof body.campaignName !== 'string' || !body.campaignName.trim()) {
      return apiError('campaignName is required', { status: 400, code: 'INVALID_INPUT' });
    }
    if (body.platform && !isAllowedPlatform(body.platform)) {
      return apiError('Unsupported campaign platform', { status: 400, code: 'INVALID_PLATFORM' });
    }
    if (body.status && !isAllowedStatus(body.status)) {
      return apiError('Unsupported campaign status', { status: 400, code: 'INVALID_STATUS' });
    }

    const campaign = await createSocialCampaign({
      campaignName: sanitizeString(body.campaignName, 140),
      platform: isAllowedPlatform(body.platform) ? body.platform : undefined,
      goal: typeof body.goal === 'string' ? sanitizeString(body.goal, 500) : undefined,
      status: isAllowedStatus(body.status) ? body.status : undefined,
      startDate: typeof body.startDate === 'string' ? sanitizeString(body.startDate, 40) : undefined,
      endDate: typeof body.endDate === 'string' ? sanitizeString(body.endDate, 40) : undefined,
      notes: typeof body.notes === 'string' ? sanitizeString(body.notes, 1000) : undefined,
      color: typeof body.color === 'string' ? sanitizeString(body.color, 24) : undefined,
      userId: entitlements.uid,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : undefined,
    });

    return apiResponse({ campaign }, { status: 201 });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 12 },
    timeout: 45000,
  }
);

export const GET = handler;
export const POST = handler;
