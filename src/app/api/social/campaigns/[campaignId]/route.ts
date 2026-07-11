import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  deleteSocialCampaign,
  updateSocialCampaign,
} from '@/social/service';
import { sanitizeString } from '@/lib/security';
import { SOCIAL_PLATFORMS, type SocialPlatform, SOCIAL_CAMPAIGN_STATUSES, type SocialCampaignStatus } from '@/social/types';

function isAllowedPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function isAllowedStatus(value: unknown): value is SocialCampaignStatus {
  return typeof value === 'string' && (SOCIAL_CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

function parseCampaignId(req: NextRequest): string {
  const value = req.nextUrl.pathname.split('/').pop() || '';
  return sanitizeString(value, 160);
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /social/campaigns/[campaignId]] Received request');
    const entitlements = await requireSubscription(req as any, 'pro');
    const campaignId = parseCampaignId(req);
    if (!campaignId) {
      return apiError('campaignId is required', { status: 400, code: 'INVALID_INPUT' });
    }

    if (req.method === 'PATCH') {
      const body = await req.json();
      const campaign = await updateSocialCampaign(entitlements.uid, campaignId, {
        campaignName: typeof body.campaignName === 'string' ? sanitizeString(body.campaignName, 140) : undefined,
        platform: isAllowedPlatform(body.platform) ? body.platform : undefined,
        goal: typeof body.goal === 'string' ? sanitizeString(body.goal, 500) : undefined,
        status: isAllowedStatus(body.status) ? body.status : undefined,
        startDate: typeof body.startDate === 'string' ? sanitizeString(body.startDate, 40) : undefined,
        endDate: typeof body.endDate === 'string' ? sanitizeString(body.endDate, 40) : undefined,
        notes: typeof body.notes === 'string' ? sanitizeString(body.notes, 1000) : undefined,
        color: typeof body.color === 'string' ? sanitizeString(body.color, 24) : undefined,
        metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : undefined,
      });

      return apiResponse({ campaign });
    }

    if (req.method === 'DELETE') {
      await deleteSocialCampaign(entitlements.uid, campaignId);
      return apiResponse({ success: true });
    }

    return apiError('Method not allowed', { status: 405, code: 'METHOD_NOT_ALLOWED' });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 12 },
    timeout: 30000,
  }
);

export const PATCH = handler;
export const DELETE = handler;
