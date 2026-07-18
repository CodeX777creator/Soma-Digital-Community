import * as admin from 'firebase-admin';
import crypto from 'crypto';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineBoolean, defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { sendNotificationWithPush } from './push-notifications';
import { mapPlatformSettingsToProvider, normalizePlatformSettings } from './social-platform-settings';

const db = admin.firestore();

const socialCredentialsMasterKey = defineSecret('SOCIAL_CREDENTIALS_MASTER_KEY');
const socialPublishEndpoint = defineString('SOCIAL_PUBLISH_ENDPOINT', { default: '' });
const socialPublishEndpointTikTok = defineString('SOCIAL_PUBLISH_ENDPOINT_TIKTOK', { default: '' });
const socialPublishEndpointInstagram = defineString('SOCIAL_PUBLISH_ENDPOINT_INSTAGRAM', { default: '' });
const socialPublishEndpointFacebook = defineString('SOCIAL_PUBLISH_ENDPOINT_FACEBOOK', { default: '' });
const socialPublishEndpointLinkedIn = defineString('SOCIAL_PUBLISH_ENDPOINT_LINKEDIN', { default: '' });
const socialPublishEndpointX = defineString('SOCIAL_PUBLISH_ENDPOINT_X', { default: '' });
const socialPublishEndpointYouTube = defineString('SOCIAL_PUBLISH_ENDPOINT_YOUTUBE', { default: '' });
const socialNativePublishingEnabled = defineBoolean('SOCIAL_NATIVE_PUBLISHING_ENABLED', { default: false });
const socialMetaGraphBaseUrl = defineString('SOCIAL_META_GRAPH_BASE_URL', { default: 'https://graph.facebook.com/v20.0' });
const socialTikTokApiBaseUrl = defineString('SOCIAL_TIKTOK_API_BASE_URL', { default: 'https://open.tiktokapis.com' });
const socialLinkedInApiBaseUrl = defineString('SOCIAL_LINKEDIN_API_BASE_URL', { default: 'https://api.linkedin.com/v2' });
const socialXApiBaseUrl = defineString('SOCIAL_X_API_BASE_URL', { default: 'https://api.twitter.com/2' });
const socialYouTubeApiBaseUrl = defineString('SOCIAL_YOUTUBE_API_BASE_URL', { default: 'https://www.googleapis.com/youtube/v3' });
const socialYouTubeUploadBaseUrl = defineString('SOCIAL_YOUTUBE_UPLOAD_BASE_URL', { default: 'https://www.googleapis.com/upload/youtube/v3' });
const socialPublishBatchSize = defineInt('SOCIAL_PUBLISH_BATCH_SIZE', { default: 20 });
const socialPublishMaxAttempts = defineInt('SOCIAL_PUBLISH_MAX_ATTEMPTS', { default: 5 });
const socialPublishRetryDelayMinutes = defineInt('SOCIAL_PUBLISH_RETRY_DELAY_MINUTES', { default: 15 });
const socialPublishLeaseMinutes = defineInt('SOCIAL_PUBLISH_LEASE_MINUTES', { default: 10 });
const socialPublishUserDailyLimit = defineInt('SOCIAL_PUBLISH_USER_DAILY_LIMIT', { default: 50 });
const socialPublishProviderRateLimitPerMinute = defineInt('SOCIAL_PUBLISH_PROVIDER_RATE_LIMIT_PER_MINUTE', { default: 30 });
const socialPublishDuplicateWindowHours = defineInt('SOCIAL_PUBLISH_DUPLICATE_WINDOW_HOURS', { default: 24 });
const socialTokenExpiryAlertWindowDays = defineInt('SOCIAL_TOKEN_EXPIRY_ALERT_WINDOW_DAYS', { default: 7 });

type SocialPlatform = 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'youtube';
type ScheduledPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'editing' | 'cancelled';
type SocialPublishAttemptStatus = 'processing' | 'pending_confirmation' | 'success' | 'failed' | 'skipped';
type ScheduledPostContentType = 'text' | 'image' | 'carousel' | 'video' | 'document';
type MediaItemType = 'image' | 'video' | 'document' | 'audio' | 'unknown';

interface EncryptedPayload {
  algorithm: 'aes-256-gcm';
  keyVersion: 'v1';
  iv: string;
  tag: string;
  ciphertext: string;
}

interface SocialAccountDoc {
  socialAccountId: string;
  ownerId: string;
  providerId: SocialPlatform;
  providerLabel: string;
  accountName: string;
  handle?: string;
  providerAccountId?: string;
  status: string;
  hasCredentials: boolean;
  credentialEnvelope?: EncryptedPayload | null;
  metadata?: Record<string, unknown>;
  timezone?: string;
  scopes?: string[];
  connectionReadiness?: Record<string, unknown>;
  expiresAt?: admin.firestore.Timestamp | null;
  lastSyncedAt?: admin.firestore.Timestamp | null;
  lastError?: string | null;
}

interface ScheduledPostDoc {
  scheduledPostId: string;
  ownerId: string;
  platform: SocialPlatform;
  socialAccountId?: string;
  connectedAccountId?: string;
  publicationGroupId?: string;
  contentType?: ScheduledPostContentType;
  status: ScheduledPostStatus;
  scheduledTime: admin.firestore.Timestamp;
  title?: string;
  caption: string;
  hashtags?: string[];
  cta?: string;
  assetIds: string[];
  campaignId?: string;
  notes?: string;
  timezone?: string;
  platformSettings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  attemptCount?: number;
  lastAttemptAt?: admin.firestore.Timestamp | null;
  nextRetryAt?: admin.firestore.Timestamp | null;
  publishLeaseId?: string | null;
  publishLeaseExpiresAt?: admin.firestore.Timestamp | null;
  publishedBy?: string | null;
  publishedAt?: admin.firestore.Timestamp | null;
  failedAt?: admin.firestore.Timestamp | null;
  lastError?: string | null;
  externalPostId?: string | null;
  providerPostId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  publishProviderResponse?: string | null;
}

interface PublishAttemptDoc {
  publishAttemptId: string;
  scheduledPostId: string;
  ownerId: string;
  platform: SocialPlatform;
  socialAccountId?: string;
  publicationGroupId?: string;
  provider?: string;
  contentType?: ScheduledPostContentType;
  attemptNumber: number;
  status: SocialPublishAttemptStatus;
  triggeredAt: admin.firestore.Timestamp;
  startedAt?: admin.firestore.Timestamp | null;
  finishedAt?: admin.firestore.Timestamp | null;
  durationMs?: number | null;
  externalPostId?: string | null;
  providerPostId?: string | null;
  failureCode?: string | null;
  errorMessage?: string | null;
  providerResponse?: string | null;
  retryable?: boolean;
  payloadVersion?: string;
  metadata?: Record<string, unknown>;
}

interface GeneratedAssetDoc {
  ownerId?: string;
  userId?: string;
  title?: string;
  type?: string;
  contentType?: string;
  mimeType?: string;
  status?: string;
  downloadUrl?: string;
  thumbnail?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
}

interface DecryptedCredentials {
  accessToken?: string;
  refreshToken?: string;
  externalAccountId?: string;
  tokenType?: string;
}

interface PublishOutcome {
  success: boolean;
  externalPostId?: string;
  providerResponse?: string;
  errorMessage?: string;
  retryable?: boolean;
  failureCode?: string;
  deliveryMode?: 'native' | 'external_endpoint';
  confirmationRequired?: boolean;
  providerPublishStatus?: 'submitted' | 'processing' | 'published' | 'failed';
}

interface PublishGuardOutcome {
  ok: boolean;
  reason?: string;
  retryable?: boolean;
  failureCode?: string;
}

interface NativeStatusOutcome {
  state: 'pending' | 'published' | 'failed' | 'unknown';
  externalPostId?: string;
  providerResponse?: string;
  errorMessage?: string;
  failureCode?: string;
  retryable?: boolean;
}

interface NativePublishPayload {
  payloadVersion: 'social-publish-v1';
  scheduledPostId: string;
  ownerId: string;
  publicationGroupId?: string;
  platform: SocialPlatform;
  connectedAccountId?: string;
  destination: {
    socialAccountId: string;
    providerAccountId?: string;
    accountName: string;
    handle?: string;
    status: string;
  };
  title?: string;
  caption: string;
  campaignId?: string;
  notes?: string;
  content: {
    contentType: ScheduledPostContentType;
    caption: string;
    hashtags: string[];
    cta?: string;
    finalText: string;
    mediaItems: Array<{
      assetId: string;
      order: number;
      type: MediaItemType;
      mimeType?: string;
      downloadUrl?: string;
      thumbnail?: string;
      storagePath?: string;
    }>;
  };
  scheduling: {
    scheduledTime: string;
    timezone?: string;
    status: ScheduledPostStatus;
  };
  platformSettings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  credentials?: {
    externalAccountId?: string;
  };
}

interface NativePublisherContext {
  post: ScheduledPostDoc;
  account: SocialAccountDoc;
  credentials: DecryptedCredentials | null;
  payload: NativePublishPayload;
}

interface NativePublisher {
  providerId: SocialPlatform;
  canPublish(context: NativePublisherContext): { ok: boolean; reason?: string; retryable?: boolean; failureCode?: string };
  publish(context: NativePublisherContext): Promise<PublishOutcome>;
  checkStatus?(context: NativePublisherContext): Promise<NativeStatusOutcome>;
}

function decodeMasterKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const fromBase64 = Buffer.from(trimmed, 'base64');
  if (fromBase64.length === 32) {
    return fromBase64;
  }

  const fromUtf8 = Buffer.from(trimmed, 'utf8');
  if (fromUtf8.length === 32) {
    return fromUtf8;
  }

  throw new Error('SOCIAL_CREDENTIALS_MASTER_KEY must decode to 32 bytes');
}

function getMasterKey(): Buffer {
  const rawKey = socialCredentialsMasterKey.value();
  if (!rawKey || !rawKey.trim()) {
    throw new Error('Missing SOCIAL_CREDENTIALS_MASTER_KEY secret');
  }

  return decodeMasterKey(rawKey);
}

function decryptCredentials(envelope?: EncryptedPayload | null): DecryptedCredentials | null {
  if (!envelope) return null;

  const decipher = crypto.createDecipheriv(
    envelope.algorithm,
    getMasterKey(),
    Buffer.from(envelope.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);

  const parsed = JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>;
  return {
    accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : undefined,
    refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
    externalAccountId: typeof parsed.externalAccountId === 'string' ? parsed.externalAccountId : undefined,
    tokenType: typeof parsed.tokenType === 'string' ? parsed.tokenType : undefined,
  };
}

async function readCredentialEnvelope(account: SocialAccountDoc): Promise<EncryptedPayload | null> {
  const accountId = account.socialAccountId;
  if (accountId) {
    const secretSnapshot = await db.collection('socialAccountSecrets').doc(accountId).get();
    if (secretSnapshot.exists) {
      const secret = secretSnapshot.data() as { credentialEnvelope?: EncryptedPayload | null; ownerId?: string };
      if (secret.ownerId && secret.ownerId !== account.ownerId) {
        throw new Error('Social account secret owner mismatch.');
      }
      if (secret.credentialEnvelope) {
        return secret.credentialEnvelope;
      }
    }
  }

  return account.credentialEnvelope || null;
}

async function readCredentials(account: SocialAccountDoc): Promise<DecryptedCredentials | null> {
  return decryptCredentials(await readCredentialEnvelope(account));
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  return null;
}

function parseIso(value?: string | null): admin.firestore.Timestamp | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(parsed);
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.slice(0, maxLength).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return trimmed.trim() || undefined;
}

