import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  refreshSocialAccountDestinations,
  selectSocialAccountDestination,
} from '@/social';
import { sanitizeString } from '@/lib/security';

const handler = createAPIHandler(
  async (req, context) => {
    logger.info('[API /social/accounts/[accountId]/destinations] Received request');
    const entitlements = await requireSubscription(req as any, 'explorer');
    const { accountId } = await context.params;

    if (!accountId) {
      return apiError('accountId is required', { status: 400, code: 'INVALID_INPUT' });
    }

    if (req.method === 'GET') {
      const account = await refreshSocialAccountDestinations(entitlements.uid, accountId);
      return apiResponse({ socialAccount: account });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const destinationId = typeof body.destinationId === 'string'
      ? sanitizeString(body.destinationId, 160)
      : '';

    if (!destinationId) {
      return apiError('destinationId is required', { status: 400, code: 'INVALID_DESTINATION' });
    }

    const account = await selectSocialAccountDestination(entitlements.uid, accountId, destinationId);
    return apiResponse({ socialAccount: account });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 45000,
  }
);

export const GET = handler;
export const POST = handler;
