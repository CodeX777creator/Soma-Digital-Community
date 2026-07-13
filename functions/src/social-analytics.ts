import * as admin from 'firebase-admin';
import crypto from 'crypto';
import axios from 'axios';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineBoolean, defineInt, defineSecret, defineString } from 'firebase-functions/params';

const db = admin.firestore();

const socialCredentialsMasterKey = defineSecret('SOCIAL_CREDENTIALS_MASTER_KEY');
const socialAnalyticsEnabled = defineBoolean('SOCIAL_ANALYTICS_SYNC_ENABLED', { default: false });
const socialAnalyticsBatchSize = defineInt('SOCIAL_ANALYTICS_BATCH_SIZE', { default: 25 });
const socialAnalyticsLookbackDays = defineInt('SOCIAL_ANALYTICS_LOOKBACK_DAYS', { default: 30 });
const socialAnalyticsEndpoint = defineString('SOCIAL_ANALYTICS_ENDPOINT', { default: '' });
const socialAnalyticsEndpointTikTok = defineString('SOCIAL_ANALYTICS_ENDPOINT_TIKTOK', { default: '' });
const socialAnalyticsEndpointInstagram = defineString('SOCIAL_ANALYTICS_ENDPOINT_INSTAGRAM', { default: '' });
const socialAnalyticsEndpointFacebook = defineString('SOCIAL_ANALYTICS_ENDPOINT_FACEBOOK', { default: '' });
const socialAnalyticsEndpointLinkedIn = defineString('SOCIAL_ANALYTICS_ENDPOINT_LINKEDIN', { default: '' });
const socialAnalyticsEndpointX = defineString('SOCIAL_ANALYTICS_ENDPOINT_X', { default: '' });
const socialAnalyticsEndpointYouTube = defineString('SOCIAL_ANALYTICS_ENDPOINT_YOUTUBE', { default: '' });
const socialAnalyticsAdapterSecret = defineString('SOCIAL_ANALYTICS_ADAPTER_SECRET', { default: '' });
const socialAnalyticsAdapterRegion = defineString('SOCIAL_ANALYTICS_ADAPTER_REGION', { default: 'us-central1' });

type SocialPlatform = 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'youtube';

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
  providerLabel?: string;
  accountName?: string;
  handle?: string;
  providerAccountId?: string;
  status: string;
  connectionType?: 'oauth' | 'manual' | 'imported';
  hasCredentials: boolean;
  credentialEnvelope?: EncryptedPayload | null;
  metadata?: Record<string, unknown>;
  scopes?: string[];
  lastSyncedAt?: admin.firestore.Timestamp | null;
}

interface DecryptedCredentials {
  accessToken?: string;
  refreshToken?: string;
  externalAccountId?: string;
  tokenType?: string;
}

interface NormalizedSocialAnalytics {
  reach: number | null;
  impressions: number | null;
  clicks: number | null;
  followers: number | null;
  engagement: number | null;
  posts: number | null;
  profileViews: number | null;
  videoViews: number | null;
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

function getProviderEndpoint(providerId: SocialPlatform): string {
  const providerEndpointMap: Record<SocialPlatform, string> = {
    tiktok: socialAnalyticsEndpointTikTok.value(),
    instagram: socialAnalyticsEndpointInstagram.value(),
    facebook: socialAnalyticsEndpointFacebook.value(),
    linkedin: socialAnalyticsEndpointLinkedIn.value(),
    x: socialAnalyticsEndpointX.value(),
    youtube: socialAnalyticsEndpointYouTube.value(),
  };

  return providerEndpointMap[providerId] || socialAnalyticsEndpoint.value() || getDefaultAdapterEndpoint(providerId);
}

function getDefaultAdapterEndpoint(providerId: SocialPlatform): string {
  const projectId = process.env.GCLOUD_PROJECT
    || process.env.GCP_PROJECT
    || safeProjectIdFromFirebaseConfig(process.env.FIREBASE_CONFIG);
  if (!projectId) return '';

  const functionNames: Record<SocialPlatform, string> = {
    tiktok: 'socialAnalyticsTikTok',
    instagram: 'socialAnalyticsInstagram',
    facebook: 'socialAnalyticsFacebook',
    linkedin: 'socialAnalyticsLinkedIn',
    x: 'socialAnalyticsX',
    youtube: 'socialAnalyticsYouTube',
  };
  return `https://${socialAnalyticsAdapterRegion.value()}-${projectId}.cloudfunctions.net/${functionNames[providerId]}`;
}

function safeProjectIdFromFirebaseConfig(rawConfig?: string): string {
  if (!rawConfig) return '';
  try {
    const parsed = JSON.parse(rawConfig) as { projectId?: string };
    return parsed.projectId || '';
  } catch {
    return '';
  }
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function findMetric(payload: unknown, keys: string[], depth = 0): number | null {
  if (!payload || depth > 5) return null;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = findMetric(item, keys, depth + 1);
      if (value !== null) return value;
    }
    return null;
  }