function sanitizeStringArray(value: unknown, maxItems = 40): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  value.forEach((item) => {
    const sanitized = sanitizeText(item, 80);
    if (!sanitized) return;
    const normalized = sanitized.replace(/^#/, '');
    if (!normalized || seen.has(normalized.toLowerCase())) return;
    seen.add(normalized.toLowerCase());
    items.push(normalized);
  });
  return items.slice(0, maxItems);
}

function buildFinalText(post: ScheduledPostDoc): string {
  const hashtags = sanitizeStringArray(post.hashtags);
  return [
    post.caption || '',
    hashtags.length > 0 ? hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' ') : '',
    post.cta || '',
  ].filter(Boolean).join('\n\n').trim();
}

function getDefaultContentType(platform: SocialPlatform): ScheduledPostContentType {
  switch (platform) {
    case 'tiktok':
    case 'youtube':
      return 'video';
    case 'instagram':
      return 'image';
    default:
      return 'text';
  }
}

function requiresMedia(platform: SocialPlatform, contentType: ScheduledPostContentType): boolean {
  if (platform === 'tiktok' || platform === 'youtube' || platform === 'instagram') return true;
  return contentType !== 'text';
}

function hasCompatibleMedia(payload: NativePublishPayload): boolean {
  const items = payload.content.mediaItems || [];
  switch (payload.platform) {
    case 'tiktok':
    case 'youtube':
      return items.some((item) => item.type === 'video' && Boolean(item.downloadUrl || item.storagePath));
    case 'instagram':
      return items.some((item) => ['image', 'video'].includes(item.type) && Boolean(item.downloadUrl || item.storagePath));
    case 'linkedin':
      return payload.content.contentType === 'document'
        ? items.some((item) => item.type === 'document' && Boolean(item.downloadUrl || item.storagePath))
        : items.every((item) => item.type !== 'audio');
    default:
      return items.every((item) => item.type !== 'audio');
  }
}

function baseNativeValidation(context: NativePublisherContext): { ok: boolean; reason?: string; retryable?: boolean; failureCode?: string } {
  if (!context.credentials?.accessToken) {
    return {
      ok: false,
      reason: 'Connected account has no usable access token.',
      retryable: false,
      failureCode: 'PROVIDER_REAUTH_REQUIRED',
    };
  }

  if (!context.account.providerAccountId) {
    return {
      ok: false,
      reason: 'No provider destination is selected for this account.',
      retryable: false,
      failureCode: 'PROVIDER_DESTINATION_REQUIRED',
    };
  }

  if (requiresMedia(context.post.platform, context.payload.content.contentType) && !hasCompatibleMedia(context.payload)) {
    return {
      ok: false,
      reason: `${context.post.platform} requires compatible media before publishing.`,
      retryable: false,
      failureCode: 'PROVIDER_MEDIA_REQUIRED',
    };
  }

  return { ok: true };
}

function contentTypeHeader(headers: Headers): string {
  return headers.get('content-type') || '';
}

function hasScope(account: SocialAccountDoc, scope: string): boolean {
  return (account.scopes || []).includes(scope);
}

function sanitizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeStringSetting(value: unknown, maxLength = 300): string | undefined {
  return typeof value === 'string' ? value.slice(0, maxLength).trim() || undefined : undefined;
}

function sanitizeStringListSetting(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.slice(0, 80).trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

async function fetchMediaBytes(url: string): Promise<{ bytes: Buffer; contentType: string; contentLength: number }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch media asset (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  return {
    bytes,
    contentType,
    contentLength: bytes.length,
  };
}

async function putBinaryToProvider(input: {
  url: string;
  bytes: Buffer;
  contentType: string;
  headers?: Record<string, string>;
}): Promise<PublishOutcome> {
  const response = await fetch(input.url, {
    method: 'PUT',
    headers: {
      'Content-Type': input.contentType,
      'Content-Length': String(input.bytes.length),
      ...(input.headers || {}),
    },
    body: input.bytes,
  });
  const responseText = await response.text().catch(() => '');
  if (!response.ok) {
    return {
      success: false,
      errorMessage: `Provider upload returned HTTP ${response.status}`,
      failureCode: response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_MEDIA_UPLOAD_FAILED',
      providerResponse: responseText.slice(0, 2000),
      retryable: response.status >= 500 || response.status === 429,
      deliveryMode: 'native',
    };
  }
  return {
    success: true,
    providerResponse: responseText.slice(0, 2000),
    deliveryMode: 'native',
  };
}

async function postJsonToProvider(input: {
  url: string;
  accessToken: string;
  body: Record<string, unknown>;
  headers?: Record<string, string>;
}): Promise<PublishOutcome> {
  const response = await fetch(input.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(input.headers || {}),
    },
    body: JSON.stringify(input.body),
  });

  const responseText = await response.text().catch(() => '');
  const providerResponse = responseText.slice(0, 2000);
  let parsed: Record<string, unknown> = {};
  try {
    if (responseText && contentTypeHeader(response.headers).includes('application/json')) {
      parsed = JSON.parse(responseText) as Record<string, unknown>;
    }
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const errorMessage = typeof parsed.error === 'object' && parsed.error
      ? JSON.stringify(parsed.error).slice(0, 500)
      : typeof parsed.error === 'string'
        ? parsed.error
        : `Provider returned HTTP ${response.status}`;
    return {
      success: false,
      errorMessage,
      failureCode: response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_NATIVE_REJECTED',
      providerResponse,
      retryable: response.status >= 500 || response.status === 429,
      deliveryMode: 'native',
    };
  }

  const externalPostId = typeof parsed.id === 'string'
    ? parsed.id
    : typeof parsed.post_id === 'string'
      ? parsed.post_id
      : typeof parsed.video_id === 'string'
        ? parsed.video_id
        : undefined;

  return {
    success: true,
    externalPostId,
    providerResponse,
    deliveryMode: 'native',
  };
}

async function getJsonFromProvider(input: {
  url: string;
  accessToken: string;
  params?: Record<string, string>;
}): Promise<{ ok: boolean; data: Record<string, unknown>; providerResponse: string; errorMessage?: string; retryable?: boolean; failureCode?: string }> {
  const url = new URL(input.url);
  Object.entries(input.params || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: 'application/json',
    },
  });
  const responseText = await response.text().catch(() => '');
  const providerResponse = responseText.slice(0, 2000);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    const errorMessage = typeof parsed.error === 'object' && parsed.error
      ? JSON.stringify(parsed.error).slice(0, 500)
      : `Provider returned HTTP ${response.status}`;
    return {
      ok: false,
      data: parsed,
      providerResponse,
      errorMessage,
      failureCode: response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_NATIVE_REJECTED',
      retryable: response.status >= 500 || response.status === 429,
    };
  }
  return { ok: true, data: parsed, providerResponse };
}

async function resolveMetaPageAccessToken(context: NativePublisherContext): Promise<string> {
  const userToken = context.credentials?.accessToken || '';
  const pageId = context.account.providerAccountId || '';
  if (!userToken || !pageId) return userToken;

  const baseUrl = socialMetaGraphBaseUrl.value().replace(/\/$/, '');
  const response = await getJsonFromProvider({
    url: `${baseUrl}/me/accounts`,
    accessToken: userToken,
    params: { fields: 'id,name,access_token' },
  });
  if (!response.ok) return userToken;

  const pages = Array.isArray(response.data.data) ? response.data.data as Record<string, unknown>[] : [];
  const page = pages.find((entry) => entry.id === pageId);
  return typeof page?.access_token === 'string' && page.access_token ? page.access_token : userToken;
}

function buildFinalSocialText(caption: string, hashtags: string[], cta?: string): string {
  const parts = [caption.trim()];
  if (cta?.trim()) {
    parts.push(cta.trim());
  }
  if (hashtags.length > 0) {
    parts.push(hashtags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' '));
  }
  return parts.filter(Boolean).join('\n\n');
}

function isCalendarEvent(post: Pick<ScheduledPostDoc, 'metadata'>): boolean {
  return post.metadata?.calendarMode === 'events';
}

class UnsupportedNativePublisher implements NativePublisher {
  constructor(public providerId: SocialPlatform, private reason: string) {}

  canPublish(): { ok: boolean; reason?: string; retryable?: boolean; failureCode?: string } {
    return {
      ok: false,
      reason: this.reason,
      retryable: false,
      failureCode: 'PROVIDER_NATIVE_UNSUPPORTED',
    };
  }

  async publish(): Promise<PublishOutcome> {
    return {
      success: false,
      errorMessage: this.reason,
      retryable: false,
      failureCode: 'PROVIDER_NATIVE_UNSUPPORTED',
      deliveryMode: 'native',
    };
  }
}

class TikTokNativePublisher implements NativePublisher {
  providerId: SocialPlatform = 'tiktok';

  canPublish(context: NativePublisherContext) {
    const base = baseNativeValidation(context);
    if (!base.ok) return base;
    const hasVideo = context.payload.content.mediaItems.some((item) => item.type === 'video' && Boolean(item.downloadUrl));
    if (!hasVideo) {
      return {
        ok: false,
        reason: 'TikTok native publishing requires a video asset with a public HTTPS URL.',
        retryable: false,
        failureCode: 'TIKTOK_VIDEO_URL_REQUIRED',
      };
    }

    const mode = this.resolveMode(context);
    if (mode === 'direct' && !hasScope(context.account, 'video.publish')) {
      return {
        ok: false,
        reason: 'TikTok Direct Post requires the video.publish scope.',
        retryable: false,
        failureCode: 'TIKTOK_DIRECT_POST_SCOPE_MISSING',
      };
    }
    if (mode === 'draft' && !hasScope(context.account, 'video.upload')) {
      return {
        ok: false,
        reason: 'TikTok draft upload requires the video.upload scope.',
        retryable: false,
        failureCode: 'TIKTOK_UPLOAD_SCOPE_MISSING',
      };
    }

    return { ok: true };
  }

  async publish(context: NativePublisherContext): Promise<PublishOutcome> {
    const mode = this.resolveMode(context);
    const video = context.payload.content.mediaItems.find((item) => item.type === 'video' && item.downloadUrl);
    if (!video?.downloadUrl) {
      return {
        success: false,
        errorMessage: 'TikTok native publishing requires a video URL.',
        retryable: false,
        failureCode: 'TIKTOK_VIDEO_URL_REQUIRED',
        deliveryMode: 'native',
      };
    }

    const baseUrl = socialTikTokApiBaseUrl.value().replace(/\/$/, '');
    const postInfo = await this.buildPostInfo(context);
    const endpoint = mode === 'draft'
      ? `${baseUrl}/v2/post/publish/inbox/video/init/`
      : `${baseUrl}/v2/post/publish/video/init/`;
    const body = {
      post_info: postInfo,
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: video.downloadUrl,
      },
    };

    const response = await this.postTikTok(endpoint, context.credentials?.accessToken || '', body);
    if (!response.success) {
      return response;
    }

