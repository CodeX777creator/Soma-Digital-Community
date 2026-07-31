import * as admin from 'firebase-admin';
import crypto from 'crypto';
import axios from 'axios';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineBoolean, defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { createInternalServiceToken } from './internal-auth';
import { readRuntimeSecret } from './runtime-config';
import { runScheduledJob } from './job-telemetry';

const db = admin.firestore();

const socialCredentialsMasterKey = defineSecret('SOCIAL_CREDENTIALS_MASTER_KEY');
const socialAnalyticsEnabled = defineBoolean('SOCIAL_ANALYTICS_SYNC_ENABLED', { default: false });
const socialAnalyticsBatchSize = defineInt('SOCIAL_ANALYTICS_BATCH_SIZE', { default: 25 });
const socialAnalyticsLookbackDays = defineInt('SOCIAL_ANALYTICS_LOOKBACK_DAYS', { default: 30 });
const socialAnalyticsMinIntervalMinutes = defineInt('SOCIAL_ANALYTICS_MIN_INTERVAL_MINUTES', { default: 360 });
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

interface ScheduledPostDoc {
  scheduledPostId: string;
  ownerId: string;
  platform: SocialPlatform;
  socialAccountId?: string;
  connectedAccountId?: string;
  publicationGroupId?: string;
  status: string;
  scheduledTime?: admin.firestore.Timestamp;
  publishedAt?: admin.firestore.Timestamp | null;
  providerPostId?: string | null;
  externalPostId?: string | null;
  caption?: string;
  title?: string;
}

interface NormalizedSocialPostAnalytics {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  views: number;
  reach: number;
  impressions: number;
  engagementRate: number;
  providerPermalink: string | null;
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
  const rawKey = readRuntimeSecret('SOCIAL_CREDENTIALS_MASTER_KEY', socialCredentialsMasterKey);
  if (!rawKey || !rawKey.trim()) {
    throw new Error('Missing SOCIAL_CREDENTIALS_MASTER_KEY secret');
  }

  return decodeMasterKey(rawKey);
}

