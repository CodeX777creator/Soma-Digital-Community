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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getHttpError(error: unknown): { status?: number; code?: string; message?: string } {
  if (!error || typeof error !== 'object') return {};
  const record = error as { status?: unknown; code?: unknown; message?: unknown };
  return {
    status: typeof record.status === 'number' ? record.status : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    message: typeof record.message === 'string' ? record.message : undefined,
  };
}

const handler = createAPIHandler(
  async (req) => {
    let stage = 'parse_provider';

    try {
      const provider = parseProvider(req);
      if (!isAllowedProvider(provider)) {
        return apiError('Unsupported provider', { status: 400, code: 'INVALID_PROVIDER' });
      }

      stage = 'authenticate_user';
      const entitlements = await requireSubscription(req as any, 'explorer');

      stage = 'parse_body';
      const body = await req.json().catch(() => ({} as Record<string, unknown>));

      stage = 'load_provider_rule';
      const rule = getSocialOAuthRule(provider);
      const accountName = typeof body.accountName === 'string' && body.accountName.trim()
        ? sanitizeString(body.accountName, 120)
        : `${rule.providerId} account`;

      stage = 'build_signed_state';
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
        stage = 'create_pending_social_account';
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

      stage = 'build_authorization_url';
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
    } catch (error) {
      const httpError = getHttpError(error);
      const message = httpError.message || getErrorMessage(error);

      logger.error('[Social OAuth] Start handoff failed', error instanceof Error ? error : new Error(message), {
        stage,
        status: httpError.status,
        code: httpError.code,
      });

      if (httpError.status) {
        return apiError(message, {
          status: httpError.status,
          code: httpError.code || 'SOCIAL_OAUTH_START_AUTH_FAILED',
        });
      }

      return apiError(`OAuth handoff failed during ${stage}.`, {
        status: 500,
        code: 'SOCIAL_OAUTH_START_FAILED',
        details: message,
      });
    }
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
    timeout: 20000,
  }
);

export const POST = handler;