    return {
      ...response,
      confirmationRequired: true,
      providerPublishStatus: 'submitted',
      providerResponse: JSON.stringify({
        deliveryMode: 'native',
        provider: 'tiktok',
        mode,
        status: 'SUBMITTED',
        publishId: response.externalPostId,
        note: 'TikTok accepted the publish request. Status polling should reconcile the final provider status.',
        raw: response.providerResponse ? JSON.parse(response.providerResponse) : null,
      }).slice(0, 2000),
    };
  }

  async checkStatus(context: NativePublisherContext): Promise<NativeStatusOutcome> {
    const publishId = context.post.providerPostId || context.post.externalPostId;
    if (!publishId) {
      return {
        state: 'unknown',
        errorMessage: 'TikTok publish status cannot be checked without a publish_id.',
        failureCode: 'TIKTOK_PUBLISH_ID_MISSING',
        retryable: false,
      };
    }

    const baseUrl = socialTikTokApiBaseUrl.value().replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v2/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.credentials?.accessToken || ''}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const text = await response.text().catch(() => '');
    const providerResponse = text.slice(0, 2000);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      return {
        state: 'unknown',
        errorMessage: `TikTok status check returned HTTP ${response.status}`,
        failureCode: response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'TIKTOK_STATUS_CHECK_FAILED',
        providerResponse,
        retryable: response.status >= 500 || response.status === 429,
      };
    }

    const error = parsed.error as Record<string, unknown> | undefined;
    if (error && typeof error.code === 'string' && error.code !== 'ok') {
      return {
        state: error.code === 'rate_limit_exceeded' ? 'unknown' : 'failed',
        errorMessage: typeof error.message === 'string' ? error.message : error.code,
        failureCode: error.code === 'rate_limit_exceeded' ? 'PROVIDER_RATE_LIMITED' : 'TIKTOK_STATUS_REJECTED',
        providerResponse,
        retryable: error.code === 'rate_limit_exceeded',
      };
    }

    const data = (parsed.data || {}) as Record<string, unknown>;
    const status = typeof data.status === 'string' ? data.status : '';
    const failureReason = typeof data.fail_reason === 'string' ? data.fail_reason : undefined;
    if (['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX'].includes(status)) {
      return { state: 'published', externalPostId: publishId, providerResponse };
    }
    if (['FAILED', 'PUBLISH_FAILED', 'REJECTED'].includes(status) || failureReason) {
      return {
        state: 'failed',
        externalPostId: publishId,
        errorMessage: failureReason || `TikTok publish status is ${status || 'failed'}.`,
        failureCode: 'TIKTOK_PUBLISH_FAILED',
        providerResponse,
        retryable: false,
      };
    }
    return { state: 'pending', externalPostId: publishId, providerResponse, retryable: true };
  }

  private resolveMode(context: NativePublisherContext): 'direct' | 'draft' {
    const settings = normalizePlatformSettings('tiktok', context.payload.platformSettings || {});
    const requested = settings.tiktokPublishMode;
    if (requested === 'draft' || requested === 'inbox' || requested === 'upload') return 'draft';
    if (requested === 'direct') return 'direct';
    return hasScope(context.account, 'video.publish') ? 'direct' : 'draft';
  }

  private async buildPostInfo(context: NativePublisherContext): Promise<Record<string, unknown>> {
    const settings = mapPlatformSettingsToProvider('tiktok', context.payload.platformSettings || {});
    const creatorInfo = await this.fetchCreatorInfo(context.credentials?.accessToken || '').catch((error) => ({
      privacyLevelOptions: [] as string[],
      warning: error instanceof Error ? error.message : String(error),
    }));
    const privacyOptions = creatorInfo.privacyLevelOptions;
    const requestedPrivacy = typeof settings.privacy_level === 'string' ? settings.privacy_level : undefined;
    const privacyLevel = requestedPrivacy && privacyOptions.includes(requestedPrivacy)
      ? requestedPrivacy
      : privacyOptions.includes('SELF_ONLY')
        ? 'SELF_ONLY'
        : privacyOptions[0] || 'SELF_ONLY';

    const postInfo: Record<string, unknown> = {
      title: context.payload.content.finalText.slice(0, 2200),
      privacy_level: privacyLevel,
      disable_duet: sanitizeBoolean(settings.disable_duet, false),
      disable_comment: sanitizeBoolean(settings.disable_comment, false),
      disable_stitch: sanitizeBoolean(settings.disable_stitch, false),
    };

    const coverTimestamp = sanitizeNumber(settings.video_cover_timestamp_ms);
    if (coverTimestamp !== undefined) {
      postInfo.video_cover_timestamp_ms = coverTimestamp;
    }

    if (typeof settings.is_aigc === 'boolean') {
      postInfo.is_aigc = settings.is_aigc;
    }
    if (typeof settings.brand_content_toggle === 'boolean') {
      postInfo.brand_content_toggle = settings.brand_content_toggle;
    }
    if (typeof settings.brand_organic_toggle === 'boolean') {
      postInfo.brand_organic_toggle = settings.brand_organic_toggle;
    }

    return postInfo;
  }

  private async fetchCreatorInfo(accessToken: string): Promise<{ privacyLevelOptions: string[] }> {
    const baseUrl = socialTikTokApiBaseUrl.value().replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/v2/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({}),
    });
    const text = await response.text().catch(() => '');
    const parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!response.ok) {
      throw new Error(`TikTok creator info returned HTTP ${response.status}`);
    }
    const error = parsed.error as Record<string, unknown> | undefined;
    if (error && typeof error.code === 'string' && error.code !== 'ok') {
      throw new Error(typeof error.message === 'string' ? error.message : error.code);
    }
    const data = (parsed.data || {}) as Record<string, unknown>;
    const options = Array.isArray(data.privacy_level_options)
      ? data.privacy_level_options.filter((item): item is string => typeof item === 'string')
      : [];
    return { privacyLevelOptions: options };
  }

  private async postTikTok(url: string, accessToken: string, body: Record<string, unknown>): Promise<PublishOutcome> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text().catch(() => '');
    const providerResponse = text.slice(0, 2000);
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? JSON.parse(text) as Record<string, unknown> : {};
    } catch {
      parsed = {};
    }

    if (!response.ok) {
      return {
        success: false,
        errorMessage: `TikTok returned HTTP ${response.status}`,
        failureCode: response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'TIKTOK_REQUEST_FAILED',
        providerResponse,
        retryable: response.status >= 500 || response.status === 429,
        deliveryMode: 'native',
      };
    }

    const error = parsed.error as Record<string, unknown> | undefined;
    if (error && typeof error.code === 'string' && error.code !== 'ok') {
      return {
        success: false,
        errorMessage: typeof error.message === 'string' ? error.message : error.code,
        failureCode: error.code === 'rate_limit_exceeded' ? 'PROVIDER_RATE_LIMITED' : 'TIKTOK_REQUEST_REJECTED',
        providerResponse,
        retryable: error.code === 'rate_limit_exceeded',
        deliveryMode: 'native',
      };
    }

    const data = (parsed.data || {}) as Record<string, unknown>;
    const publishId = typeof data.publish_id === 'string' ? data.publish_id : undefined;
    if (!publishId) {
      return {
        success: false,
        errorMessage: 'TikTok accepted the request but did not return a publish_id.',
        failureCode: 'TIKTOK_PUBLISH_ID_MISSING',
        providerResponse,
        retryable: true,
        deliveryMode: 'native',
      };
    }

    return {
      success: true,
      externalPostId: publishId,
      providerResponse,
      deliveryMode: 'native',
    };
  }
}

class FacebookNativePublisher implements NativePublisher {
  providerId: SocialPlatform = 'facebook';

  canPublish(context: NativePublisherContext) {
    const base = baseNativeValidation(context);
    if (!base.ok) return base;
    if (context.payload.content.contentType === 'video' && !context.payload.content.mediaItems.some((item) => item.type === 'video' && item.downloadUrl)) {
      return {
        ok: false,
        reason: 'Facebook video publishing requires a video asset with a public URL.',
        retryable: false,
        failureCode: 'FACEBOOK_VIDEO_URL_REQUIRED',
      };
    }
    return { ok: true };
  }

  async publish(context: NativePublisherContext): Promise<PublishOutcome> {
    const pageId = context.account.providerAccountId;
    const accessToken = await resolveMetaPageAccessToken(context);
    const media = context.payload.content.mediaItems.find((item) => item.type === 'image' && item.downloadUrl);
    const video = context.payload.content.mediaItems.find((item) => item.type === 'video' && item.downloadUrl);
    const baseUrl = `${socialMetaGraphBaseUrl.value().replace(/\/$/, '')}/${pageId}`;
    if (video?.downloadUrl) {
      return postJsonToProvider({
        url: `${baseUrl}/videos`,
        accessToken,
        body: {
          file_url: video.downloadUrl,
          description: context.payload.content.finalText,
        },
      });
    }

    if (media?.downloadUrl) {
      return postJsonToProvider({
        url: `${baseUrl}/photos`,
        accessToken,
        body: {
          url: media.downloadUrl,
          caption: context.payload.content.finalText,
          published: true,
        },
      });
    }

    return postJsonToProvider({
      url: `${baseUrl}/feed`,
      accessToken,
      body: {
        message: context.payload.content.finalText,
      },
    });
  }
}

class InstagramNativePublisher implements NativePublisher {
  providerId: SocialPlatform = 'instagram';

  canPublish(context: NativePublisherContext) {
    const base = baseNativeValidation(context);
    if (!base.ok) return base;
    const media = context.payload.content.mediaItems.filter((item) => ['image', 'video'].includes(item.type) && item.downloadUrl);
    if (media.length === 0) {
      return {
        ok: false,
        reason: 'Instagram publishing requires at least one image or video with a public URL.',
        retryable: false,
        failureCode: 'INSTAGRAM_MEDIA_URL_REQUIRED',
      };
    }
    if (context.payload.content.contentType === 'carousel' && media.length < 2) {
      return {
        ok: false,
        reason: 'Instagram carousel publishing requires at least two media assets.',
        retryable: false,
        failureCode: 'INSTAGRAM_CAROUSEL_MEDIA_REQUIRED',
      };
    }
    return { ok: true };
  }

  async publish(context: NativePublisherContext): Promise<PublishOutcome> {
    const accessToken = await resolveMetaPageAccessToken(context);
    const igUserId = context.account.providerAccountId || context.credentials?.externalAccountId || '';
    const baseUrl = `${socialMetaGraphBaseUrl.value().replace(/\/$/, '')}/${igUserId}`;
    const mediaItems = context.payload.content.mediaItems
      .filter((item) => ['image', 'video'].includes(item.type) && item.downloadUrl)
      .sort((left, right) => left.order - right.order);

    const contentType = context.payload.content.contentType;
    if (contentType === 'carousel' || mediaItems.length > 1) {
      const childIds: string[] = [];
      for (const item of mediaItems.slice(0, 10)) {
        const child = await this.createMediaContainer({
          url: `${baseUrl}/media`,
          accessToken,
          body: this.buildContainerBody(item, context, true),
        });
        if (!child.success || !child.externalPostId) return child;
        childIds.push(child.externalPostId);
      }

      const parent = await this.createMediaContainer({
        url: `${baseUrl}/media`,
        accessToken,
        body: {
          caption: context.payload.content.finalText,
          media_type: 'CAROUSEL',
          children: childIds.join(','),
        },
      });
      if (!parent.success || !parent.externalPostId) return parent;
      return this.publishContainer(baseUrl, accessToken, parent.externalPostId, {
        carouselChildren: childIds,
      });
    }

    const item = mediaItems[0];
    const container = await this.createMediaContainer({
      url: `${baseUrl}/media`,
      accessToken,
      body: this.buildContainerBody(item, context, false),
    });
    if (!container.success || !container.externalPostId) return container;
    return this.publishContainer(baseUrl, accessToken, container.externalPostId);
  }