function getAnalyticsAdapterHeaders(): Record<string, string> {
  if (socialAnalyticsAdapterSecret.value()) {
    return { 'X-SDC-Analytics-Secret': socialAnalyticsAdapterSecret.value() };
  }

  const rawKey = readRuntimeSecret('SOCIAL_CREDENTIALS_MASTER_KEY', socialCredentialsMasterKey);
  return { 'X-SDC-Analytics-Token': createInternalServiceToken(rawKey) };
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

function normalizePostAnalytics(payload: unknown): NormalizedSocialPostAnalytics {
  const likes = findMetric(payload, ['likes', 'likeCount', 'likesCount', 'like_count', 'favorite_count']) || 0;
  const comments = findMetric(payload, ['comments', 'commentCount', 'commentsCount', 'comment_count']) || 0;
  const shares = findMetric(payload, ['shares', 'shareCount', 'sharesCount', 'share_count', 'retweet_count']) || 0;
  const saves = findMetric(payload, ['saves', 'saveCount', 'saved', 'savedCount']) || 0;
  const clicks = findMetric(payload, ['clicks', 'clickCount', 'linkClicks', 'url_link_clicks']) || 0;
  const views = findMetric(payload, ['views', 'viewCount', 'playCount', 'videoViews', 'video_view_count', 'impressions']) || 0;
  const reach = findMetric(payload, ['reach', 'totalReach']) || 0;
  const impressions = findMetric(payload, ['impressions', 'impressionCount', 'views', 'viewCount']) || 0;
  const engagementBase = reach || impressions || views;
  const engagements = likes + comments + shares + saves + clicks;
  const engagementRate = engagementBase > 0 ? Number(((engagements / engagementBase) * 100).toFixed(2)) : 0;
  const permalink = findString(payload, ['providerPermalink', 'permalink', 'permalink_url', 'url', 'webUrl', 'shareUrl']);

  return {
    likes,
    comments,
    shares,
    saves,
    clicks,
    views,
    reach,
    impressions,
    engagementRate,
    providerPermalink: permalink,
  };
}

function findString(payload: unknown, keys: string[], depth = 0): string | null {
  if (!payload || depth > 5) return null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = findString(item, keys, depth + 1);
      if (value) return value;
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
    const matched = lowerKeyMap[key.toLowerCase()];
    if (matched && typeof record[matched] === 'string' && record[matched]) {
      return record[matched] as string;
    }
  }
  for (const value of Object.values(record)) {
    const nested = findString(value, keys, depth + 1);
    if (nested) return nested;
  }
  return null;
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
        ...getAnalyticsAdapterHeaders(),
      },
      validateStatus: (status) => status >= 200 && status < 500,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Analytics endpoint returned ${response.status}: ${JSON.stringify(response.data).slice(0, 500)}`);
  }

  return response.data;
}

async function fetchProviderPostAnalytics(
  account: SocialAccountDoc,
  credentials: DecryptedCredentials,
  endpoint: string,
  post: ScheduledPostDoc,
  lookbackDays: number
): Promise<unknown> {
  const period = getPeriod(lookbackDays);
  const response = await axios.post(
    endpoint,
    {
      analyticsKind: 'post',
      providerId: account.providerId,
      socialAccountId: account.socialAccountId,
      providerAccountId: account.providerAccountId,
      externalAccountId: credentials.externalAccountId,
      handle: account.handle,
      accountName: account.accountName,
      scopes: account.scopes || [],
      period,
      post: {
        scheduledPostId: post.scheduledPostId,
        providerPostId: post.providerPostId || post.externalPostId,
        externalPostId: post.externalPostId || post.providerPostId,
        platform: post.platform,
        title: post.title || null,
        caption: post.caption || null,
        publishedAt: post.publishedAt?.toDate?.().toISOString?.() || null,
      },
    },
    {
      timeout: 20_000,
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
        'X-SDC-Social-Provider': account.providerId,
        'X-SDC-Social-Account-Id': account.socialAccountId,
        'X-SDC-Social-Post-Id': post.scheduledPostId,
        ...getAnalyticsAdapterHeaders(),
      },
      validateStatus: (status) => status >= 200 && status < 500,
    }
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Post analytics endpoint returned ${response.status}: ${JSON.stringify(response.data).slice(0, 500)}`);
  }

  return response.data;
}

