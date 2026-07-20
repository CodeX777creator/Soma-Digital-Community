import { sanitizeString } from '@/lib/security';
import type {
  SocialConnectionReadiness,
  SocialConnectionReadinessStatus,
  SocialPlatform,
} from './types';

type ProviderIdentity = {
  providerAccountId?: string;
  handle?: string;
  accountName?: string;
  warnings?: string[];
  metadata?: Record<string, unknown>;
};

type ReadinessInput = {
  providerId: SocialPlatform;
  accessToken?: string;
  refreshToken?: string;
  scopes: string[];
  providerAccountId?: string;
  handle?: string;
  accountName?: string;
};

const PROVIDER_REQUIREMENTS: Record<SocialPlatform, {
  publishScopes: string[];
  analyticsScopes: string[];
  requiresProviderAccountId: boolean;
  refreshRecommended: boolean;
}> = {
  tiktok: {
    publishScopes: ['video.publish'],
    analyticsScopes: ['user.info.stats', 'video.list'],
    requiresProviderAccountId: true,
    refreshRecommended: true,
  },
  instagram: {
    publishScopes: ['instagram_business_content_publish'],
    analyticsScopes: ['instagram_business_basic', 'instagram_business_manage_insights'],
    requiresProviderAccountId: true,
    refreshRecommended: true,
  },
  facebook: {
    publishScopes: ['pages_show_list', 'pages_manage_posts'],
    analyticsScopes: ['pages_read_engagement'],
    requiresProviderAccountId: true,
    refreshRecommended: true,
  },
  linkedin: {
    publishScopes: ['w_member_social'],
    analyticsScopes: [],
    requiresProviderAccountId: false,
    refreshRecommended: false,
  },
  x: {
    publishScopes: ['tweet.write', 'offline.access'],
    analyticsScopes: ['tweet.read', 'users.read'],
    requiresProviderAccountId: true,
    refreshRecommended: true,
  },
  youtube: {
    publishScopes: ['https://www.googleapis.com/auth/youtube.upload'],
    analyticsScopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    requiresProviderAccountId: true,
    refreshRecommended: true,
  },
};

function normalizeScopes(scopes: string[]): Set<string> {
  return new Set(scopes.map((scope) => sanitizeString(scope, 180)).filter(Boolean));
}

function missingScopes(scopes: Set<string>, required: string[]): string[] {
  return required.filter((scope) => !scopes.has(scope));
}

function cleanText(value: unknown, maxLength = 160): string | undefined {
  return typeof value === 'string' ? sanitizeString(value, maxLength).trim() || undefined : undefined;
}

async function fetchJson(url: string, accessToken: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!response.ok) {
      const message = cleanText(payload.error_description, 300)
        || cleanText(payload.error, 300)
        || `Provider returned HTTP ${response.status}`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function pickFirstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) && value[0] && typeof value[0] === 'object'
    ? value[0] as Record<string, unknown>
    : undefined;
}

async function resolveTikTokIdentity(accessToken: string): Promise<ProviderIdentity> {
  const payload = await fetchJson(
    'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count',
    accessToken
  );
  const user = ((payload.data as Record<string, unknown> | undefined)?.user || {}) as Record<string, unknown>;
  return {
    providerAccountId: cleanText(user.open_id),
    handle: cleanText(user.display_name),
    accountName: cleanText(user.display_name),
    metadata: { providerIdentity: user },
  };
}

async function resolveFacebookIdentity(accessToken: string): Promise<ProviderIdentity> {
  const payload = await fetchJson(
    'https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,perms',
    accessToken
  );
  const page = pickFirstRecord(payload.data);
  if (!page) {
    return { warnings: ['No Facebook Page was returned. Select or authorize a Page before publishing.'] };
  }
  return {
    providerAccountId: cleanText(page.id),
    accountName: cleanText(page.name),
    handle: cleanText(page.name),
    warnings: Array.isArray(payload.data) && payload.data.length > 1
      ? ['Multiple Facebook Pages are available. The first Page was selected until page selection is added.']
      : [],
    metadata: {
      providerIdentity: {
        id: cleanText(page.id),
        name: cleanText(page.name),
        pageCount: Array.isArray(payload.data) ? payload.data.length : 1,
      },
    },
  };
}

async function resolveInstagramIdentity(accessToken: string): Promise<ProviderIdentity> {
  const payload = await fetchJson(
    'https://graph.instagram.com/v23.0/me?fields=id,user_id,username,name,profile_picture_url',
    accessToken
  );
  const accountId = cleanText(payload.user_id) || cleanText(payload.id);
  if (!accountId) {
    return { warnings: ['No Instagram professional account was returned. Connect an Instagram Business or Creator account.'] };
  }
  return {
    providerAccountId: accountId,
    accountName: cleanText(payload.name) || cleanText(payload.username),
    handle: cleanText(payload.username) ? `@${cleanText(payload.username)}` : undefined,
    metadata: {
      providerIdentity: {
        id: accountId,
        username: cleanText(payload.username),
        profilePictureUrl: cleanText(payload.profile_picture_url),
        loginType: 'instagram_business_login',
      },
    },
  };
}

async function resolveLinkedInIdentity(accessToken: string): Promise<ProviderIdentity> {
  const payload = await fetchJson('https://api.linkedin.com/v2/userinfo', accessToken);
  return {
    providerAccountId: cleanText(payload.sub),
    accountName: cleanText(payload.name) || cleanText(payload.localizedFirstName),
    handle: cleanText(payload.name),
    metadata: { providerIdentity: payload },
  };
}

