import crypto from 'crypto';
import { createSocialOAuthError } from '@/lib/errors/domain';
import { sanitizeString } from '@/lib/security';
import { SOCIAL_PLATFORMS, type SocialPlatform } from './types';

export type SocialOAuthFlowMode = 'pkce-oauth2' | 'oauth2';

export interface SocialOAuthProviderRule {
  providerId: SocialPlatform;
  flowMode: SocialOAuthFlowMode;
  supportsRefreshToken: boolean;
  requiresPkce: boolean;
  callbackPath: string;
  defaultScopes: string[];
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  clientAuthMethod?: 'body' | 'basic';
}

export interface SocialOAuthState {
  version: 'v1';
  providerId: SocialPlatform;
  ownerId: string;
  socialAccountId?: string;
  accountName?: string;
  handle?: string;
  providerAccountId?: string;
  scopes?: string[];
  returnTo?: string;
  codeVerifier?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256';
  createdAt: number;
  nonce: string;
}

export interface SocialOAuthHandshakeResult {
  providerId: SocialPlatform;
  state: SocialOAuthState;
  stateHash: string;
  callbackUrl: string;
  authorizationUrl: string | null;
  authUrlAvailable: boolean;
}

const SOCIAL_OAUTH_PROVIDER_RULES: SocialOAuthProviderRule[] = [
  {
    providerId: 'tiktok',
    flowMode: 'pkce-oauth2',
    supportsRefreshToken: true,
    requiresPkce: true,
    callbackPath: '/api/social/oauth/tiktok/callback',
    defaultScopes: [
      'user.info.basic',
      'user.info.profile',
      'user.info.stats',
      'video.list',
      'video.upload',
      'video.publish',
    ],
    authorizationUrl: process.env.SOCIAL_OAUTH_AUTH_URL_TIKTOK || null,
    tokenUrl: process.env.SOCIAL_OAUTH_TOKEN_URL_TIKTOK || null,
    clientId: process.env.SOCIAL_OAUTH_CLIENT_ID_TIKTOK || null,
    clientSecret: process.env.SOCIAL_OAUTH_CLIENT_SECRET_TIKTOK || null,
    clientAuthMethod: (process.env.SOCIAL_OAUTH_CLIENT_AUTH_METHOD_TIKTOK as 'body' | 'basic' | undefined) || 'body',
  },
  {
    providerId: 'instagram',
    flowMode: 'oauth2',
    supportsRefreshToken: false,
    requiresPkce: false,
    callbackPath: '/api/social/oauth/instagram/callback',
    defaultScopes: ['instagram_basic', 'instagram_content_publish'],
    authorizationUrl: process.env.SOCIAL_OAUTH_AUTH_URL_INSTAGRAM || null,
    tokenUrl: process.env.SOCIAL_OAUTH_TOKEN_URL_INSTAGRAM || null,
    clientId: process.env.SOCIAL_OAUTH_CLIENT_ID_INSTAGRAM || null,
    clientSecret: process.env.SOCIAL_OAUTH_CLIENT_SECRET_INSTAGRAM || null,
    clientAuthMethod: (process.env.SOCIAL_OAUTH_CLIENT_AUTH_METHOD_INSTAGRAM as 'body' | 'basic' | undefined) || 'body',
  },
  {
    providerId: 'facebook',
    flowMode: 'pkce-oauth2',
    supportsRefreshToken: true,
    requiresPkce: true,
    callbackPath: '/api/social/oauth/facebook/callback',
    defaultScopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    authorizationUrl: process.env.SOCIAL_OAUTH_AUTH_URL_FACEBOOK || null,
    tokenUrl: process.env.SOCIAL_OAUTH_TOKEN_URL_FACEBOOK || null,
    clientId: process.env.SOCIAL_OAUTH_CLIENT_ID_FACEBOOK || null,
    clientSecret: process.env.SOCIAL_OAUTH_CLIENT_SECRET_FACEBOOK || null,
    clientAuthMethod: (process.env.SOCIAL_OAUTH_CLIENT_AUTH_METHOD_FACEBOOK as 'body' | 'basic' | undefined) || 'body',
  },
  {
    providerId: 'linkedin',
    flowMode: 'pkce-oauth2',
    supportsRefreshToken: true,
    requiresPkce: true,
    callbackPath: '/api/social/oauth/linkedin/callback',
    defaultScopes: ['openid', 'profile', 'w_member_social'],
    authorizationUrl: process.env.SOCIAL_OAUTH_AUTH_URL_LINKEDIN || null,
    tokenUrl: process.env.SOCIAL_OAUTH_TOKEN_URL_LINKEDIN || null,
    clientId: process.env.SOCIAL_OAUTH_CLIENT_ID_LINKEDIN || null,
    clientSecret: process.env.SOCIAL_OAUTH_CLIENT_SECRET_LINKEDIN || null,
    clientAuthMethod: (process.env.SOCIAL_OAUTH_CLIENT_AUTH_METHOD_LINKEDIN as 'body' | 'basic' | undefined) || 'body',
  },
  {
    providerId: 'x',
    flowMode: 'pkce-oauth2',
    supportsRefreshToken: false,
    requiresPkce: true,
    callbackPath: '/api/social/oauth/x/callback',
    defaultScopes: ['tweet.read', 'tweet.write', 'users.read'],
    authorizationUrl: process.env.SOCIAL_OAUTH_AUTH_URL_X || null,
    tokenUrl: process.env.SOCIAL_OAUTH_TOKEN_URL_X || null,
    clientId: process.env.SOCIAL_OAUTH_CLIENT_ID_X || null,
    clientSecret: process.env.SOCIAL_OAUTH_CLIENT_SECRET_X || null,
    clientAuthMethod: (process.env.SOCIAL_OAUTH_CLIENT_AUTH_METHOD_X as 'body' | 'basic' | undefined) || 'body',
  },
  {
    providerId: 'youtube',
    flowMode: 'pkce-oauth2',
    supportsRefreshToken: true,
    requiresPkce: true,
    callbackPath: '/api/social/oauth/youtube/callback',
    defaultScopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    authorizationUrl: process.env.SOCIAL_OAUTH_AUTH_URL_YOUTUBE || null,
    tokenUrl: process.env.SOCIAL_OAUTH_TOKEN_URL_YOUTUBE || null,
    clientId: process.env.SOCIAL_OAUTH_CLIENT_ID_YOUTUBE || null,
    clientSecret: process.env.SOCIAL_OAUTH_CLIENT_SECRET_YOUTUBE || null,
    clientAuthMethod: (process.env.SOCIAL_OAUTH_CLIENT_AUTH_METHOD_YOUTUBE as 'body' | 'basic' | undefined) || 'body',
  },
];