  private buildContainerBody(
    item: NativePublishPayload['content']['mediaItems'][number],
    context: NativePublisherContext,
    isCarouselItem: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      is_carousel_item: isCarouselItem,
    };
    if (!isCarouselItem) {
      body.caption = context.payload.content.finalText;
    }
    if (item.type === 'video') {
      const providerSettings = mapPlatformSettingsToProvider('instagram', context.payload.platformSettings || {});
      body.media_type = providerSettings.media_type === 'VIDEO' ? 'VIDEO' : 'REELS';
      body.video_url = item.downloadUrl;
      body.share_to_feed = sanitizeBoolean(providerSettings.share_to_feed, true);
      return body;
    }
    body.image_url = item.downloadUrl;
    return body;
  }

  private async createMediaContainer(input: {
    url: string;
    accessToken: string;
    body: Record<string, unknown>;
  }): Promise<PublishOutcome> {
    const result = await postJsonToProvider(input);
    if (!result.success) {
      return {
        ...result,
        failureCode: result.failureCode || 'INSTAGRAM_CONTAINER_CREATE_FAILED',
      };
    }
    if (!result.externalPostId) {
      return {
        success: false,
        errorMessage: 'Instagram media container did not return an ID.',
        failureCode: 'INSTAGRAM_CONTAINER_ID_MISSING',
        providerResponse: result.providerResponse,
        retryable: true,
        deliveryMode: 'native',
      };
    }
    return result;
  }

  private async publishContainer(
    baseUrl: string,
    accessToken: string,
    creationId: string,
    metadata?: Record<string, unknown>
  ): Promise<PublishOutcome> {
    const result = await postJsonToProvider({
      url: `${baseUrl}/media_publish`,
      accessToken,
      body: {
        creation_id: creationId,
      },
    });
    if (!result.success) {
      return {
        ...result,
        failureCode: result.failureCode || 'INSTAGRAM_MEDIA_PUBLISH_FAILED',
      };
    }
    return {
      ...result,
      externalPostId: result.externalPostId || creationId,
      providerResponse: JSON.stringify({
        provider: 'instagram',
        creationId,
        mediaId: result.externalPostId || null,
        ...(metadata || {}),
        raw: result.providerResponse ? JSON.parse(result.providerResponse) : null,
      }).slice(0, 2000),
    };
  }
}

class LinkedInNativePublisher implements NativePublisher {
  providerId: SocialPlatform = 'linkedin';

  canPublish(context: NativePublisherContext) {
    const base = baseNativeValidation(context);
    if (!base.ok) return base;
    const unsupported = context.payload.content.mediaItems.find((item) => item.type !== 'image');
    if (unsupported) {
      return {
        ok: false,
        reason: 'LinkedIn video and document publishing require dedicated upload adapters.',
        retryable: false,
        failureCode: 'PROVIDER_NATIVE_UPLOAD_REQUIRED',
      };
    }
    return { ok: true };
  }

  async publish(context: NativePublisherContext): Promise<PublishOutcome> {
    const author = context.account.providerAccountId?.startsWith('urn:')
      ? context.account.providerAccountId
      : `urn:li:person:${context.account.providerAccountId}`;
    const image = context.payload.content.mediaItems.find((item) => item.type === 'image' && item.downloadUrl);
    if (image?.downloadUrl) {
      const mediaUrn = await this.uploadImage(context, author, image.downloadUrl);
      if (!mediaUrn.success || !mediaUrn.externalPostId) return mediaUrn;
      return this.createPost(context, author, 'IMAGE', [{
        status: 'READY',
        media: mediaUrn.externalPostId,
        title: { text: context.payload.title || context.payload.caption.slice(0, 80) || 'SDC image post' },
      }]);
    }
    return this.createPost(context, author, 'NONE');
  }

  private async uploadImage(context: NativePublisherContext, author: string, imageUrl: string): Promise<PublishOutcome> {
    const baseUrl = socialLinkedInApiBaseUrl.value().replace(/\/$/, '');
    const register = await postJsonToProvider({
      url: `${baseUrl}/assets?action=registerUpload`,
      accessToken: context.credentials?.accessToken || '',
      headers: { 'X-Restli-Protocol-Version': '2.0.0' },
      body: {
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: author,
          serviceRelationships: [{
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          }],
        },
      },
    });
    if (!register.success || !register.providerResponse) return register;

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(register.providerResponse) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    const value = (parsed.value || {}) as Record<string, unknown>;
    const asset = typeof value.asset === 'string' ? value.asset : undefined;
    const uploadMechanism = (value.uploadMechanism || {}) as Record<string, unknown>;
    const mediaUpload = (uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'] || {}) as Record<string, unknown>;
    const uploadUrl = typeof mediaUpload.uploadUrl === 'string' ? mediaUpload.uploadUrl : undefined;
    if (!asset || !uploadUrl) {
      return {
        success: false,
        errorMessage: 'LinkedIn did not return a media upload URL.',
        failureCode: 'LINKEDIN_UPLOAD_URL_MISSING',
        providerResponse: register.providerResponse,
        retryable: true,
        deliveryMode: 'native',
      };
    }

    const media = await fetchMediaBytes(imageUrl);
    const uploaded = await putBinaryToProvider({
      url: uploadUrl,
      bytes: media.bytes,
      contentType: media.contentType.startsWith('image/') ? media.contentType : 'image/jpeg',
    });
    if (!uploaded.success) return uploaded;
    return {
      success: true,
      externalPostId: asset,
      providerResponse: JSON.stringify({ provider: 'linkedin', asset, upload: uploaded.providerResponse || null }).slice(0, 2000),
      deliveryMode: 'native',
    };
  }

  private async createPost(
    context: NativePublisherContext,
    author: string,
    shareMediaCategory: 'NONE' | 'IMAGE',
    media?: Array<Record<string, unknown>>
  ): Promise<PublishOutcome> {
    const baseUrl = socialLinkedInApiBaseUrl.value().replace(/\/$/, '');
    return postJsonToProvider({
      url: `${baseUrl}/ugcPosts`,
      accessToken: context.credentials?.accessToken || '',
      headers: { 'X-Restli-Protocol-Version': '2.0.0' },
      body: {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: context.payload.content.finalText,
            },
            shareMediaCategory,
            ...(media ? { media } : {}),
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      },
    });
  }
}

class XNativePublisher implements NativePublisher {
  providerId: SocialPlatform = 'x';

  canPublish(context: NativePublisherContext) {
    const base = baseNativeValidation(context);
    if (!base.ok) return base;
    const mediaIds = this.resolveMediaIds(context);
    if (context.payload.content.mediaItems.length > 0 && mediaIds.length === 0) {
      return {
        ok: false,
        reason: 'X media publishing requires pre-uploaded media IDs or the media upload adapter.',
        retryable: false,
        failureCode: 'PROVIDER_NATIVE_UPLOAD_REQUIRED',
      };
    }
    if (context.payload.content.finalText.length > 280) {
      return {
        ok: false,
        reason: 'X posts must be 280 characters or fewer.',
        retryable: false,
        failureCode: 'PROVIDER_CAPTION_TOO_LONG',
      };
    }
    return { ok: true };
  }

  async publish(context: NativePublisherContext): Promise<PublishOutcome> {
    const mediaIds = this.resolveMediaIds(context);
    const body: Record<string, unknown> = {
      text: context.payload.content.finalText,
    };
    if (mediaIds.length > 0) {
      body.media = { media_ids: mediaIds.slice(0, 4) };
    }
    return postJsonToProvider({
      url: `${socialXApiBaseUrl.value().replace(/\/$/, '')}/tweets`,
      accessToken: context.credentials?.accessToken || '',
      body,
    });
  }

  private resolveMediaIds(context: NativePublisherContext): string[] {
    const raw = mapPlatformSettingsToProvider('x', context.payload.platformSettings || {}).media_ids;
    return sanitizeStringListSetting(raw, 4);
  }
}

class YouTubeNativePublisher implements NativePublisher {
  providerId: SocialPlatform = 'youtube';

  canPublish(context: NativePublisherContext) {
    const base = baseNativeValidation(context);
    if (!base.ok) return base;
    const video = this.resolveVideo(context);
    if (!video?.downloadUrl) {
      return {
        ok: false,
        reason: 'YouTube publishing requires one completed video asset with a public URL.',
        retryable: false,
        failureCode: 'YOUTUBE_VIDEO_URL_REQUIRED',
      };
    }
    if (!hasScope(context.account, 'https://www.googleapis.com/auth/youtube.upload')) {
      return {
        ok: false,
        reason: 'The connected YouTube account is missing the upload permission.',
        retryable: false,
        failureCode: 'YOUTUBE_UPLOAD_SCOPE_MISSING',
      };
    }
    return { ok: true };
  }

  async publish(context: NativePublisherContext): Promise<PublishOutcome> {
    const video = this.resolveVideo(context);
    if (!video?.downloadUrl) {
      return {
        success: false,
        errorMessage: 'YouTube publishing requires a video asset URL.',
        failureCode: 'YOUTUBE_VIDEO_URL_REQUIRED',
        retryable: false,
        deliveryMode: 'native',
      };
    }

    const media = await fetchMediaBytes(video.downloadUrl);
    const contentType = media.contentType.startsWith('video/') ? media.contentType : video.mimeType || 'video/mp4';
    const uploadUrl = await this.createUploadSession(context, media.contentLength, contentType);
    if (!uploadUrl.success || !uploadUrl.providerResponse) return uploadUrl;

    const uploaded = await putBinaryToProvider({
      url: uploadUrl.providerResponse,
      bytes: media.bytes,
      contentType,
    });
    if (!uploaded.success) return uploaded;

    let parsed: Record<string, unknown> = {};
    try {
      parsed = uploaded.providerResponse ? JSON.parse(uploaded.providerResponse) as Record<string, unknown> : {};
    } catch {
      parsed = {};
    }

    const externalPostId = typeof parsed.id === 'string' ? parsed.id : undefined;
    return {
      success: true,
      externalPostId,
      providerResponse: JSON.stringify({
        provider: 'youtube',
        videoId: externalPostId || null,
        raw: parsed,
      }).slice(0, 2000),
      deliveryMode: 'native',
      confirmationRequired: true,
      providerPublishStatus: 'processing',
    };
  }