  if (typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const lowerKeyMap = Object.keys(record).reduce<Record<string, string>>((acc, key) => {
    acc[key.toLowerCase()] = key;
    return acc;
  }, {});

  for (const key of keys) {
    const matchedKey = lowerKeyMap[key.toLowerCase()];
    if (matchedKey) {
      const direct = asNumber(record[matchedKey]);
      if (direct !== null) return direct;
      if (record[matchedKey] && typeof record[matchedKey] === 'object') {
        const nested = findMetric(record[matchedKey], ['value', 'total', 'count'], depth + 1);
        if (nested !== null) return nested;
      }
    }
  }

  for (const value of Object.values(record)) {
    const nested = findMetric(value, keys, depth + 1);
    if (nested !== null) return nested;
  }

  return null;
}

function normalizeAnalytics(providerId: SocialPlatform, payload: unknown): NormalizedSocialAnalytics {
  return {
    reach: findMetric(payload, ['monthlyReach', 'reach', 'totalReach']),
    impressions: findMetric(payload, ['monthlyImpressions', 'impressions', 'totalImpressions', 'views']),
    clicks: findMetric(payload, ['monthlyClicks', 'clicks', 'linkClicks', 'websiteClicks', 'profileClicks']),
    followers: findMetric(payload, ['followers', 'followerCount', 'followersCount', 'subscriberCount']),
    engagement: findMetric(payload, ['engagement', 'engagements', 'engagementCount', 'likes', 'likesCount']),
    posts: findMetric(payload, providerId === 'youtube' ? ['videoCount', 'posts', 'uploads'] : ['posts', 'postCount', 'videoCount']),
    profileViews: findMetric(payload, ['profileViews', 'profile_view', 'profileVisits']),
    videoViews: findMetric(payload, ['videoViews', 'video_views', 'playCount', 'views']),
  };
}

function buildAnalyticsMetadata(normalized: NormalizedSocialAnalytics, syncedAt: admin.firestore.Timestamp): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    analyticsLastSyncedAt: syncedAt,
  };

  if (normalized.reach !== null) metadata.monthlyReach = normalized.reach;
  if (normalized.impressions !== null) metadata.monthlyImpressions = normalized.impressions;
  if (normalized.clicks !== null) metadata.monthlyClicks = normalized.clicks;
  if (normalized.followers !== null) metadata.followers = normalized.followers;
  if (normalized.engagement !== null) metadata.engagement = normalized.engagement;
  if (normalized.posts !== null) metadata.postCount = normalized.posts;
  if (normalized.profileViews !== null) metadata.profileViews = normalized.profileViews;
  if (normalized.videoViews !== null) metadata.videoViews = normalized.videoViews;

  return metadata;
}

function getPeriod(lookbackDays: number) {
  const until = new Date();
  const since = new Date(until.getTime() - Math.max(1, lookbackDays) * 24 * 60 * 60 * 1000);
  return {
    since: since.toISOString(),
    until: until.toISOString(),
  };
}