function getStateSecret(): Buffer {
  const raw = process.env.SOCIAL_OAUTH_STATE_SECRET;
  if (!raw || !raw.trim()) {
    throw createSocialOAuthError('SOCIAL_OAUTH_CONFIG_MISSING', { message: 'Missing SOCIAL_OAUTH_STATE_SECRET' });
  }

  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const base64 = Buffer.from(trimmed, 'base64');
  if (base64.length === 32) {
    return base64;
  }

  const utf8 = Buffer.from(trimmed, 'utf8');
  if (utf8.length === 32) {
    return utf8;
  }

  throw createSocialOAuthError('SOCIAL_OAUTH_CONFIG_MISSING', { message: 'SOCIAL_OAUTH_STATE_SECRET must decode to 32 bytes' });
}

export function getSocialOAuthRule(providerId: SocialPlatform): SocialOAuthProviderRule {
  const rule = SOCIAL_OAUTH_PROVIDER_RULES.find((entry) => entry.providerId === providerId);
  if (!rule) {
    throw createSocialOAuthError('SOCIAL_PROVIDER_NOT_CONFIGURED', { message: `Unsupported social provider: ${providerId}` });
  }
  return rule;
}

export function getSocialOAuthRules(): SocialOAuthProviderRule[] {
  return SOCIAL_OAUTH_PROVIDER_RULES;
}