  async checkStatus(context: NativePublisherContext): Promise<NativeStatusOutcome> {
    const videoId = context.post.providerPostId || context.post.externalPostId;
    if (!videoId) {
      return {
        state: 'unknown',
        errorMessage: 'YouTube publish status cannot be checked without a video ID.',
        failureCode: 'YOUTUBE_VIDEO_ID_MISSING',
        retryable: false,
      };
    }

    const response = await getJsonFromProvider({
      url: `${socialYouTubeApiBaseUrl.value().replace(/\/$/, '')}/videos`,
      accessToken: context.credentials?.accessToken || '',
      params: {
        part: 'status',
        id: videoId,
      },
    });
    if (!response.ok) {
      return {
        state: 'unknown',
        externalPostId: videoId,
        providerResponse: response.providerResponse,
        errorMessage: response.errorMessage || 'Could not check YouTube video status.',
        failureCode: response.failureCode || 'YOUTUBE_STATUS_CHECK_FAILED',
        retryable: response.retryable ?? true,
      };
    }

    const items = Array.isArray(response.data.items) ? response.data.items as Record<string, unknown>[] : [];
    const item = items[0];
    const status = (item?.status || {}) as Record<string, unknown>;
    const uploadStatus = typeof status.uploadStatus === 'string' ? status.uploadStatus : '';
    const rejectionReason = typeof status.rejectionReason === 'string' ? status.rejectionReason : undefined;
    if (uploadStatus === 'processed') {
      return { state: 'published', externalPostId: videoId, providerResponse: response.providerResponse };
    }
    if (['failed', 'rejected', 'deleted'].includes(uploadStatus) || rejectionReason) {
      return {
        state: 'failed',
        externalPostId: videoId,
        errorMessage: rejectionReason || `YouTube upload status is ${uploadStatus || 'failed'}.`,
        failureCode: 'YOUTUBE_PROCESSING_FAILED',
        providerResponse: response.providerResponse,
        retryable: false,
      };
    }
    return { state: 'pending', externalPostId: videoId, providerResponse: response.providerResponse, retryable: true };
  }

  private resolveVideo(context: NativePublisherContext) {
    return context.payload.content.mediaItems
      .sort((left, right) => left.order - right.order)
      .find((item) => item.type === 'video' && item.downloadUrl);
  }

  private async createUploadSession(
    context: NativePublisherContext,
    contentLength: number,
    contentType: string
  ): Promise<PublishOutcome> {
    const baseUrl = socialYouTubeUploadBaseUrl.value().replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/videos?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${context.credentials?.accessToken || ''}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(contentLength),
      },
      body: JSON.stringify(this.buildMetadata(context)),
    });

    const responseText = await response.text().catch(() => '');
    const location = response.headers.get('location') || '';
    if (!response.ok) {
      return {
        success: false,
        errorMessage: `YouTube upload session returned HTTP ${response.status}`,
        failureCode: response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'YOUTUBE_UPLOAD_SESSION_FAILED',
        providerResponse: responseText.slice(0, 2000),
        retryable: response.status >= 500 || response.status === 429,
        deliveryMode: 'native',
      };
    }
    if (!location) {
      return {
        success: false,
        errorMessage: 'YouTube did not return a resumable upload URL.',
        failureCode: 'YOUTUBE_UPLOAD_URL_MISSING',
        providerResponse: responseText.slice(0, 2000),
        retryable: true,
        deliveryMode: 'native',
      };
    }
    return {
      success: true,
      providerResponse: location,
      deliveryMode: 'native',
    };
  }

  private buildMetadata(context: NativePublisherContext): Record<string, unknown> {
    const settings = mapPlatformSettingsToProvider('youtube', context.payload.platformSettings || {});
    const rawPrivacy = sanitizeStringSetting(settings.privacyStatus, 20);
    const privacyStatus = rawPrivacy && ['public', 'unlisted', 'private'].includes(rawPrivacy)
      ? rawPrivacy
      : 'private';
    const settingsTags = sanitizeStringListSetting(settings.tags, 30);
    const tags = settingsTags.length > 0 ? settingsTags : context.payload.content.hashtags.slice(0, 30);
    const title = sanitizeStringSetting(settings.title, 100)
      || sanitizeStringSetting(context.payload.title, 100)
      || sanitizeStringSetting(context.payload.caption, 100)
      || 'SDC video';

    return {
      snippet: {
        title,
        description: sanitizeStringSetting(settings.descriptionOverride, 5000) || context.payload.content.finalText.slice(0, 5000),
        tags,
        categoryId: sanitizeStringSetting(settings.categoryId, 20) || '22',
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: sanitizeBoolean(settings.selfDeclaredMadeForKids, false),
      },
    };
  }
}

const NATIVE_PUBLISHERS: Record<SocialPlatform, NativePublisher> = {
  tiktok: new TikTokNativePublisher(),
  instagram: new InstagramNativePublisher(),
  facebook: new FacebookNativePublisher(),
  linkedin: new LinkedInNativePublisher(),
  x: new XNativePublisher(),
  youtube: new YouTubeNativePublisher(),
};

function getNativePublisher(platform: SocialPlatform): NativePublisher {
  return NATIVE_PUBLISHERS[platform];
}

function inferMediaItemType(asset: GeneratedAssetDoc | null): MediaItemType {
  if (!asset) return 'unknown';
  const rawType = `${asset.type || asset.contentType || asset.mimeType || ''}`.toLowerCase();
  if (rawType.includes('video')) return 'video';
  if (rawType.includes('image')) return 'image';
  if (rawType.includes('audio')) return 'audio';
  if (rawType.includes('document') || rawType.includes('pdf')) return 'document';
  return 'unknown';
}

async function resolveGeneratedAsset(assetId: string, ownerId: string): Promise<GeneratedAssetDoc | null> {
  const assetRef = db.collection('generatedAssets').doc(assetId);
  const direct = await assetRef.get();
  if (direct.exists) {
    const data = direct.data() as GeneratedAssetDoc;
    const assetOwner = data.ownerId || data.userId;
    if (assetOwner && assetOwner !== ownerId) {
      return null;
    }
    return data;
  }

  const query = await db
    .collection('generatedAssets')
    .where('assetId', '==', assetId)
    .limit(1)
    .get();

  if (query.empty) return null;
  const data = query.docs[0].data() as GeneratedAssetDoc;
  const assetOwner = data.ownerId || data.userId;
  if (assetOwner && assetOwner !== ownerId) {
    return null;
  }
  return data;
}

function resolvePublishEndpoint(platform: SocialPlatform, account: SocialAccountDoc): string | null {
  const metadata = account.metadata || {};
  const metadataEndpoint = sanitizeText(
    metadata.publishEndpoint || metadata.publishWebhookUrl || metadata.publishUrl || metadata.webhookUrl,
    2048
  );

  if (metadataEndpoint) {
    return metadataEndpoint;
  }

  const envEndpoint = (() => {
    switch (platform) {
      case 'tiktok':
        return socialPublishEndpointTikTok.value();
      case 'instagram':
        return socialPublishEndpointInstagram.value();
      case 'facebook':
        return socialPublishEndpointFacebook.value();
      case 'linkedin':
        return socialPublishEndpointLinkedIn.value();
      case 'x':
        return socialPublishEndpointX.value();
      case 'youtube':
        return socialPublishEndpointYouTube.value();
      default:
        return '';
    }
  })();

  const fallback = sanitizeText(envEndpoint || socialPublishEndpoint.value(), 2048);
  return fallback || null;
}

async function buildPublishPayload(post: ScheduledPostDoc, account: SocialAccountDoc, credentials: DecryptedCredentials | null): Promise<NativePublishPayload> {
  const hashtags = sanitizeStringArray(post.hashtags);
  const contentType = post.contentType || getDefaultContentType(post.platform);
  const caption = post.caption || '';
  const mediaItems = await Promise.all((post.assetIds || []).map(async (assetId, index) => {
    const asset = await resolveGeneratedAsset(assetId, post.ownerId);
    return {
      assetId,
      order: index,
      type: inferMediaItemType(asset),
      mimeType: asset?.mimeType,
      downloadUrl: asset?.downloadUrl,
      thumbnail: asset?.thumbnail,
      storagePath: asset?.storagePath,
    };
  }));

  return {
    payloadVersion: 'social-publish-v1',
    scheduledPostId: post.scheduledPostId,
    ownerId: post.ownerId,
    publicationGroupId: post.publicationGroupId,
    platform: post.platform,
    connectedAccountId: post.connectedAccountId || post.socialAccountId || account.socialAccountId,
    destination: {
      socialAccountId: account.socialAccountId,
      providerAccountId: account.providerAccountId,
      accountName: account.accountName,
      handle: account.handle,
      status: account.status,
    },
    title: post.title,
    caption,
    campaignId: post.campaignId,
    notes: post.notes,
    content: {
      contentType,
      caption,
      hashtags,
      cta: post.cta,
      finalText: buildFinalSocialText(caption, hashtags, post.cta),
      mediaItems,
    },
    scheduling: {
      scheduledTime: post.scheduledTime.toDate().toISOString(),
      timezone: post.timezone || account.timezone,
      status: post.status,
    },
    platformSettings: jsonClone(normalizePlatformSettings(post.platform, post.platformSettings || {})),
    metadata: jsonClone({
      ...(post.metadata || {}),
      providerPostId: post.providerPostId || post.externalPostId || null,
      failureCode: post.failureCode || null,
      failureMessage: post.failureMessage || post.lastError || null,
    }),
    credentials: credentials?.externalAccountId ? {
      externalAccountId: credentials.externalAccountId,
    } : undefined,
  };
}

function isEligibleForProcessing(post: ScheduledPostDoc, now: Date): boolean {
  if (isCalendarEvent(post)) return false;

  const dueAt = post.scheduledTime.toDate().getTime();
  if (dueAt > now.getTime()) return false;
  if (post.status === 'published' || post.status === 'publishing' || post.status === 'cancelled') return false;
  if (post.status !== 'scheduled' && post.status !== 'failed') return false;

  if (post.nextRetryAt && post.nextRetryAt.toDate().getTime() > now.getTime()) {
    return false;
  }

  if (post.publishLeaseExpiresAt && post.publishLeaseExpiresAt.toDate().getTime() > now.getTime()) {
    return false;
  }

  return true;
}

async function pickSocialAccount(ownerId: string, platform: SocialPlatform, preferredAccountId?: string): Promise<SocialAccountDoc | null> {
  const snapshot = await db.collection('socialAccounts').where('ownerId', '==', ownerId).get();
  const candidates = snapshot.docs.map((doc) => ({
    ...(doc.data() as SocialAccountDoc),
    socialAccountId: typeof doc.data().socialAccountId === 'string' ? doc.data().socialAccountId : doc.id,
  }));

  const connected = candidates.filter((account) => account.providerId === platform && account.status === 'connected' && account.hasCredentials);

  if (preferredAccountId) {
    const preferred = connected.find((account) => account.socialAccountId === preferredAccountId);
    if (preferred) return preferred;
  }

  return connected[0] || null;
}

