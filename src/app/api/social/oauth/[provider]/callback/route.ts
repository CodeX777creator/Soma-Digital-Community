import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiError, createAPIHandler } from '@/lib/api-middleware';
import { toAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { adminDb } from '@/lib/firebaseAdmin';
import { sanitizeString } from '@/lib/security';
import { createSocialAccount, updateSocialAccount } from '@/social/service';
import { exchangeOAuthCodeForTokens } from '@/social/oauth-client';
import { syncSocialConnectionReadiness } from '@/social/readiness';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '@/social/types';
import {
  getOAuthReturnPath,
  getSocialOAuthStateHash,
  getSocialOAuthRule,
  verifySocialOAuthState,
} from '@/social/oauth';
import { createSocialOAuthProviderError } from '@/social/oauth-errors';

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
    const stateHash = getSocialOAuthStateHash(stateValue);
    const returnTo = getOAuthReturnPath(state);
    const nextStep = code ? 'exchange_code_for_tokens' : 'complete_from_provider_redirect';

    const stateRef = adminDb.collection('socialOAuthStates').doc(stateHash);
    const stateStatus = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(stateRef);
      if (!snapshot.exists) {
        transaction.set(stateRef, {
          stateHash,
          providerId: provider,
          ownerId: state.ownerId,
          socialAccountId: state.socialAccountId || null,
          status: 'callback_received_without_start_record',
          consumed: true,
          consumedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
        return 'created_from_callback';
      }

      const data = snapshot.data() as { consumed?: boolean; ownerId?: string; providerId?: string };
      if (data.consumed) {
        return 'already_consumed';
      }
      if (data.ownerId !== state.ownerId || data.providerId !== provider) {
        return 'mismatch';
      }
      transaction.set(stateRef, {
        status: 'consumed',
        consumed: true,
        consumedAt: new Date().toISOString(),
        handshakeId,
      }, { merge: true });
      return 'consumed';
    });

    if (stateStatus === 'already_consumed') {
      return apiError('OAuth state has already been used.', { status: 400, code: 'OAUTH_STATE_REPLAYED' });
    }
    if (stateStatus === 'mismatch') {
      return apiError('OAuth state does not match this provider session.', { status: 400, code: 'OAUTH_STATE_MISMATCH' });
    }

    let resolvedSocialAccountId = state.socialAccountId || '';
    let accountStatus: 'pending' | 'error' | 'connected' = 'pending';
    let exchangeError: string | null = null;
    let exchangeErrorCode: string | null = null;

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
      const providerError = createSocialOAuthProviderError({
        providerId: provider,
        phase: 'callback',
        error,
        errorDescription,
      });
      exchangeError = providerError.userMessage;
      exchangeErrorCode = String(providerError.code);
      await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
        status: 'error',
        metadata: {
          oauthProviderId: provider,
          oauthHandshakeId: handshakeId,
          oauthCallbackStatus: 'failed',
          oauthError: exchangeErrorCode,
          oauthErrorDescription: errorDescription || undefined,
          oauthUserMessage: exchangeError,
          oauthStateHash: stateHash,
          oauthCallbackAt: new Date().toISOString(),
        },
      });
    } else if (!code) {
      accountStatus = 'error';
      const providerError = createSocialOAuthProviderError({
        providerId: provider,
        phase: 'callback',
        error: 'missing_authorization_code',
      });
      exchangeError = providerError.userMessage;
      exchangeErrorCode = String(providerError.code);
      await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
        status: 'error',
        metadata: {
          oauthProviderId: provider,
          oauthHandshakeId: handshakeId,
          oauthCallbackStatus: 'failed',
          oauthError: exchangeErrorCode,
          oauthUserMessage: exchangeError,
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
        const grantedScopes = tokenResult.scopes.length > 0 ? tokenResult.scopes : (state.scopes || rule.defaultScopes);
        const readinessResult = await syncSocialConnectionReadiness({
          providerId: provider,
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          scopes: grantedScopes,
          providerAccountId: tokenResult.providerAccountId || state.providerAccountId,
          handle: state.handle,
          accountName: state.accountName,
        });

        await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
          connectionType: 'oauth',
          status: 'connected',
          accountName: readinessResult.accountName || state.accountName,
          handle: readinessResult.handle || state.handle,
          providerAccountId: readinessResult.providerAccountId || tokenResult.providerAccountId || state.providerAccountId,
          scopes: grantedScopes,
          connectionReadiness: readinessResult.readiness,
          credentials: {
            connectionType: 'oauth',
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
            externalAccountId: readinessResult.providerAccountId || tokenResult.providerAccountId,
            expiresInSeconds: tokenResult.expiresInSeconds,
            tokenType: tokenResult.tokenType,
            scopes: grantedScopes,
            metadata: {
              oauthProviderId: provider,
              oauthHandshakeId: handshakeId,
              oauthCallbackStatus: 'connected',
              oauthStateHash: stateHash,
              oauthCallbackAt: new Date().toISOString(),
              oauthTokenType: tokenResult.tokenType || null,
              oauthRefreshTokenPresent: Boolean(tokenResult.refreshToken),
              oauthGrantedScopes: tokenResult.scopes,
              oauthProviderAccountId: readinessResult.providerAccountId || tokenResult.providerAccountId || state.providerAccountId || null,
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
            oauthProviderAccountId: readinessResult.providerAccountId || tokenResult.providerAccountId || state.providerAccountId || null,
            oauthRequiresTokenExchange: false,
            ...readinessResult.metadata,
          },
        });
      } catch (exchangeFailure) {
        accountStatus = 'error';
        const appError = toAppError(exchangeFailure, {
          status: 400,
          code: 'SOCIAL_OAUTH_TOKEN_EXCHANGE_FAILED',
        });
        exchangeError = appError.userMessage;
        exchangeErrorCode = String(appError.code);
        await updateSocialAccount(state.ownerId, resolvedSocialAccountId, {
          status: 'error',
          metadata: {
            oauthProviderId: provider,
            oauthHandshakeId: handshakeId,
            oauthCallbackStatus: 'failed',
            oauthStateHash: stateHash,
            oauthError: exchangeErrorCode,
            oauthUserMessage: exchangeError,
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
      error: exchangeErrorCode ? sanitizeString(exchangeErrorCode, 120) : exchangeError ? sanitizeString(exchangeError, 120) : null,
      errorDescription: errorDescription ? sanitizeString(errorDescription, 500) : null,
      userMessage: exchangeError ? sanitizeString(exchangeError, 300) : null,
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
      oauth_error: accountStatus === 'connected' ? undefined : sanitizeString(exchangeError || 'We could not connect this social account.', 180),
      oauth_error_code: accountStatus === 'connected' ? undefined : sanitizeString(exchangeErrorCode || 'SOCIAL_OAUTH_FAILED', 120),
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 15000,
  }
);

export const GET = handler;
export const POST = handler;