function normalizeScopes(scopes?: string[]): string[] {
  return Array.from(new Set((scopes || []).map((scope) => sanitizeString(scope, 120)).filter(Boolean)));
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signState(payload: string): string {
  const secret = getStateSecret();
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function buildPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function buildSocialOAuthState(input: {
  providerId: SocialPlatform;
  ownerId: string;
  socialAccountId?: string;
  accountName?: string;
  handle?: string;
  providerAccountId?: string;
  scopes?: string[];
  returnTo?: string;
  usePkce?: boolean;
}): { state: string; stateHash: string; payload: SocialOAuthState } {
  const pkce = input.usePkce ? buildPkcePair() : null;
  const payload: SocialOAuthState = {
    version: 'v1',
    providerId: input.providerId,
    ownerId: sanitizeString(input.ownerId, 160),
    socialAccountId: input.socialAccountId ? sanitizeString(input.socialAccountId, 160) : undefined,
    accountName: input.accountName ? sanitizeString(input.accountName, 120) : undefined,
    handle: input.handle ? sanitizeString(input.handle, 120) : undefined,
    providerAccountId: input.providerAccountId ? sanitizeString(input.providerAccountId, 160) : undefined,
    scopes: normalizeScopes(input.scopes),
    returnTo: input.returnTo ? sanitizeString(input.returnTo, 200) : undefined,
    codeVerifier: pkce?.codeVerifier,
    codeChallenge: pkce?.codeChallenge,
    codeChallengeMethod: pkce ? 'S256' : undefined,
    createdAt: Date.now(),
    nonce: crypto.randomBytes(12).toString('base64url'),
  };

  const body = JSON.stringify(payload);
  const stateHash = crypto.createHash('sha256').update(body).digest('hex');
  return {
    state: `${encodeBase64Url(body)}.${signState(body)}`,
    stateHash,
    payload,
  };
}

export function getSocialOAuthStateHash(state: string): string {
  const [encodedPayload] = state.split('.', 2);
  if (!encodedPayload) {
    throw new Error('Invalid OAuth state');
  }
  const body = decodeBase64Url(encodedPayload);
  return crypto.createHash('sha256').update(body).digest('hex');
}

export function verifySocialOAuthState(providerId: SocialPlatform, state: string): SocialOAuthState {
  const [encodedPayload, encodedSignature] = state.split('.', 2);
  if (!encodedPayload || !encodedSignature) {
    throw new Error('Invalid OAuth state');
  }

  const body = decodeBase64Url(encodedPayload);
  const expected = signState(body);
  const provided = Buffer.from(encodedSignature, 'base64url');
  const actual = Buffer.from(expected, 'base64url');

  if (provided.length !== actual.length || !crypto.timingSafeEqual(provided, actual)) {
    throw new Error('Invalid OAuth state signature');
  }

  const payload = JSON.parse(body) as SocialOAuthState;
  if (payload.version !== 'v1') {
    throw new Error('Unsupported OAuth state version');
  }
  if (payload.providerId !== providerId) {
    throw new Error('OAuth state provider mismatch');
  }

  const ttlSeconds = Number(process.env.SOCIAL_OAUTH_STATE_TTL_SECONDS || '900');
  const maxAgeMs = Math.max(60, Number.isFinite(ttlSeconds) ? ttlSeconds : 900) * 1000;
  if (Date.now() - payload.createdAt > maxAgeMs) {
    throw new Error('OAuth state expired');
  }

  return payload;
}

export function getOAuthReturnPath(state?: SocialOAuthState): string {
  if (!state?.returnTo) return '/social';
  const value = state.returnTo.trim();
  if (!value.startsWith('/')) return '/social';
  return value;
}

export function resolveOAuthCallbackUrl(providerId: SocialPlatform): string {
  const rule = getSocialOAuthRule(providerId);
  return rule.callbackPath;
}

export function buildOAuthAuthorizationUrl(input: {
  providerId: SocialPlatform;
  callbackUrl: string;
  state: string;
  scopes?: string[];
  codeChallenge?: string;
  prompt?: string;
}): string | null {
  const rule = getSocialOAuthRule(input.providerId);
  if (!rule.authorizationUrl) return null;

  const url = new URL(rule.authorizationUrl);
  url.searchParams.set('response_type', 'code');
  if (rule.clientId) {
    url.searchParams.set(rule.providerId === 'tiktok' ? 'client_key' : 'client_id', rule.clientId);
  }
  url.searchParams.set('state', input.state);
  url.searchParams.set('redirect_uri', input.callbackUrl);
  url.searchParams.set('scope', normalizeScopes(input.scopes || rule.defaultScopes).join(rule.providerId === 'tiktok' ? ',' : ' '));
  const codeChallenge = input.codeChallenge?.trim();
  if (codeChallenge) {
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  if (input.prompt) {
    url.searchParams.set('prompt', sanitizeString(input.prompt, 40));
  }

  return url.toString();
}
