import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  createSocialAccount,
  getSocialHubCapabilities,
  getSocialHubOverview,
  listSocialProviders,
} from '@/social';
import { sanitizeString } from '@/lib/security';
import { SOCIAL_PLATFORMS, type SocialPlatform, type SocialCredentialPayload } from '@/social/types';
import { getTierPrivileges } from '@/lib/tier-privileges';

function isAllowedPlatform(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function normalizeCredentials(value: unknown): SocialCredentialPayload | null {
  if (!value || typeof value !== 'object') return null;

  const payload = value as Record<string, unknown>;
  return {
    connectionType: typeof payload.connectionType === 'string'
      && ['oauth', 'manual', 'imported'].includes(payload.connectionType)
      ? payload.connectionType as 'oauth' | 'manual' | 'imported'
      : undefined,
    accessToken: typeof payload.accessToken === 'string' ? sanitizeString(payload.accessToken, 8000) : undefined,
    refreshToken: typeof payload.refreshToken === 'string' ? sanitizeString(payload.refreshToken, 8000) : undefined,
    externalAccountId: typeof payload.externalAccountId === 'string' ? sanitizeString(payload.externalAccountId, 160) : undefined,
    expiresInSeconds: typeof payload.expiresInSeconds === 'number' ? payload.expiresInSeconds : undefined,
    tokenType: typeof payload.tokenType === 'string' ? sanitizeString(payload.tokenType, 40) : undefined,
    scopes: Array.isArray(payload.scopes) ? payload.scopes.filter((item): item is string => typeof item === 'string') : undefined,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata as Record<string, unknown> : undefined,
  };
}

function parseScopes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => sanitizeString(item, 120)).filter(Boolean)));
}

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '24');
  if (!Number.isFinite(value)) return 24;
  return Math.min(Math.max(Math.floor(value), 1), 100);
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /social/accounts] Received request');
    const entitlements = await requireSubscription(req as any, 'explorer');

    if (req.method === 'GET') {
      const limit = parseLimit(req);
      const overview = await getSocialHubOverview(entitlements.uid);

      return apiResponse({
        capabilities: getSocialHubCapabilities(),
        providers: listSocialProviders(),
        summary: overview.summary,
        accounts: overview.accounts.slice(0, limit),
        schedulerLimits: getTierPrivileges(entitlements.subscription.plan).scheduler,
      }, {
        cache: {
          maxAge: 30,
          staleWhileRevalidate: 60,
          private: true,
        },
      });
    }

    const body = await req.json();

    if (!isAllowedPlatform(body.providerId)) {
      return apiError('Unsupported social platform', { status: 400, code: 'INVALID_PROVIDER' });
    }

    if (typeof body.accountName !== 'string' || !body.accountName.trim()) {
      return apiError('accountName is required', { status: 400, code: 'INVALID_INPUT' });
    }

    const accountLimit = getTierPrivileges(entitlements.subscription.plan).scheduler.connectedAccounts;
    const existingAccounts = (await getSocialHubOverview(entitlements.uid)).accounts;
    if (existingAccounts.length >= accountLimit) {
      return apiError(`Your ${getTierPrivileges(entitlements.subscription.plan).label} plan allows ${accountLimit} connected account${accountLimit === 1 ? '' : 's'}.`, {
        status: 403,
        code: 'SOCIAL_ACCOUNT_LIMIT_REACHED',
      });
    }

    const socialAccount = await createSocialAccount({
      providerId: body.providerId,
      accountName: sanitizeString(body.accountName, 120),
      connectionType: body.connectionType === 'oauth' || body.connectionType === 'manual' || body.connectionType === 'imported'
        ? body.connectionType
        : undefined,
      handle: typeof body.handle === 'string' ? sanitizeString(body.handle, 120) : undefined,
      providerAccountId: typeof body.providerAccountId === 'string' ? sanitizeString(body.providerAccountId, 160) : undefined,
      notes: typeof body.notes === 'string' ? sanitizeString(body.notes, 500) : undefined,
      timezone: typeof body.timezone === 'string' ? sanitizeString(body.timezone, 80) : undefined,
      scopes: parseScopes(body.scopes),
      credentials: normalizeCredentials(body.credentials),
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : undefined,
      userId: entitlements.uid,
      status: body.status === 'connected' || body.status === 'pending' || body.status === 'expired' ? body.status : undefined,
    });

    return apiResponse({ socialAccount }, { status: 201 });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
    timeout: 45000,
  }
);

export const GET = handler;
export const POST = handler;