async function recordPublishAttempt(input: PublishAttemptDoc): Promise<void> {
  await db.collection('socialPublishAttempts').doc(input.publishAttemptId).set({
    ...input,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function updatePublishAttempt(
  publishAttemptId: string,
  patch: Partial<PublishAttemptDoc>
): Promise<void> {
  await db.collection('socialPublishAttempts').doc(publishAttemptId).set({
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function claimScheduledPost(postRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>): Promise<ScheduledPostDoc | null> {
  const leaseId = crypto.randomUUID();
  const leaseExpiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + socialPublishLeaseMinutes.value() * 60 * 1000));
  const now = admin.firestore.Timestamp.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(postRef);
    if (!snapshot.exists) return null;

    const post = snapshot.data() as ScheduledPostDoc;
    if (!isEligibleForProcessing(post, new Date())) return null;

    const currentAttemptCount = typeof post.attemptCount === 'number' ? post.attemptCount : 0;
    const nextAttemptCount = currentAttemptCount + 1;
    if (nextAttemptCount > socialPublishMaxAttempts.value()) {
      transaction.set(postRef, {
        failedAt: now,
        lastError: 'Maximum publish attempts reached',
        publishLeaseId: null,
        publishLeaseExpiresAt: null,
        updatedAt: now,
      }, { merge: true });
      return null;
    }

    transaction.set(postRef, {
      attemptCount: nextAttemptCount,
      status: 'publishing',
      lastAttemptAt: now,
      publishLeaseId: leaseId,
      publishLeaseExpiresAt: leaseExpiresAt,
      updatedAt: now,
    }, { merge: true });

    return {
      ...post,
      scheduledPostId: typeof post.scheduledPostId === 'string' ? post.scheduledPostId : snapshot.id,
      attemptCount: nextAttemptCount,
      publishLeaseId: leaseId,
      publishLeaseExpiresAt: leaseExpiresAt,
      lastAttemptAt: now,
    };
  });
}

async function markPublishFailure(postRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>, post: ScheduledPostDoc, errorMessage: string, retryable: boolean, externalPostId?: string, providerResponse?: string): Promise<void> {
  const attemptCount = typeof post.attemptCount === 'number' ? post.attemptCount : 1;
  const exponentialMultiplier = Math.min(2 ** Math.max(0, attemptCount - 1), 16);
  const delayMinutes = Math.max(1, socialPublishRetryDelayMinutes.value() * exponentialMultiplier);
  const nextRetryAt = retryable && attemptCount < socialPublishMaxAttempts.value()
    ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + delayMinutes * 60 * 1000))
    : null;

  await postRef.set({
    status: 'failed',
    failedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastError: errorMessage.slice(0, 1000),
    externalPostId: externalPostId || post.externalPostId || null,
    providerPostId: externalPostId || post.providerPostId || post.externalPostId || null,
    failureCode: retryable ? 'PROVIDER_RETRYABLE_FAILURE' : 'PROVIDER_PUBLISH_FAILED',
    failureMessage: errorMessage.slice(0, 1000),
    publishProviderResponse: providerResponse ? providerResponse.slice(0, 2000) : post.publishProviderResponse || null,
    nextRetryAt,
    publishLeaseId: null,
    publishLeaseExpiresAt: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (post.status !== 'failed') {
    const title = post.title || post.caption.slice(0, 60) || 'Scheduled post';
    const message = `${post.platform} post failed to publish. ${errorMessage.slice(0, 120)}`;
    await notifyPublishStatus(post.ownerId, 'social_publish_failed', 'Post publishing failed', `${title} needs attention. ${message}`, '/social/calendar');
  }
}

async function markPublishPendingConfirmation(
  postRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>,
  post: ScheduledPostDoc,
  account: SocialAccountDoc,
  externalPostId?: string,
  providerResponse?: string
): Promise<void> {
  await postRef.set({
    status: 'publishing',
    publishedBy: account.socialAccountId,
    lastError: null,
    failureCode: null,
    failureMessage: null,
    nextRetryAt: null,
    externalPostId: externalPostId || post.externalPostId || null,
    providerPostId: externalPostId || post.providerPostId || post.externalPostId || null,
    publishProviderResponse: providerResponse ? providerResponse.slice(0, 2000) : post.publishProviderResponse || null,
    publishLeaseId: null,
    publishLeaseExpiresAt: null,
    metadata: {
      ...(post.metadata || {}),
      publishConfirmationStatus: 'pending',
      publishConfirmationStartedAt: new Date().toISOString(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function markPublishSuccess(
  postRef: admin.firestore.DocumentReference<admin.firestore.DocumentData>,
  post: ScheduledPostDoc,
  account: SocialAccountDoc,
  externalPostId?: string,
  providerResponse?: string
): Promise<void> {
  await postRef.set({
    status: 'published',
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    publishedBy: account.socialAccountId,
    lastError: null,
    failureCode: null,
    failureMessage: null,
    nextRetryAt: null,
    externalPostId: externalPostId || post.externalPostId || null,
    providerPostId: externalPostId || post.providerPostId || post.externalPostId || null,
    publishProviderResponse: providerResponse ? providerResponse.slice(0, 2000) : post.publishProviderResponse || null,
    publishLeaseId: null,
    publishLeaseExpiresAt: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  if (post.status !== 'published') {
    const title = post.title || post.caption.slice(0, 60) || 'Scheduled post';
    await notifyPublishStatus(post.ownerId, 'social_publish_success', 'Post published', `${title} was published on ${post.platform}.`, '/social/calendar');
  }
}

async function notifyPublishStatus(
  ownerId: string,
  type: string,
  title: string,
  body: string,
  linkUrl: string
): Promise<void> {
  try {
    await sendNotificationWithPush(ownerId, type, title, body, linkUrl);
  } catch (error) {
    console.warn('[SocialPublishing] notification hook failed', {
      ownerId,
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function minuteKey(date = new Date()): string {
  return date.toISOString().slice(0, 16).replace(/[-:T]/g, '');
}

function canonicalPostText(post: ScheduledPostDoc): string {
  return [
    post.platform,
    (post.caption || '').trim().toLowerCase().replace(/\s+/g, ' '),
    (post.hashtags || []).map((tag) => tag.replace(/^#/, '').toLowerCase()).sort().join(','),
    (post.assetIds || []).join(','),
  ].join('|');
}

function postFingerprint(post: ScheduledPostDoc): string {
  return crypto.createHash('sha256').update(canonicalPostText(post)).digest('hex');
}

function tokenExpiryState(account: SocialAccountDoc): 'expired' | 'expiring' | 'valid' {
  if (!account.expiresAt) return 'valid';
  const expiresMs = account.expiresAt.toMillis();
  if (expiresMs <= Date.now()) return 'expired';
  const windowMs = Math.max(1, socialTokenExpiryAlertWindowDays.value()) * 24 * 60 * 60 * 1000;
  return expiresMs <= Date.now() + windowMs ? 'expiring' : 'valid';
}

async function recordSocialAuditLog(input: {
  ownerId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.collection('socialAuditLogs').doc().set({
    ownerId: input.ownerId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata || {},
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function reserveCounter(
  collection: string,
  docId: string,
  limit: number,
  metadata: Record<string, unknown>
): Promise<boolean> {
  if (limit <= 0) return true;
  const ref = db.collection(collection).doc(docId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? Number((snapshot.data() || {}).count || 0) : 0;
    if (current >= limit) return false;
    transaction.set(ref, {
      ...metadata,
      count: current + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: snapshot.exists ? (snapshot.data() || {}).createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

async function reserveDuplicateFingerprint(post: ScheduledPostDoc): Promise<PublishGuardOutcome> {
  const fingerprint = postFingerprint(post);
  const ref = db.collection('socialPublishFingerprints').doc(`${post.ownerId}_${post.platform}_${fingerprint}`);
  const now = admin.firestore.Timestamp.now();
  const windowMs = Math.max(1, socialPublishDuplicateWindowHours.value()) * 60 * 60 * 1000;

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const data = snapshot.data() || {};
      const existingPostId = typeof data.scheduledPostId === 'string' ? data.scheduledPostId : '';
      const createdAt = data.createdAt as admin.firestore.Timestamp | undefined;
      const fresh = createdAt ? Date.now() - createdAt.toMillis() <= windowMs : true;
      if (existingPostId && existingPostId !== post.scheduledPostId && fresh) {
        return {
          ok: false,
          retryable: false,
          failureCode: 'DUPLICATE_POST_DETECTED',
          reason: 'A near-identical post was already queued or published recently.',
        };
      }
    }

    transaction.set(ref, {
      ownerId: post.ownerId,
      platform: post.platform,
      scheduledPostId: post.scheduledPostId,
      fingerprint,
      createdAt: snapshot.exists ? (snapshot.data() || {}).createdAt || now : now,
      updatedAt: now,
    }, { merge: true });
    return { ok: true };
  });
}

async function evaluatePublishGuards(post: ScheduledPostDoc, account: SocialAccountDoc | null): Promise<PublishGuardOutcome> {
  const pauseSnap = await db.collection('socialPublishingControls').doc(post.ownerId).get();
  if ((pauseSnap.data() || {}).paused === true) {
    return {
      ok: false,
      retryable: true,
      failureCode: 'PUBLISHING_PAUSED',
      reason: 'All scheduled publishing is paused for this account.',
    };
  }

  if (!account) return { ok: true };

  if (account.status === 'paused') {
    return {
      ok: false,
      retryable: true,
      failureCode: 'SOCIAL_ACCOUNT_PAUSED',
      reason: `${account.providerLabel || account.providerId} publishing is paused.`,
    };
  }

  const expiry = tokenExpiryState(account);
  if (expiry === 'expired') {
    await notifyPublishStatus(post.ownerId, 'social_token_expired', 'Reconnect social account', `${account.providerLabel || account.providerId} access expired. Reconnect before publishing.`, '/social');
    return {
      ok: false,
      retryable: false,
      failureCode: 'TOKEN_EXPIRED',
      reason: `${account.providerLabel || account.providerId} token has expired. Reconnect the account.`,
    };
  }
  if (expiry === 'expiring') {
    const alertKey = `token_expiring_${account.socialAccountId}_${dayKey()}`;
    const alertRef = db.collection('socialReliabilityAlerts').doc(alertKey);
    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) {
      await alertRef.set({
        ownerId: post.ownerId,
        socialAccountId: account.socialAccountId,
        providerId: account.providerId,
        type: 'token_expiring',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await notifyPublishStatus(post.ownerId, 'social_token_expiring', 'Social account token expires soon', `${account.providerLabel || account.providerId} may need reconnection soon.`, '/social');
    }
  }

  const readiness = (account.metadata?.connectionReadiness || (account as unknown as { connectionReadiness?: unknown }).connectionReadiness) as Record<string, unknown> | undefined;
  const missingScopes = Array.isArray(readiness?.missingScopes) ? readiness?.missingScopes : [];
  if (missingScopes.length > 0 || readiness?.permissionsVerified === false) {
    await notifyPublishStatus(post.ownerId, 'social_permission_attention', 'Social permissions need attention', `${account.providerLabel || account.providerId} may be missing required publishing permissions.`, '/social');
    return {
      ok: false,
      retryable: false,
      failureCode: 'PERMISSION_EXPIRED_OR_MISSING',
      reason: `${account.providerLabel || account.providerId} permissions need attention.`,
    };
  }

  const platformSettingsGuard = evaluatePlatformSettingsGuard(post, account);
  if (!platformSettingsGuard.ok) return platformSettingsGuard;

  const duplicate = await reserveDuplicateFingerprint(post);
  if (!duplicate.ok) return duplicate;

  const dailyOk = await reserveCounter(
    'socialPublishUserDailyLimits',
    `${post.ownerId}_${dayKey()}`,
    socialPublishUserDailyLimit.value(),
    { ownerId: post.ownerId, dateKey: dayKey() }
  );
  if (!dailyOk) {
    return {
      ok: false,
      retryable: true,
      failureCode: 'USER_DAILY_PUBLISH_LIMIT',
      reason: 'Daily publishing limit reached. Remaining posts will retry tomorrow.',
    };
  }

  const providerOk = await reserveCounter(
    'socialPublishProviderRateLimits',
    `${post.platform}_${minuteKey()}`,
    socialPublishProviderRateLimitPerMinute.value(),
    { providerId: post.platform, minuteKey: minuteKey() }
  );
  if (!providerOk) {
    return {
      ok: false,
      retryable: true,
      failureCode: 'PROVIDER_RATE_LIMIT',
      reason: `${post.platform} rate limit reached. This post will retry shortly.`,
    };
  }

  return { ok: true };
}

function evaluatePlatformSettingsGuard(post: ScheduledPostDoc, account: SocialAccountDoc): PublishGuardOutcome {
  const contentType = post.contentType || getDefaultContentType(post.platform);
  const settings = normalizePlatformSettings(post.platform, post.platformSettings || {});

  if (post.platform === 'tiktok') {
    if (!['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'].includes(String(settings.tiktokPrivacyLevel))) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'INVALID_PRIVACY_SETTING',
        reason: 'TikTok privacy setting is invalid.',
      };
    }
    if (settings.tiktokPublishMode === 'direct' && !hasScope(account, 'video.publish')) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'DIRECT_POST_PERMISSION_MISSING',
        reason: 'TikTok Direct Post requires video.publish permission.',
      };
    }
    if (settings.tiktokPublishMode !== 'direct' && !hasScope(account, 'video.upload')) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'DRAFT_UPLOAD_PERMISSION_MISSING',
        reason: 'TikTok Draft Inbox requires video.upload permission.',
      };
    }
    if ((post.metadata?.aiGenerated === true || post.metadata?.generatedByAi === true) && settings.tiktokAiGenerated !== true) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'AI_DISCLOSURE_REQUIRED',
        reason: 'TikTok AI-generated content disclosure is required for this post.',
      };
    }
    if ((post.metadata?.paidPromotion === true || post.metadata?.brandedContent === true || post.metadata?.sponsored === true)
      && settings.tiktokBrandedContent !== true
      && settings.tiktokOrganicBrandContent !== true) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'PROMOTIONAL_DISCLOSURE_REQUIRED',
        reason: 'TikTok branded or organic brand content disclosure is required.',
      };
    }
  }

  if (post.platform === 'youtube') {
    const title = typeof settings.youtubeTitle === 'string' ? settings.youtubeTitle : post.title || post.caption || '';
    if (title.length > 100) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'YOUTUBE_TITLE_TOO_LONG',
        reason: 'YouTube titles must be 100 characters or fewer.',
      };
    }
    if (!['public', 'unlisted', 'private'].includes(String(settings.youtubeVisibility))) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'INVALID_PRIVACY_SETTING',
        reason: 'YouTube visibility must be public, unlisted, or private.',
      };
    }
    if (!hasScope(account, 'https://www.googleapis.com/auth/youtube.upload')) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'YOUTUBE_UPLOAD_PERMISSION_MISSING',
        reason: 'YouTube upload permission is missing.',
      };
    }
  }

  if (post.platform === 'instagram' && settings.instagramFormat === 'carousel') {
    const assetCount = (post.assetIds || []).length;
    if (assetCount < 2 || assetCount > 10) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'INSTAGRAM_CAROUSEL_ASSET_COUNT_INVALID',
        reason: 'Instagram carousels require 2 to 10 ordered media assets.',
      };
    }
  }

  if (post.platform === 'x') {
    const finalText = buildFinalText(post);
    if (finalText.length > 280 && settings.xThreadEnabled !== true) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'X_TEXT_TOO_LONG',
        reason: 'X posts must be 280 characters or fewer unless thread mode is enabled.',
      };
    }
    if (contentType !== 'text' && (!Array.isArray(settings.xMediaIds) || settings.xMediaIds.length === 0)) {
      return {
        ok: false,
        retryable: false,
        failureCode: 'X_MEDIA_IDS_REQUIRED',
        reason: 'X media posts require uploaded media IDs until direct media upload is enabled.',
      };
    }
  }

  if (post.platform === 'facebook'
    && (post.metadata?.paidPromotion === true || post.metadata?.brandedContent === true || post.metadata?.sponsored === true)
    && settings.facebookPromotionalDisclosure !== true) {
    return {
      ok: false,
      retryable: false,
      failureCode: 'PROMOTIONAL_DISCLOSURE_REQUIRED',
      reason: 'Facebook promotional disclosure is required for this post.',
    };
  }

  return { ok: true };
}

async function attemptPublish(post: ScheduledPostDoc, account: SocialAccountDoc): Promise<PublishOutcome> {
  if (!account) {
    return {
      success: false,
      errorMessage: `No connected ${post.platform} account is available for publishing`,
      retryable: false,
    };
  }

  const credentials = await readCredentials(account);
  const payload = await buildPublishPayload(post, account, credentials);

  if (socialNativePublishingEnabled.value()) {
    const publisher = getNativePublisher(post.platform);
    const nativeContext: NativePublisherContext = { post, account, credentials, payload };
    const readiness = publisher.canPublish(nativeContext);
    if (readiness.ok) {
      return publisher.publish(nativeContext);
    }

    const endpointForFallback = resolvePublishEndpoint(post.platform, account);
    if (!endpointForFallback) {
      return {
        success: false,
        errorMessage: readiness.reason || `Native publishing is not ready for ${post.platform}`,
        retryable: readiness.retryable ?? false,
        failureCode: readiness.failureCode || 'PROVIDER_NATIVE_UNAVAILABLE',
        deliveryMode: 'native',
      };
    }
  }

  const endpoint = resolvePublishEndpoint(post.platform, account);
  if (!endpoint) {
    return {
      success: false,
      errorMessage: `No publish endpoint is configured for ${account.providerLabel}`,
      retryable: true,
      failureCode: 'PROVIDER_ENDPOINT_MISSING',
      deliveryMode: 'external_endpoint',
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Social-Platform': post.platform,
    'X-Social-Account-Id': account.socialAccountId,
    'X-Social-Owner-Id': post.ownerId,
    'X-Social-Post-Id': post.scheduledPostId,
  };

  if (credentials?.accessToken) {
    headers.Authorization = `Bearer ${credentials.accessToken}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => '');
  const providerResponse = responseText.slice(0, 2000);

  if (!response.ok) {
    return {
      success: false,
      errorMessage: `Publish endpoint rejected the request (${response.status})`,
      failureCode: response.status === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_ENDPOINT_REJECTED',
      providerResponse,
      retryable: response.status >= 500 || response.status === 429,
      deliveryMode: 'external_endpoint',
    };
  }

  let externalPostId: string | undefined;
  try {
    if (responseText && (response.headers.get('content-type') || '').includes('application/json')) {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      externalPostId = typeof parsed.id === 'string'
        ? parsed.id
        : typeof parsed.postId === 'string'
          ? parsed.postId
          : typeof parsed.externalPostId === 'string'
            ? parsed.externalPostId
            : undefined;
    }
  } catch {
    externalPostId = undefined;
  }

  if (!externalPostId) {
    externalPostId = `${post.platform}-${post.scheduledPostId}`;
  }

  return {
    success: true,
    externalPostId,
    providerResponse,
    deliveryMode: 'external_endpoint',
  };
}

async function processScheduledPosts(): Promise<{
  processed: number;
  published: number;
  pendingConfirmation: number;
  failed: number;
  skipped: number;
}> {
  const now = new Date();
  const snapshot = await db
    .collection('scheduledPosts')
    .where('scheduledTime', '<=', admin.firestore.Timestamp.fromDate(now))
    .orderBy('scheduledTime', 'asc')
    .limit(socialPublishBatchSize.value())
    .get();

  let processed = 0;
  let published = 0;
  let pendingConfirmation = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const claimed = await claimScheduledPost(doc.ref);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    processed += 1;
    const attemptNumber = claimed.attemptCount || 1;
    const publishAttemptId = `pub_${claimed.scheduledPostId}_${attemptNumber}_${Date.now()}`;
    const connectedAccountId = claimed.connectedAccountId || claimed.socialAccountId;
    const account = await pickSocialAccount(claimed.ownerId, claimed.platform, connectedAccountId);
    const startedAtDate = new Date();
    const guard = await evaluatePublishGuards(claimed, account);
    const normalizedSettingsSnapshot = normalizePlatformSettings(claimed.platform, claimed.platformSettings || {});
    const providerSettingsSnapshot = mapPlatformSettingsToProvider(claimed.platform, claimed.platformSettings || {});

    await recordPublishAttempt({
      publishAttemptId,
      scheduledPostId: claimed.scheduledPostId,
      ownerId: claimed.ownerId,
      platform: claimed.platform,
      socialAccountId: connectedAccountId,
      publicationGroupId: claimed.publicationGroupId,
      provider: claimed.platform,
      contentType: claimed.contentType || getDefaultContentType(claimed.platform),
      attemptNumber,
      status: 'processing',
      triggeredAt: admin.firestore.Timestamp.now(),
      startedAt: admin.firestore.Timestamp.fromDate(startedAtDate),
      payloadVersion: 'social-publish-v1',
      metadata: {
        scheduledTime: toIso(claimed.scheduledTime),
        title: claimed.title || null,
        contentType: claimed.contentType || getDefaultContentType(claimed.platform),
        assetCount: (claimed.assetIds || []).length,
        normalizedPlatformSettings: normalizedSettingsSnapshot,
        providerPlatformSettings: providerSettingsSnapshot,
      },
    });

    if (!guard.ok) {
      await markPublishFailure(doc.ref, claimed, guard.reason || 'Publish blocked by reliability controls.', guard.retryable ?? true);
      await updatePublishAttempt(publishAttemptId, {
        status: guard.retryable === false ? 'failed' : 'skipped',
        finishedAt: admin.firestore.Timestamp.now(),
        durationMs: Date.now() - startedAtDate.getTime(),
        failureCode: guard.failureCode || 'PUBLISH_GUARD_BLOCKED',
        errorMessage: guard.reason || 'Publish blocked by reliability controls.',
        retryable: guard.retryable ?? true,
        metadata: {
          guardBlocked: true,
          guardCode: guard.failureCode || 'PUBLISH_GUARD_BLOCKED',
          normalizedPlatformSettings: normalizedSettingsSnapshot,
          providerPlatformSettings: providerSettingsSnapshot,
        },
      });
      await recordSocialAuditLog({
        ownerId: claimed.ownerId,
        action: 'publish_blocked',
        targetType: 'scheduledPost',
        targetId: claimed.scheduledPostId,
        metadata: {
          platform: claimed.platform,
          reason: guard.reason || null,
          failureCode: guard.failureCode || null,
        },
      });
      failed += guard.retryable === false ? 1 : 0;
      skipped += guard.retryable === false ? 0 : 1;
      continue;
    }

    try {
      const outcome = account
        ? await attemptPublish(claimed, account)
        : {
            success: false,
            errorMessage: `No connected ${claimed.platform} account is available for publishing`,
            retryable: false,
          };
      if (outcome.success) {
        const awaitingConfirmation = Boolean(outcome.confirmationRequired);
        if (awaitingConfirmation) {
          await markPublishPendingConfirmation(doc.ref, claimed, account as SocialAccountDoc, outcome.externalPostId, outcome.providerResponse);
        } else {
          await markPublishSuccess(doc.ref, claimed, account as SocialAccountDoc, outcome.externalPostId, outcome.providerResponse);
        }
        await updatePublishAttempt(publishAttemptId, {
          status: awaitingConfirmation ? 'pending_confirmation' : 'success',
          finishedAt: admin.firestore.Timestamp.now(),
          durationMs: Date.now() - startedAtDate.getTime(),
          externalPostId: outcome.externalPostId || null,
          providerPostId: outcome.externalPostId || null,
          providerResponse: outcome.providerResponse || null,
          retryable: awaitingConfirmation,
          metadata: {
            deliveryMode: outcome.deliveryMode || 'external_endpoint',
            nativePublishingEnabled: socialNativePublishingEnabled.value(),
            providerPublishStatus: outcome.providerPublishStatus || (awaitingConfirmation ? 'submitted' : 'published'),
            confirmationRequired: awaitingConfirmation,
            normalizedPlatformSettings: normalizedSettingsSnapshot,
            providerPlatformSettings: providerSettingsSnapshot,
          },
        });
        if (awaitingConfirmation) {
          pendingConfirmation += 1;
        } else {
          published += 1;
        }
      } else {
        await markPublishFailure(doc.ref, claimed, outcome.errorMessage || 'Publish failed', outcome.retryable ?? true, outcome.externalPostId, outcome.providerResponse);
        await updatePublishAttempt(publishAttemptId, {
          status: 'failed',
          finishedAt: admin.firestore.Timestamp.now(),
          durationMs: Date.now() - startedAtDate.getTime(),
          failureCode: outcome.failureCode || (outcome.retryable ? 'PROVIDER_RETRYABLE_FAILURE' : 'PROVIDER_PUBLISH_FAILED'),
          errorMessage: outcome.errorMessage || 'Publish failed',
          externalPostId: outcome.externalPostId || null,
          providerPostId: outcome.externalPostId || null,
          providerResponse: outcome.providerResponse || null,
          retryable: outcome.retryable ?? true,
          metadata: {
            deliveryMode: outcome.deliveryMode || 'external_endpoint',
            nativePublishingEnabled: socialNativePublishingEnabled.value(),
            normalizedPlatformSettings: normalizedSettingsSnapshot,
            providerPlatformSettings: providerSettingsSnapshot,
          },
        });
        failed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPublishFailure(doc.ref, claimed, message, true);
      await updatePublishAttempt(publishAttemptId, {
        status: 'failed',
        finishedAt: admin.firestore.Timestamp.now(),
        durationMs: Date.now() - startedAtDate.getTime(),
        failureCode: 'WORKER_EXCEPTION',
        errorMessage: message,
        retryable: true,
      });
      failed += 1;
    }
  }

  return { processed, published, pendingConfirmation, failed, skipped };
}

async function findPendingPublishAttempt(scheduledPostId: string): Promise<admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData> | null> {
  const snapshot = await db
    .collection('socialPublishAttempts')
    .where('scheduledPostId', '==', scheduledPostId)
    .limit(20)
    .get();

  const pending = snapshot.docs
    .filter((doc) => (doc.data() as PublishAttemptDoc).status === 'pending_confirmation')
    .sort((left, right) => {
      const leftTime = ((left.data() as PublishAttemptDoc).triggeredAt as admin.firestore.Timestamp | undefined)?.toMillis?.() || 0;
      const rightTime = ((right.data() as PublishAttemptDoc).triggeredAt as admin.firestore.Timestamp | undefined)?.toMillis?.() || 0;
      return rightTime - leftTime;
    });
  return pending[0] || null;
}

async function reconcilePublishingPost(
  snapshot: admin.firestore.QueryDocumentSnapshot<admin.firestore.DocumentData>
): Promise<'published' | 'failed' | 'pending' | 'skipped'> {
  const post = {
    ...(snapshot.data() as ScheduledPostDoc),
    scheduledPostId: typeof snapshot.data().scheduledPostId === 'string' ? snapshot.data().scheduledPostId : snapshot.id,
  };
  if (isCalendarEvent(post)) return 'skipped';

  const account = await pickSocialAccount(post.ownerId, post.platform, post.connectedAccountId || post.socialAccountId);
  if (!account) {
    await markPublishFailure(snapshot.ref, post, `No connected ${post.platform} account is available for reconciliation.`, false);
    return 'failed';
  }

  const credentials = await readCredentials(account);
  const payload = await buildPublishPayload(post, account, credentials);
  const publisher = getNativePublisher(post.platform);
  if (!publisher.checkStatus) {
    return 'skipped';
  }

  const attempt = await findPendingPublishAttempt(post.scheduledPostId);
  const outcome = await publisher.checkStatus({ post, account, credentials, payload });
  const now = admin.firestore.Timestamp.now();

  if (outcome.state === 'published') {
    await markPublishSuccess(snapshot.ref, post, account, outcome.externalPostId || post.providerPostId || post.externalPostId || undefined, outcome.providerResponse);
    if (attempt) {
      await updatePublishAttempt(attempt.id, {
        status: 'success',
        finishedAt: now,
        externalPostId: outcome.externalPostId || post.externalPostId || null,
        providerPostId: outcome.externalPostId || post.providerPostId || post.externalPostId || null,
        providerResponse: outcome.providerResponse || null,
        retryable: false,
        metadata: {
          ...((attempt.data() as PublishAttemptDoc).metadata || {}),
          reconciledAt: now.toDate().toISOString(),
          providerPublishStatus: 'published',
        },
      });
    }
    return 'published';
  }

  if (outcome.state === 'failed') {
    await markPublishFailure(
      snapshot.ref,
      post,
      outcome.errorMessage || 'Provider reported publish failure.',
      outcome.retryable ?? false,
      outcome.externalPostId || post.providerPostId || post.externalPostId || undefined,
      outcome.providerResponse
    );
    if (attempt) {
      await updatePublishAttempt(attempt.id, {
        status: 'failed',
        finishedAt: now,
        failureCode: outcome.failureCode || 'PROVIDER_CONFIRMATION_FAILED',
        errorMessage: outcome.errorMessage || 'Provider reported publish failure.',
        externalPostId: outcome.externalPostId || post.externalPostId || null,
        providerPostId: outcome.externalPostId || post.providerPostId || post.externalPostId || null,
        providerResponse: outcome.providerResponse || null,
        retryable: outcome.retryable ?? false,
        metadata: {
          ...((attempt.data() as PublishAttemptDoc).metadata || {}),
          reconciledAt: now.toDate().toISOString(),
          providerPublishStatus: 'failed',
        },
      });
    }
    return 'failed';
  }

  await snapshot.ref.set({
    publishProviderResponse: outcome.providerResponse ? outcome.providerResponse.slice(0, 2000) : post.publishProviderResponse || null,
    metadata: {
      ...(post.metadata || {}),
      publishConfirmationStatus: outcome.state,
      lastPublishStatusCheckAt: now.toDate().toISOString(),
      lastPublishStatusError: outcome.errorMessage || null,
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  if (attempt) {
    await updatePublishAttempt(attempt.id, {
      providerResponse: outcome.providerResponse || (attempt.data() as PublishAttemptDoc).providerResponse || null,
      retryable: outcome.retryable ?? true,
      metadata: {
        ...((attempt.data() as PublishAttemptDoc).metadata || {}),
        reconciledAt: now.toDate().toISOString(),
        providerPublishStatus: outcome.state,
        providerStatusError: outcome.errorMessage || null,
      },
    });
  }
  return 'pending';
}

async function reconcilePublishingStatuses(): Promise<{
  checked: number;
  published: number;
  failed: number;
  pending: number;
  skipped: number;
}> {
  if (!socialNativePublishingEnabled.value()) {
    return { checked: 0, published: 0, failed: 0, pending: 0, skipped: 0 };
  }

  const snapshot = await db
    .collection('scheduledPosts')
    .where('status', '==', 'publishing')
    .limit(socialPublishBatchSize.value())
    .get();

  let checked = 0;
  let published = 0;
  let failed = 0;
  let pending = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    checked += 1;
    try {
      const result = await reconcilePublishingPost(doc);
      if (result === 'published') published += 1;
      else if (result === 'failed') failed += 1;
      else if (result === 'pending') pending += 1;
      else skipped += 1;
    } catch (error) {
      console.warn('[SocialPublishing] reconcilePublishingPost failed', {
        scheduledPostId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      });
      skipped += 1;
    }
  }

  return { checked, published, failed, pending, skipped };
}

async function scanSocialConnectionReliability(): Promise<{ checked: number; alerts: number }> {
  const snapshot = await db
    .collection('socialAccounts')
    .where('status', '==', 'connected')
    .limit(500)
    .get();

  let checked = 0;
  let alerts = 0;

  for (const doc of snapshot.docs) {
    const account = {
      ...(doc.data() as SocialAccountDoc),
      socialAccountId: typeof doc.data().socialAccountId === 'string' ? doc.data().socialAccountId : doc.id,
    };
    checked += 1;

    const expiry = tokenExpiryState(account);
    if (expiry === 'expired' || expiry === 'expiring') {
      const alertKey = `${expiry}_${account.socialAccountId}_${dayKey()}`;
      const alertRef = db.collection('socialReliabilityAlerts').doc(alertKey);
      const alertSnap = await alertRef.get();
      if (!alertSnap.exists) {
        await alertRef.set({
          ownerId: account.ownerId,
          socialAccountId: account.socialAccountId,
          providerId: account.providerId,
          type: expiry === 'expired' ? 'token_expired' : 'token_expiring',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await notifyPublishStatus(
          account.ownerId,
          expiry === 'expired' ? 'social_token_expired' : 'social_token_expiring',
          expiry === 'expired' ? 'Reconnect social account' : 'Social account token expires soon',
          expiry === 'expired'
            ? `${account.providerLabel || account.providerId} access expired. Reconnect before publishing.`
            : `${account.providerLabel || account.providerId} access may need renewal soon.`,
          '/social'
        );
        alerts += 1;
      }
    }

    const readiness = account.connectionReadiness || {};
    const missingScopes = Array.isArray(readiness.missingScopes) ? readiness.missingScopes : [];
    if (missingScopes.length > 0 || readiness.permissionsVerified === false) {
      const alertKey = `permission_${account.socialAccountId}_${dayKey()}`;
      const alertRef = db.collection('socialReliabilityAlerts').doc(alertKey);
      const alertSnap = await alertRef.get();
      if (!alertSnap.exists) {
        await alertRef.set({
          ownerId: account.ownerId,
          socialAccountId: account.socialAccountId,
          providerId: account.providerId,
          type: 'permission_attention',
          missingScopes,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await notifyPublishStatus(
          account.ownerId,
          'social_permission_attention',
          'Social permissions need attention',
          `${account.providerLabel || account.providerId} is missing required permissions for publishing or analytics.`,
          '/social'
        );
        alerts += 1;
      }
    }
  }

  return { checked, alerts };
}

export const publishScheduledSocialPosts = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeZone: 'UTC',
    secrets: [socialCredentialsMasterKey],
  },
  async () => {
    const summary = await processScheduledPosts();
    console.log('[SocialPublishing] publishScheduledSocialPosts', summary);
  }
);

export const reconcileSocialPublishStatuses = onSchedule(
  {
    schedule: '*/10 * * * *',
    timeZone: 'UTC',
    secrets: [socialCredentialsMasterKey],
  },
  async () => {
    const summary = await reconcilePublishingStatuses();
    console.log('[SocialPublishing] reconcileSocialPublishStatuses', summary);
  }
);

export const scanSocialConnectionReliabilityAlerts = onSchedule(
  {
    schedule: '0 */6 * * *',
    timeZone: 'UTC',
  },
  async () => {
    const summary = await scanSocialConnectionReliability();
    console.log('[SocialPublishing] scanSocialConnectionReliabilityAlerts', summary);
  }
);
