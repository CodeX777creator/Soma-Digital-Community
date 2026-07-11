import { sanitizeString } from '@/lib/security';
import type { SocialPlatform } from './types';
import { getSocialOAuthRule } from './oauth';

export interface SocialOAuthTokenResult {
  providerId: SocialPlatform;
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  tokenType?: string;
  scopes: string[];
  providerAccountId?: string;
  raw: Record<string, unknown>;
}

function normalizeScopesFromValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => sanitizeString(item, 160))
          .filter(Boolean)
      )
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(/[,\s]+/)
          .map((item) => sanitizeString(item, 160))
          .filter(Boolean)
      )
    );
  }

  return [];
}

function resolveProviderAccountId(payload: Record<string, unknown>): string | undefined {
  const candidateKeys = ['providerAccountId', 'externalAccountId', 'user_id', 'sub', 'id', 'account_id', 'open_id'];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return sanitizeString(value, 160);
    }
  }
  return undefined;
}

function buildBasicAuthHeader(clientId?: string | null, clientSecret?: string | null): string | undefined {
  if (!clientId || !clientSecret) return undefined;
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`;
}

async function postTokenRequest(input: {
  providerId: SocialPlatform;
  body: URLSearchParams;
}): Promise<Record<string, unknown>> {
  const rule = getSocialOAuthRule(input.providerId);
  if (!rule.tokenUrl) {
    throw new Error(`OAuth token endpoint is not configured for ${input.providerId}`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (rule.clientAuthMethod === 'basic') {
    const header = buildBasicAuthHeader(rule.clientId, rule.clientSecret);
    if (header) {
      headers.Authorization = header;
    }
  } else {
    if (rule.clientId) {
      input.body.set('client_id', rule.clientId);
    }
    if (rule.clientSecret) {
      input.body.set('client_secret', rule.clientSecret);
    }
  }

  const response = await fetch(rule.tokenUrl, {
    method: 'POST',
    headers,
    body: input.body.toString(),
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};

  if (text.trim()) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { rawResponse: text };
    }
  }

  if (!response.ok) {
    const message = typeof parsed.error_description === 'string'
      ? parsed.error_description
      : typeof parsed.error === 'string'
        ? parsed.error
        : `Token endpoint returned HTTP ${response.status}`;
    throw new Error(message);
  }

  return parsed;
}

export async function exchangeOAuthCodeForTokens(input: {
  providerId: SocialPlatform;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}): Promise<SocialOAuthTokenResult> {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', sanitizeString(input.code, 4096));
  body.set('redirect_uri', sanitizeString(input.redirectUri, 400));

  if (input.codeVerifier) {
    body.set('code_verifier', sanitizeString(input.codeVerifier, 256));
  }

  const payload = await postTokenRequest({ providerId: input.providerId, body });
  const accessToken = typeof payload.access_token === 'string'
    ? payload.access_token
    : typeof payload.accessToken === 'string'
      ? payload.accessToken
      : '';

  if (!accessToken) {
    throw new Error('OAuth token response did not include an access token');
  }

  const expiresIn = typeof payload.expires_in === 'number'
    ? payload.expires_in
    : typeof payload.expiresIn === 'number'
      ? payload.expiresIn
      : undefined;

  return {
    providerId: input.providerId,
    accessToken: sanitizeString(accessToken, 8192),
    refreshToken: typeof payload.refresh_token === 'string'
      ? sanitizeString(payload.refresh_token, 8192)
      : typeof payload.refreshToken === 'string'
        ? sanitizeString(payload.refreshToken, 8192)
        : undefined,
    expiresInSeconds: typeof expiresIn === 'number' && Number.isFinite(expiresIn) ? Math.max(0, Math.floor(expiresIn)) : undefined,
    tokenType: typeof payload.token_type === 'string'
      ? sanitizeString(payload.token_type, 40)
      : typeof payload.tokenType === 'string'
        ? sanitizeString(payload.tokenType, 40)
        : undefined,
    scopes: normalizeScopesFromValue(payload.scope || payload.scopes),
    providerAccountId: resolveProviderAccountId(payload),
    raw: payload,
  };
}

export async function refreshOAuthTokens(input: {
  providerId: SocialPlatform;
  refreshToken: string;
  redirectUri?: string;
}): Promise<SocialOAuthTokenResult> {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', sanitizeString(input.refreshToken, 8192));
  if (input.redirectUri) {
    body.set('redirect_uri', sanitizeString(input.redirectUri, 400));
  }

  const payload = await postTokenRequest({ providerId: input.providerId, body });
  const accessToken = typeof payload.access_token === 'string'
    ? payload.access_token
    : typeof payload.accessToken === 'string'
      ? payload.accessToken
      : '';

  if (!accessToken) {
    throw new Error('OAuth refresh response did not include an access token');
  }

  const expiresIn = typeof payload.expires_in === 'number'
    ? payload.expires_in
    : typeof payload.expiresIn === 'number'
      ? payload.expiresIn
      : undefined;

  return {
    providerId: input.providerId,
    accessToken: sanitizeString(accessToken, 8192),
    refreshToken: typeof payload.refresh_token === 'string'
      ? sanitizeString(payload.refresh_token, 8192)
      : typeof payload.refreshToken === 'string'
        ? sanitizeString(payload.refreshToken, 8192)
        : input.refreshToken,
    expiresInSeconds: typeof expiresIn === 'number' && Number.isFinite(expiresIn) ? Math.max(0, Math.floor(expiresIn)) : undefined,
    tokenType: typeof payload.token_type === 'string'
      ? sanitizeString(payload.token_type, 40)
      : typeof payload.tokenType === 'string'
        ? sanitizeString(payload.tokenType, 40)
        : undefined,
    scopes: normalizeScopesFromValue(payload.scope || payload.scopes),
    providerAccountId: resolveProviderAccountId(payload),
    raw: payload,
  };
}
