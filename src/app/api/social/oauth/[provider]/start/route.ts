import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { createSocialAccount } from '@/social/service';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '@/social/types';
import {
  buildSocialOAuthState,
  buildOAuthAuthorizationUrl,
  getSocialOAuthRule,
} from '@/social/oauth';
import { sanitizeString } from '@/lib/security';

function isAllowedProvider(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function parseProvider(req: NextRequest): string {
  return req.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
}

const handler = createAPIHandler(
  async (req) => {
    const provider = parseProvider(req);
    if (!isAllowedProvider(provider)) {
      return apiError('Unsupported provider', { status: 400, code: 'INVALID_PROVIDER' });
    }

    const entitlements = await requireSubscription(req as any, 'pro');
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rule = getSocialOAuthRule(provider);
    const accountName = typeof body.accountName === 'string' && body.accountName.trim()
      ? sanitizeString(body.accountName, 120)
      : `${rule.providerId} account`;

    const stateData = buildSocialOAuthState({
      providerId: provider,
      ownerId: entitlements.uid,
      socialAccountId: typeof body.socialAccountId === 'string' ? sanitizeString(body.socialAccountId, 160) : undefined,
      accountName,
      handle: typeof body.handle === 'string' ? sanitizeString(body.handle, 120) : undefined,
      providerAccountId: typeof body.providerAccountId === 'string' ? sanitizeString(body.providerAccountId, 160) : undefined,
      scopes: Array.isArray(body.scopes)
        ? body.scopes.filter((item: unknown): item is string => typeof item === 'string')
        : rule.defaultScopes,
      returnTo: typeof body.returnTo === 'string' ? sanitizeString(body.returnTo, 200) : '/social',
      usePkce: rule.requiresPkce,
    });

    let socialAccountId = typeof body.socialAccountId === 'string' ? sanitizeString(body.socialAccountId, 160) : '';
    if (!socialAccountId) {
      const socialAccount = await createSocialAccount({
        providerId: provider,
        accountName,
        connectionType: 'oauth',
        handle: typeof body.handle === 'string' ? sanitizeString(body.handle, 120) : undefined,
        providerAccountId: typeof body.providerAccountId === 'string' ? sanitizeString(body.providerAccountId, 160) : undefined,
        scopes: stateData.payload.scopes,
        status: 'pending',
        userId: entitlements.uid,
        metadata: {
          oauthProviderId: provider,
          oauthStateHash: stateData.stateHash,
          oauthCallbackStatus: 'handoff_created',
          oauthReturnTo: stateData.payload.returnTo,
          oauthRequiresTokenExchange: true,
        },
      });
      socialAccountId = socialAccount.socialAccountId;
    }

    const callbackUrl = new URL(rule.callbackPath, process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').toString();
    const authorizationUrl = buildOAuthAuthorizationUrl({
      providerId: provider,
      callbackUrl,
      state: stateData.state,
      scopes: stateData.payload.scopes,
      codeChallenge: stateData.payload.codeChallenge,
    });

    logger.info('[Social OAuth] Start handoff prepared', {
      providerId: provider,
      ownerId: entitlements.uid,
      socialAccountId,
      authUrlAvailable: Boolean(authorizationUrl),
    });

    return apiResponse({
      provider,
      socialAccountId,
      callbackUrl,
      authorizationUrl,
      state: stateData.state,
      stateHash: stateData.stateHash,
      flowMode: rule.flowMode,
      requiresPkce: rule.requiresPkce,
      supportsRefreshToken: rule.supportsRefreshToken,
      nextStep: authorizationUrl ? 'redirect_to_provider' : 'attach_provider_authorization_url',
    }, { status: 201 });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
    timeout: 20000,
  }
);

export const POST = handler;
