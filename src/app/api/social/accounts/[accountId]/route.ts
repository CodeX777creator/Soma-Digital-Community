import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  deleteSocialAccount,
  disconnectSocialAccount,
  updateSocialAccount,
} from '@/social';
import { sanitizeString } from '@/lib/security';
import { type SocialCredentialPayload, type SocialAccountStatus } from '@/social/types';

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

function normalizeStatus(value: unknown): SocialAccountStatus | undefined {
  return value === 'connected' || value === 'pending' || value === 'expired' || value === 'disconnected' || value === 'error'
    ? value
    : undefined;
}

const handler = createAPIHandler(
  async (req, context) => {
    logger.info('[API /social/accounts/[accountId]] Received request');
    const entitlements = await requireSubscription(req as any, 'explorer');
    const { accountId } = await context.params;

    if (!accountId) {
      return apiError('accountId is required', { status: 400, code: 'INVALID_INPUT' });
    }

    if (req.method === 'DELETE') {
      const { searchParams } = new URL(req.url);
      const permanent = searchParams.get('permanent') === 'true' || searchParams.get('mode') === 'permanent';
      if (permanent) {
        await deleteSocialAccount(entitlements.uid, accountId);
        return apiResponse({ deleted: true });
      }
      const account = await disconnectSocialAccount(entitlements.uid, accountId);
      return apiResponse({ socialAccount: account });
    }

    const body = await req.json();
    const account = await updateSocialAccount(entitlements.uid, accountId, {
      accountName: typeof body.accountName === 'string' ? sanitizeString(body.accountName, 120) : undefined,
      connectionType: body.connectionType === 'oauth' || body.connectionType === 'manual' || body.connectionType === 'imported'
        ? body.connectionType
        : undefined,
      handle: typeof body.handle === 'string' ? sanitizeString(body.handle, 120) : undefined,
      providerAccountId: typeof body.providerAccountId === 'string' ? sanitizeString(body.providerAccountId, 160) : undefined,
      notes: typeof body.notes === 'string' ? sanitizeString(body.notes, 500) : undefined,
      timezone: typeof body.timezone === 'string' ? sanitizeString(body.timezone, 80) : undefined,
      scopes: Array.isArray(body.scopes) ? body.scopes.filter((item: unknown): item is string => typeof item === 'string') : undefined,
      status: normalizeStatus(body.status),
      credentials: body.credentials ? normalizeCredentials(body.credentials) : undefined,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : undefined,
    });

    return apiResponse({ socialAccount: account });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
    timeout: 45000,
  }
);

export const PATCH = handler;
export const DELETE = handler;
