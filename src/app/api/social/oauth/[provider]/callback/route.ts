import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { adminDb } from '@/lib/firebaseAdmin';
import { sanitizeString } from '@/lib/security';
import { createSocialAccount, updateSocialAccount } from '@/social/service';
import { exchangeOAuthCodeForTokens } from '@/social/oauth-client';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '@/social/types';
import {
  getOAuthReturnPath,
  getSocialOAuthRule,
  verifySocialOAuthState,
} from '@/social/oauth';

function isAllowedProvider(value: unknown): value is SocialPlatform {
  return typeof value === 'string' && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function parseProvider(req: NextRequest): string {
  return req.nextUrl.pathname.split('/').slice(-2, -1)[0] || '';
}

function readQueryOrBody(req: NextRequest, key: string, body: Record<string, unknown> | null): string | undefined {
  const query = req.nextUrl.searchParams.get(key);
  if (query) return query;
  const value = body?.[key];
  return typeof value === 'string' ? value : undefined;
}

function buildReturnRedirect(returnTo: string, params: Record<string, string | undefined>): NextResponse {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  const redirectUrl = new URL(returnTo, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      redirectUrl.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const handler = createAPIHandler(
  async (req) => {
    const provider = parseProvider(req);
    if (!isAllowedProvider(provider)) {
      return apiError('Unsupported provider', { status: 400, code: 'INVALID_PROVIDER' });
    }

    const rule = getSocialOAuthRule(provider);
    const body = req.method === 'POST' ? await readBody(req) : null;
    const code = readQueryOrBody(req, 'code', body);
    const stateValue = readQueryOrBody(req, 'state', body);
    const error = readQueryOrBody(req, 'error', body);
    const errorDescription = readQueryOrBody(req, 'error_description', body);

    if (!stateValue) {
      return apiError('OAuth state is required', { status: 400, code: 'INVALID_STATE' });
    }

    const state = verifySocialOAuthState(provider, stateValue);
    const handshakeId = adminDb.collection('socialOAuthHandshakes').doc().id;
    const stateHash = sanitizeString(stateValue.split('.')[0] || '', 2048);
    const returnTo = getOAuthReturnPath(state);
    const nextStep = code ? 'exchange_code_for_tokens' : 'complete_from_provider_redirect';

    let resolvedSocialAccountId = state.socialAccountId || '';
    let accountStatus: 'pending' | 'error' | 'connected' = 'pending';
    let exchangeError: string | null = null;

    if (!resolvedSocialAccountId) {
      const created = await createSocialAccount({
        providerId: provider,
        accountName: state.accountName || `${rule.providerId} account`,
        connectionType: 'oauth',
        handle: state.handle,
        providerAccountId: state.providerAccountId,
        scopes: state.scopes,
        status: 'pending',
        userId: state.ownerId,
        metadata: {
          oauthProviderId: provider,
          oauthHandshakeId: handshakeId,
          oauthCallbackStatus: 'received',
          oauthStateHash: stateHash,
          oauthCallbackAt: new Date().toISOString(),
          oauthRequiresTokenExchange: true,
        },
      });
      resolvedSocialAccountId = created.socialAccountId;
    } else {
      await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
        connectionType: 'oauth',
        status: 'pending',
        handle: state.handle,
        providerAccountId: state.providerAccountId,
        scopes: state.scopes,
        metadata: {
          oauthProviderId: provider,
          oauthHandshakeId: handshakeId,
          oauthCallbackStatus: 'received',
          oauthStateHash: stateHash,
          oauthCallbackAt: new Date().toISOString(),
          oauthRequiresTokenExchange: true,
        },
      });
    }

    if (error) {
      accountStatus = 'error';
      exchangeError = errorDescription || error;
      await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
        status: 'error',
        metadata: {
          oauthProviderId: provider,
          oauthHandshakeId: handshakeId,
          oauthCallbackStatus: 'failed',
          oauthError: error,
          oauthErrorDescription: errorDescription || undefined,
          oauthStateHash: stateHash,
          oauthCallbackAt: new Date().toISOString(),
        },
      });
    } else if (!code) {
      accountStatus = 'error';
      exchangeError = 'Missing OAuth authorization code';
      await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
        status: 'error',
        metadata: {
          oauthProviderId: provider,
          oauthHandshakeId: handshakeId,
          oauthCallbackStatus: 'failed',
          oauthError: 'missing_code',
          oauthStateHash: stateHash,
          oauthCallbackAt: new Date().toISOString(),
        },
      });
    } else {
      try {
        const tokenResult = await exchangeOAuthCodeForTokens({
          providerId: provider,
          code,
          redirectUri: new URL(rule.callbackPath, process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000').toString(),
          codeVerifier: state.codeVerifier,
        });

        accountStatus = 'connected';
        await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
          connectionType: 'oauth',
          status: 'connected',
          handle: state.handle,
          providerAccountId: tokenResult.providerAccountId || state.providerAccountId,
          scopes: tokenResult.scopes.length > 0 ? tokenResult.scopes : state.scopes,
          credentials: {
            connectionType: 'oauth',
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
            externalAccountId: tokenResult.providerAccountId,
            expiresInSeconds: tokenResult.expiresInSeconds,
            tokenType: tokenResult.tokenType,
            scopes: tokenResult.scopes.length > 0 ? tokenResult.scopes : state.scopes,
            metadata: {
              oauthProviderId: provider,
              oauthHandshakeId: handshakeId,
              oauthCallbackStatus: 'connected',
              oauthStateHash: stateHash,
              oauthCallbackAt: new Date().toISOString(),
              oauthTokenType: tokenResult.tokenType || null,
              oauthRefreshTokenPresent: Boolean(tokenResult.refreshToken),
              oauthGrantedScopes: tokenResult.scopes,
              oauthProviderAccountId: tokenResult.providerAccountId || state.providerAccountId || null,
              oauthTokenExchangeCompletedAt: new Date().toISOString(),
            },
          },
          metadata: {
            oauthProviderId: provider,
            oauthHandshakeId: handshakeId,
            oauthCallbackStatus: 'connected',
            oauthStateHash: stateHash,
            oauthCallbackAt: new Date().toISOString(),
            oauthRefreshTokenPresent: Boolean(tokenResult.refreshToken),
            oauthGrantedScopes: tokenResult.scopes,
            oauthTokenType: tokenResult.tokenType || null,
            oauthProviderAccountId: tokenResult.providerAccountId || state.providerAccountId || null,
            oauthRequiresTokenExchange: false,
          },
        });
      } catch (exchangeFailure) {
        accountStatus = 'error';
        exchangeError = exchangeFailure instanceof Error ? exchangeFailure.message : String(exchangeFailure);
        await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
          status: 'error',
          metadata: {
            oauthProviderId: provider,
            oauthHandshakeId: handshakeId,
            oauthCallbackStatus: 'failed',
            oauthStateHash: stateHash,
            oauthError: exchangeError,
            oauthCallbackAt: new Date().toISOString(),
            oauthRequiresTokenExchange: true,
          },
        });
      }
    }

    await adminDb.collection('socialOAuthHandshakes').doc(handshakeId).set({
      handshakeId,
      providerId: provider,
      ownerId: state.ownerId,
      socialAccountId: resolvedSocialAccountId || null,
      status: accountStatus === 'connected' ? 'connected' : 'failed',
      callbackMode: rule.flowMode,
      codeReceived: Boolean(code),
      stateHash,
      error: exchangeError ? sanitizeString(exchangeError, 120) : null,
      errorDescription: errorDescription ? sanitizeString(errorDescription, 500) : null,
      returnTo,
      nextStep,
      accountStatus,
      connectedAt: accountStatus === 'connected' ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    logger.info('[Social OAuth] Callback processed', {
      providerId: provider,
      handshakeId,
      ownerId: state.ownerId,
      socialAccountId: resolvedSocialAccountId || null,
      codeReceived: Boolean(code),
      errorReceived: Boolean(error || exchangeError),
      nextStep,
    });

    return buildReturnRedirect(returnTo, {
      oauth_provider: provider,
      oauth_status: accountStatus,
      oauth_handshake: handshakeId,
      oauth_account: resolvedSocialAccountId || undefined,
      oauth_error: accountStatus === 'connected' ? undefined : sanitizeString(exchangeError || errorDescription || error || 'oauth_failed', 120),
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 15000,
  }
);

export const GET = handler;
export const POST = handler;