async function writeAnalyticsSnapshot(
  account: SocialAccountDoc,
  normalized: NormalizedSocialAnalytics,
  rawPayload: unknown,
  syncedAt: admin.firestore.Timestamp
) {
  const dayKey = syncedAt.toDate().toISOString().slice(0, 10);
  const snapshotRef = db.collection('socialAnalyticsSnapshots').doc(`account_${account.socialAccountId}_${dayKey}`);
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

async function writePostAnalytics(
  post: ScheduledPostDoc,
  account: SocialAccountDoc,
  normalized: NormalizedSocialPostAnalytics,
  rawPayload: unknown,
  syncedAt: admin.firestore.Timestamp
) {
  const analyticsId = `post_${post.scheduledPostId}`;
  await db.collection('socialPostAnalytics').doc(analyticsId).set({
    analyticsId,
    ownerId: post.ownerId,
    scheduledPostId: post.scheduledPostId,
    socialAccountId: post.connectedAccountId || post.socialAccountId || account.socialAccountId,
    publicationGroupId: post.publicationGroupId || null,
    platform: post.platform,
    providerPostId: post.providerPostId || post.externalPostId || null,
    externalPostId: post.externalPostId || post.providerPostId || null,
    providerPermalink: normalized.providerPermalink,
    metrics: {
      likes: normalized.likes,
      comments: normalized.comments,
      shares: normalized.shares,
      saves: normalized.saves,
      clicks: normalized.clicks,
      views: normalized.views,
      reach: normalized.reach,
      impressions: normalized.impressions,
      engagementRate: normalized.engagementRate,
    },
    rawPayload,
    status: 'synced',
    lastSyncedAt: syncedAt,
    updatedAt: syncedAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const dayKey = syncedAt.toDate().toISOString().slice(0, 10);
  const snapshotRef = db.collection('socialAnalyticsSnapshots').doc(`post_${post.scheduledPostId}_${dayKey}`);
  await snapshotRef.set({
    socialAnalyticsSnapshotId: snapshotRef.id,
    ownerId: post.ownerId,
    socialAccountId: post.connectedAccountId || post.socialAccountId || account.socialAccountId,
    scheduledPostId: post.scheduledPostId,
    providerId: post.platform,
    providerAccountId: account.providerAccountId || null,
    providerPostId: post.providerPostId || post.externalPostId || null,
    accountName: account.accountName || null,
    handle: account.handle || null,
    period: getPeriod(socialAnalyticsLookbackDays.value()),
    metrics: normalized,
    rawPayload,
    status: 'post_synced',
    syncedAt,
    createdAt: syncedAt,
  });
}

async function syncAccountAnalytics(doc: admin.firestore.QueryDocumentSnapshot): Promise<'synced' | 'skipped' | 'failed'> {
  const account = doc.data() as SocialAccountDoc;
  const accountId = account.socialAccountId || doc.id;
  const endpoint = getProviderEndpoint(account.providerId);
  const syncedAt = admin.firestore.Timestamp.now();
  const lastSyncedAt = account.lastSyncedAt?.toMillis?.() || 0;
  if (lastSyncedAt && syncedAt.toMillis() - lastSyncedAt < socialAnalyticsMinIntervalMinutes.value() * 60 * 1000) {
    return 'skipped';
  }

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
    const credentials = await readCredentials({ ...account, socialAccountId: accountId });
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

async function pickSocialAccount(ownerId: string, platform: SocialPlatform, accountId?: string): Promise<{ id: string; account: SocialAccountDoc } | null> {
  if (accountId) {
    const direct = await db.collection('socialAccounts').doc(accountId).get();
    if (direct.exists) {
      const account = direct.data() as SocialAccountDoc;
      if (account.ownerId === ownerId && account.providerId === platform) {
        return { id: direct.id, account: { ...account, socialAccountId: account.socialAccountId || direct.id } };
      }
    }
  }

  const snapshot = await db
    .collection('socialAccounts')
    .where('ownerId', '==', ownerId)
    .where('providerId', '==', platform)
    .where('status', '==', 'connected')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  const account = doc.data() as SocialAccountDoc;
  return { id: doc.id, account: { ...account, socialAccountId: account.socialAccountId || doc.id } };
}

async function syncPostAnalytics(doc: admin.firestore.QueryDocumentSnapshot): Promise<'synced' | 'skipped' | 'failed'> {
  const rawPost = doc.data() as ScheduledPostDoc;
  const post: ScheduledPostDoc = {
    ...rawPost,
    scheduledPostId: typeof rawPost.scheduledPostId === 'string' ? rawPost.scheduledPostId : doc.id,
  };
  const providerPostId = post.providerPostId || post.externalPostId;
  const syncedAt = admin.firestore.Timestamp.now();

  if (!providerPostId) {
    await doc.ref.set({
      metadata: {
        ...(rawPost as unknown as { metadata?: Record<string, unknown> }).metadata,
        postAnalyticsSyncStatus: 'skipped',
        postAnalyticsLastSkippedAt: syncedAt,
        postAnalyticsLastError: 'No provider post ID available.',
      },
      updatedAt: syncedAt,
    }, { merge: true });
    return 'skipped';
  }

  const endpoint = getProviderEndpoint(post.platform);
  if (!endpoint) return 'skipped';

  try {
    const picked = await pickSocialAccount(post.ownerId, post.platform, post.connectedAccountId || post.socialAccountId);
    if (!picked) throw new Error(`No connected ${post.platform} account found for post analytics.`);
    const credentials = await readCredentials(picked.account);
    if (!credentials?.accessToken) throw new Error('Connected account has no access token.');

    const rawPayload = await fetchProviderPostAnalytics(picked.account, credentials, endpoint, post, socialAnalyticsLookbackDays.value());
    const normalized = normalizePostAnalytics(rawPayload);
    await writePostAnalytics(post, picked.account, normalized, rawPayload, syncedAt);
    await doc.ref.set({
      metadata: {
        ...(rawPost as unknown as { metadata?: Record<string, unknown> }).metadata,
        postAnalyticsSyncStatus: 'synced',
        postAnalyticsLastSyncedAt: syncedAt,
        postAnalyticsLastError: null,
      },
      updatedAt: syncedAt,
    }, { merge: true });
    return 'synced';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.collection('socialPostAnalytics').doc(`post_${post.scheduledPostId}`).set({
      analyticsId: `post_${post.scheduledPostId}`,
      ownerId: post.ownerId,
      scheduledPostId: post.scheduledPostId,
      socialAccountId: post.connectedAccountId || post.socialAccountId || null,
      publicationGroupId: post.publicationGroupId || null,
      platform: post.platform,
      providerPostId,
      externalPostId: post.externalPostId || providerPostId,
      metrics: {
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        views: 0,
        reach: 0,
        impressions: 0,
        engagementRate: 0,
      },
      status: 'failed',
      rawPayload: { error: message.slice(0, 500) },
      lastSyncedAt: syncedAt,
      updatedAt: syncedAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await doc.ref.set({
      metadata: {
        ...(rawPost as unknown as { metadata?: Record<string, unknown> }).metadata,
        postAnalyticsSyncStatus: 'failed',
        postAnalyticsLastFailedAt: syncedAt,
        postAnalyticsLastError: message.slice(0, 500),
      },
      updatedAt: syncedAt,
    }, { merge: true });
    return 'failed';
  }
}

async function syncPostAnalyticsBatch() {
  const limit = Math.max(1, Math.min(100, socialAnalyticsBatchSize.value()));
  const cursorRef = db.collection('system').doc('social_analytics_post_cursor');
  const cursorSnap = await cursorRef.get();
  const cursorId = cursorSnap.exists ? cursorSnap.data()?.lastScheduledPostId as string | undefined : undefined;
  let postsQuery = db
    .collection('scheduledPosts')
    .where('status', '==', 'published')
    .orderBy('__name__')
    .limit(limit);
  if (cursorId) {
    const cursorDoc = await db.collection('scheduledPosts').doc(cursorId).get();
    if (cursorDoc.exists) postsQuery = postsQuery.startAfter(cursorDoc);
  }
  const snapshot = await postsQuery.get();

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of snapshot.docs) {
    const result = await syncPostAnalytics(doc);
    if (result === 'synced') synced += 1;
    if (result === 'skipped') skipped += 1;
    if (result === 'failed') failed += 1;
  }

  await cursorRef.set({
    lastScheduledPostId: snapshot.size === limit ? snapshot.docs[snapshot.docs.length - 1].id : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { processed: snapshot.size, synced, skipped, failed };
}

export async function syncSocialAnalyticsBatch() {
  if (!socialAnalyticsEnabled.value()) {
    return { processed: 0, synced: 0, skipped: 0, failed: 0, enabled: false };
  }

  const limit = Math.max(1, Math.min(100, socialAnalyticsBatchSize.value()));
  const cursorRef = db.collection('system').doc('social_analytics_account_cursor');
  const cursorSnap = await cursorRef.get();
  const cursorId = cursorSnap.exists ? cursorSnap.data()?.lastSocialAccountId as string | undefined : undefined;
  let accountsQuery = db
    .collection('socialAccounts')
    .where('connectionType', '==', 'oauth')
    .where('status', '==', 'connected')
    .orderBy('__name__')
    .limit(limit);
  if (cursorId) {
    const cursorDoc = await db.collection('socialAccounts').doc(cursorId).get();
    if (cursorDoc.exists) accountsQuery = accountsQuery.startAfter(cursorDoc);
  }
  const snapshot = await accountsQuery.get();

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

  await cursorRef.set({
    lastSocialAccountId: snapshot.size === limit ? snapshot.docs[snapshot.docs.length - 1].id : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const posts = await syncPostAnalyticsBatch();

  return { processed: snapshot.size, synced, skipped, failed, postAnalytics: posts, enabled: true };
}

export const syncSocialAccountAnalytics = onSchedule(
  {
    schedule: '0 */6 * * *',
    timeZone: 'UTC',
    secrets: [socialCredentialsMasterKey],
  },
  async () => {
    await runScheduledJob('syncSocialAccountAnalytics', async () => syncSocialAnalyticsBatch());
  }
);
