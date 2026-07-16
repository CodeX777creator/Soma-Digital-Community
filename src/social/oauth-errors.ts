import { createSocialOAuthError } from '@/lib/errors/domain';
import type { AppError, ErrorCode } from '@/lib/errors';
import { sanitizeString } from '@/lib/security';
import { getSocialProvider } from './providers';
import type { SocialPlatform } from './types';

type SocialOAuthErrorPhase =
  | 'authorization'
  | 'callback'
  | 'configuration'
  | 'token_exchange'
  | 'token_refresh';

type ProviderOAuthErrorInput = {
  providerId: SocialPlatform;
  phase: SocialOAuthErrorPhase;
  status?: number;
  error?: unknown;
  errorDescription?: unknown;
  raw?: Record<string, unknown>;
};

function providerLabel(providerId: SocialPlatform): string {
  try {
    return getSocialProvider(providerId).label;
  } catch {
    return providerId;
  }
}

function valueToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(valueToText).join(' ');
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(valueToText).join(' ');
  }
  return '';
}

function compactProviderError(input: ProviderOAuthErrorInput): string {
  return [
    valueToText(input.error),
    valueToText(input.errorDescription),
    valueToText(input.raw?.error),
    valueToText(input.raw?.error_description),
    valueToText(input.raw?.errorMessage),
    valueToText(input.raw?.message),
    valueToText(input.raw?.description),
  ].join(' ').toLowerCase();
}

export function classifySocialOAuthProviderError(input: ProviderOAuthErrorInput): ErrorCode {
  const text = compactProviderError(input);

  if (
    text.includes('invalid_client')
    || text.includes('invalid client')
    || text.includes('client_id')
    || text.includes('client id')
    || text.includes('client_key')
    || text.includes('client key')
    || text.includes('app id')
    || text.includes('consumer key')
  ) {
    return 'SOCIAL_OAUTH_INVALID_CLIENT';
  }

  if (
    text.includes('redirect_uri')
    || text.includes('redirect uri')
    || text.includes('redirect_url')
    || text.includes('redirect url')
    || text.includes('callback')
    || text.includes('mismatch')
  ) {
    return 'SOCIAL_OAUTH_REDIRECT_MISMATCH';
  }

  if (
    text.includes('invalid_scope')
    || text.includes('invalid scope')
    || text.includes('scope')
    || text.includes('permission')
    || text.includes('permissions')
  ) {
    return 'SOCIAL_OAUTH_MISSING_SCOPES';
  }

  if (
    text.includes('app review')
    || text.includes('review required')
    || text.includes('not approved')
    || text.includes('unapproved')
    || text.includes('not authorized for')
    || text.includes('not enabled')
  ) {
    return 'SOCIAL_APP_REVIEW_NOT_APPROVED';
  }

  if (input.phase === 'configuration') {
    return 'SOCIAL_PROVIDER_NOT_CONFIGURED';
  }

  if (input.phase === 'token_exchange' || input.phase === 'token_refresh') {
    return 'SOCIAL_OAUTH_TOKEN_EXCHANGE_FAILED';
  }

  return 'SOCIAL_OAUTH_FAILED';
}

function buildProviderUserMessage(provider: string, code: ErrorCode): string {
  switch (code) {
    case 'SOCIAL_OAUTH_INVALID_CLIENT':
      return `${provider} connection needs setup. The provider app identifier is not being accepted.`;
    case 'SOCIAL_OAUTH_MISSING_SCOPES':
      return `${provider} connection needs setup. A required provider permission is missing or not approved.`;
    case 'SOCIAL_OAUTH_REDIRECT_MISMATCH':
      return `${provider} connection needs setup. The redirect URL does not match the provider app settings.`;
    case 'SOCIAL_APP_REVIEW_NOT_APPROVED':
      return `${provider} connection needs setup. One or more provider permissions still need approval.`;
    case 'SOCIAL_PROVIDER_NOT_CONFIGURED':
      return `${provider} connection is not configured yet.`;
    case 'SOCIAL_OAUTH_TOKEN_EXCHANGE_FAILED':
      return `${provider} approved the connection, but Soma could not finish the secure token exchange. Try again shortly.`;
    default:
      return `We could not connect ${provider}. Check the provider setup and try again.`;
  }
}

function safeDetails(input: ProviderOAuthErrorInput, code: ErrorCode): Record<string, unknown> {
  return {
    providerId: input.providerId,
    providerLabel: providerLabel(input.providerId),
    phase: input.phase,
    status: input.status || null,
    classifiedCode: code,
    providerError: sanitizeString(valueToText(input.error || input.raw?.error), 120) || null,
    providerErrorDescription: sanitizeString(valueToText(input.errorDescription || input.raw?.error_description || input.raw?.message), 300) || null,
  };
}

export function createSocialOAuthProviderError(input: ProviderOAuthErrorInput): AppError {
  const code = classifySocialOAuthProviderError(input);
  const label = providerLabel(input.providerId);
  return createSocialOAuthError(code, {
    status: input.status && input.status >= 400 ? input.status : 400,
    userMessage: buildProviderUserMessage(label, code),
    message: sanitizeString(compactProviderError(input) || `${input.phase} failed`, 500),
    details: safeDetails(input, code),
  });
}