async function fetchProviderAnalytics(
  account: SocialAccountDoc,
  credentials: DecryptedCredentials,
  endpoint: string,
  lookbackDays: number
): Promise<unknown> {
  const period = getPeriod(lookbackDays);
  const response = await axios.post(
    endpoint,
    {
      providerId: account.providerId,
      socialAccountId: account.socialAccountId,
      providerAccountId: account.providerAccountId,
      externalAccountId: credentials.externalAccountId,
      handle: account.handle,
      accountName: account.accountName,
      scopes: account.scopes || [],
      period,
    },
    {
      timeout: 20_000,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-SDC-Social-Provider': account.providerId,
        'X-SDC-Social-Account-Id': account.socialAccountId,
        ...(socialAnalyticsAdapterSecret.value() ? { 'X-SDC-Analytics-Secret': socialAnalyticsAdapterSecret.value() } : {}),
      },
      validateStatus: (status) => status >= 200 && status < 500,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Analytics endpoint returned ${response.status}: ${JSON.stringify(response.data).slice(0, 500)}`);
  }

  return response.data;
}

async function writeAnalyticsSnapshot(
  account: SocialAccountDoc,
  normalized: NormalizedSocialAnalytics,
  rawPayload: unknown,
  syncedAt: admin.firestore.Timestamp
) {
  const snapshotRef = db.collection('socialAnalyticsSnapshots').doc();
  const period = getPeriod(socialAnalyticsLookbackDays.value());
  await snapshotRef.set({
    socialAnalyticsSnapshotId: snapshotRef.id,
    ownerId: account.ownerId,
    socialAccountId: account.socialAccountId,
    providerId: account.providerId,
    providerAccountId: account.providerAccountId || null,
    accountName: account.accountName || null,
    handle: account.handle || null,
    period,
    metrics: normalized,
    rawPayload,
    status: 'synced',
    syncedAt,
    createdAt: syncedAt,
  });
}

async function syncAccountAnalytics(doc: admin.firestore.QueryDocumentSnapshot): Promise<'synced' | 'skipped' | 'failed'> {
  const account = doc.data() as SocialAccountDoc;
  const accountId = account.socialAccountId || doc.id;
  const endpoint = getProviderEndpoint(account.providerId);
  const syncedAt = admin.firestore.Timestamp.now();

  if (!endpoint) {
    await doc.ref.set({
      metadata: {
        ...(account.metadata || {}),
        analyticsSyncStatus: 'skipped',
        analyticsLastSkippedAt: syncedAt,
        analyticsLastError: 'No analytics endpoint configured for provider.',
      },
      updatedAt: syncedAt,
    }, { merge: true });
    return 'skipped';
  }

  try {
    const credentials = decryptCredentials(account.credentialEnvelope || null);
    if (!credentials?.accessToken) {
      throw new Error('Connected account has no access token.');
    }

    const rawPayload = await fetchProviderAnalytics(account, credentials, endpoint, socialAnalyticsLookbackDays.value());
    const normalized = normalizeAnalytics(account.providerId, rawPayload);
    await writeAnalyticsSnapshot({ ...account, socialAccountId: accountId }, normalized, rawPayload, syncedAt);
    await doc.ref.set({
      metadata: {
        ...(account.metadata || {}),
        ...buildAnalyticsMetadata(normalized, syncedAt),
        analyticsSyncStatus: 'synced',
        analyticsLastError: null,
      },
      lastSyncedAt: syncedAt,
      updatedAt: syncedAt,
    }, { merge: true });
    return 'synced';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await doc.ref.set({
      metadata: {
        ...(account.metadata || {}),
        analyticsSyncStatus: 'failed',
        analyticsLastFailedAt: syncedAt,
        analyticsLastError: message.slice(0, 500),
      },
      lastError: message.slice(0, 500),
      updatedAt: syncedAt,
    }, { merge: true });
    return 'failed';
  }
}

export async function syncSocialAnalyticsBatch() {
  if (!socialAnalyticsEnabled.value()) {
    return { processed: 0, synced: 0, skipped: 0, failed: 0, enabled: false };
  }

  const limit = Math.max(1, Math.min(100, socialAnalyticsBatchSize.value()));
  const snapshot = await db
    .collection('socialAccounts')
    .where('connectionType', '==', 'oauth')
    .limit(limit)
    .get();

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    const account = doc.data() as SocialAccountDoc;
    if (account.status !== 'connected') {
      skipped += 1;
      continue;
    }
    const result = await syncAccountAnalytics(doc);
    if (result === 'synced') synced += 1;
    if (result === 'skipped') skipped += 1;
    if (result === 'failed') failed += 1;
  }

  return { processed: snapshot.size, synced, skipped, failed, enabled: true };
}

export const syncSocialAccountAnalytics = onSchedule(
  {
    schedule: '0 */6 * * *',
    timeZone: 'UTC',
    secrets: [socialCredentialsMasterKey],
  },
  async () => {
    const summary = await syncSocialAnalyticsBatch();
    console.log('[SocialAnalytics] syncSocialAccountAnalytics', summary);
  }
);