async function resolveXIdentity(accessToken: string): Promise<ProviderIdentity> {
  const payload = await fetchJson(
    'https://api.twitter.com/2/users/me?user.fields=username,name,public_metrics,verified,profile_image_url',
    accessToken
  );
  const user = (payload.data || {}) as Record<string, unknown>;
  const username = cleanText(user.username);
  return {
    providerAccountId: cleanText(user.id),
    accountName: cleanText(user.name) || username,
    handle: username ? `@${username}` : undefined,
    metadata: { providerIdentity: user },
  };
}

async function resolveYouTubeIdentity(accessToken: string): Promise<ProviderIdentity> {
  const payload = await fetchJson(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
    accessToken
  );
  const channel = pickFirstRecord(payload.items);
  const snippet = (channel?.snippet || {}) as Record<string, unknown>;
  if (!channel) {
    return { warnings: ['No YouTube channel was returned for this Google account.'] };
  }
  return {
    providerAccountId: cleanText(channel.id),
    accountName: cleanText(snippet.title),
    handle: cleanText(snippet.customUrl) || cleanText(snippet.title),
    metadata: { providerIdentity: channel },
  };
}

async function resolveProviderIdentity(input: ReadinessInput): Promise<ProviderIdentity> {
  if (!input.accessToken) return {};
  switch (input.providerId) {
    case 'tiktok':
      return resolveTikTokIdentity(input.accessToken);
    case 'facebook':
      return resolveFacebookIdentity(input.accessToken);
    case 'instagram':
      return resolveInstagramIdentity(input.accessToken);
    case 'linkedin':
      return resolveLinkedInIdentity(input.accessToken);
    case 'x':
      return resolveXIdentity(input.accessToken);
    case 'youtube':
      return resolveYouTubeIdentity(input.accessToken);
    default:
      return {};
  }
}

function resolveStatus(input: {
  accessTokenPresent: boolean;
  identitySynced: boolean;
  publishReady: boolean;
  analyticsReady: boolean;
  permissionsVerified: boolean;
}): SocialConnectionReadinessStatus {
  if (!input.accessTokenPresent) return 'needs_reauth';
  if (input.publishReady && input.analyticsReady) return 'analytics_ready';
  if (input.publishReady) return 'publish_ready';
  if (!input.permissionsVerified) return 'permission_missing';
  if (input.identitySynced) return 'identity_synced';
  return 'connected';
}

export async function syncSocialConnectionReadiness(input: ReadinessInput): Promise<{
  readiness: SocialConnectionReadiness;
  providerAccountId?: string;
  handle?: string;
  accountName?: string;
  metadata: Record<string, unknown>;
}> {
  const scopes = normalizeScopes(input.scopes);
  const requirements = PROVIDER_REQUIREMENTS[input.providerId];
  const warnings: string[] = [];
  let identity: ProviderIdentity = {};

  try {
    identity = await resolveProviderIdentity(input);
  } catch (error) {
    warnings.push(`Identity sync failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const providerAccountId = identity.providerAccountId || input.providerAccountId;
  const handle = identity.handle || input.handle;
  const accountName = identity.accountName || input.accountName;
  const missingPublishScopes = missingScopes(scopes, requirements.publishScopes);
  const missingAnalyticsScopes = missingScopes(scopes, requirements.analyticsScopes);
  const missing = Array.from(new Set([...missingPublishScopes, ...missingAnalyticsScopes]));

  if (requirements.requiresProviderAccountId && !providerAccountId) {
    warnings.push('Provider account identity is not resolved yet.');
  }
  if (requirements.refreshRecommended && !input.refreshToken) {
    warnings.push('Refresh token is missing. Scheduled publishing may require reconnecting before token expiry.');
  }
  warnings.push(...(identity.warnings || []));

  const identitySynced = Boolean(providerAccountId || identity.metadata?.providerIdentity);
  const publishReady = input.accessToken
    ? missingPublishScopes.length === 0 && (!requirements.requiresProviderAccountId || Boolean(providerAccountId))
    : false;
  const analyticsReady = input.accessToken
    ? missingAnalyticsScopes.length === 0 && (!requirements.requiresProviderAccountId || Boolean(providerAccountId))
    : false;
  const permissionsVerified = missing.length === 0;
  const status = resolveStatus({
    accessTokenPresent: Boolean(input.accessToken),
    identitySynced,
    publishReady,
    analyticsReady,
    permissionsVerified,
  });

  const readiness: SocialConnectionReadiness = {
    status,
    identitySynced,
    permissionsVerified,
    publishReady,
    analyticsReady,
    missingScopes: missing,
    warnings: Array.from(new Set(warnings.map((warning) => sanitizeString(warning, 300)).filter(Boolean))),
    checkedAt: new Date().toISOString(),
    summary: publishReady
      ? 'Ready for scheduled publishing.'
      : missing.length > 0
        ? `Missing permission: ${missing[0]}`
        : warnings[0] || 'Connected, but readiness needs review.',
    providerAccountId,
    handle,
    accountName,
  };

  return {
    readiness,
    providerAccountId,
    handle,
    accountName,
    metadata: {
      readiness,
      ...(identity.metadata || {}),
    },
  };
}
