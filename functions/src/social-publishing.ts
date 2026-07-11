import * as admin from 'firebase-admin';
import crypto from 'crypto';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { sendNotificationWithPush } from './push-notifications';

const db = admin.firestore();

const socialCredentialsMasterKey = defineSecret('SOCIAL_CREDENTIALS_MASTER_KEY');
const socialPublishEndpoint = defineString('SOCIAL_PUBLISH_ENDPOINT', { default: '' });
const socialPublishEndpointTikTok = defineString('SOCIAL_PUBLISH_ENDPOINT_TIKTOK', { default: '' });
const socialPublishEndpointInstagram = defineString('SOCIAL_PUBLISH_ENDPOINT_INSTAGRAM', { default: '' });
const socialPublishEndpointFacebook = defineString('SOCIAL_PUBLISH_ENDPOINT_FACEBOOK', { default: '' });
const socialPublishEndpointLinkedIn = defineString('SOCIAL_PUBLISH_ENDPOINT_LINKEDIN', { default: '' });
const socialPublishEndpointX = defineString('SOCIAL_PUBLISH_ENDPOINT_X', { default: '' });
const socialPublishEndpointYouTube = defineString('SOCIAL_PUBLISH_ENDPOINT_YOUTUBE', { default: '' });
const socialPublishBatchSize = defineInt('SOCIAL_PUBLISH_BATCH_SIZE', { default: 20 });
const socialPublishMaxAttempts = defineInt('SOCIAL_PUBLISH_MAX_ATTEMPTS', { default: 5 });
const socialPublishRetryDelayMinutes = defineInt('SOCIAL_PUBLISH_RETRY_DELAY_MINUTES', { default: 15 });
const socialPublishLeaseMinutes = defineInt('SOCIAL_PUBLISH_LEASE_MINUTES', { default: 10 });

type SocialPlatform = 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'youtube';
type ScheduledPostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'editing';
type SocialPublishAttemptStatus = 'processing' | 'success' | 'failed' | 'skipped';

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
  expiresAt?: admin.firestore.Timestamp | null;
  lastSyncedAt?: admin.firestore.Timestamp | null;
  lastError?: string | null;
}

interface ScheduledPostDoc {
  scheduledPostId: string;
  ownerId: string;
  platform: SocialPlatform;
  socialAccountId?: string;
  status: ScheduledPostStatus;
  scheduledTime: admin.firestore.Timestamp;
  title?: string;
  caption: string;
  assetIds: string[];
  campaignId?: string;
  notes?: string;
  timezone?: string;
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
  publishProviderResponse?: string | null;
}

interface PublishAttemptDoc {
  publishAttemptId: string;
  scheduledPostId: string;
  ownerId: string;
  platform: SocialPlatform;
  socialAccountId?: string;
  attemptNumber: number;
  status: SocialPublishAttemptStatus;
  triggeredAt: admin.firestore.Timestamp;
  startedAt?: admin.firestore.Timestamp | null;
  finishedAt?: admin.firestore.Timestamp | null;
  externalPostId?: string | null;
  errorMessage?: string | null;
  providerResponse?: string | null;
  retryable?: boolean;
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

function buildPublishPayload(post: ScheduledPostDoc, account: SocialAccountDoc, credentials: DecryptedCredentials | null) {
  return {
    scheduledPostId: post.scheduledPostId,
    ownerId: post.ownerId,
    platform: post.platform,
    socialAccountId: account.socialAccountId,
    accountName: account.accountName,
    providerAccountId: account.providerAccountId,
    handle: account.handle,
    title: post.title,
    caption: post.caption,
    assetIds: post.assetIds || [],
    campaignId: post.campaignId,
    notes: post.notes,
    timezone: post.timezone,
    metadata: jsonClone(post.metadata || {}),
    scheduledTime: post.scheduledTime.toDate().toISOString(),
    credentials: credentials?.externalAccountId ? {
      externalAccountId: credentials.externalAccountId,
    } : undefined,
  };
}

function isEligibleForProcessing(post: ScheduledPostDoc, now: Date): boolean {
  const dueAt = post.scheduledTime.toDate().getTime();
  if (dueAt > now.getTime()) return false;
  if (post.status === 'published') return false;
  if (post.status !== 'scheduled' && post.status !== 'editing' && post.status !== 'failed') return false;

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
  const delayMinutes = Math.max(1, socialPublishRetryDelayMinutes.value() * Math.min(attemptCount, 5));
  const nextRetryAt = retryable && attemptCount < socialPublishMaxAttempts.value()
    ? admin.firestore.Timestamp.fromDate(new Date(Date.now() + delayMinutes * 60 * 1000))
    : null;

  await postRef.set({
    status: 'failed',
    failedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastError: errorMessage.slice(0, 1000),
    externalPostId: externalPostId || post.externalPostId || null,
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
    nextRetryAt: null,
    externalPostId: externalPostId || post.externalPostId || null,
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

async function attemptPublish(post: ScheduledPostDoc, account: SocialAccountDoc): Promise<PublishOutcome> {
  if (!account) {
    return {
      success: false,
      errorMessage: `No connected ${post.platform} account is available for publishing`,
      retryable: false,
    };
  }

  const credentials = decryptCredentials(account.credentialEnvelope || null);
  const endpoint = resolvePublishEndpoint(post.platform, account);
  if (!endpoint) {
    return {
      success: false,
      errorMessage: `No publish endpoint is configured for ${account.providerLabel}`,
      retryable: true,
    };
  }

  const payload = buildPublishPayload(post, account, credentials);
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
      providerResponse,
      retryable: response.status >= 500 || response.status === 429,
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
  };
}

async function processScheduledPosts(): Promise<{
  processed: number;
  published: number;
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
    const account = await pickSocialAccount(claimed.ownerId, claimed.platform, claimed.socialAccountId);

    await recordPublishAttempt({
      publishAttemptId,
      scheduledPostId: claimed.scheduledPostId,
      ownerId: claimed.ownerId,
      platform: claimed.platform,
      socialAccountId: claimed.socialAccountId,
      attemptNumber,
      status: 'processing',
      triggeredAt: admin.firestore.Timestamp.now(),
      startedAt: admin.firestore.Timestamp.now(),
      metadata: {
        scheduledTime: toIso(claimed.scheduledTime),
        title: claimed.title || null,
      },
    });

    try {
      const outcome = account
        ? await attemptPublish(claimed, account)
        : {
            success: false,
            errorMessage: `No connected ${claimed.platform} account is available for publishing`,
            retryable: false,
          };
      if (outcome.success) {
        await markPublishSuccess(doc.ref, claimed, account as SocialAccountDoc, outcome.externalPostId, outcome.providerResponse);
        await updatePublishAttempt(publishAttemptId, {
          status: 'success',
          finishedAt: admin.firestore.Timestamp.now(),
          externalPostId: outcome.externalPostId || null,
          providerResponse: outcome.providerResponse || null,
          retryable: false,
        });
        published += 1;
      } else {
        await markPublishFailure(doc.ref, claimed, outcome.errorMessage || 'Publish failed', outcome.retryable ?? true, outcome.externalPostId, outcome.providerResponse);
        await updatePublishAttempt(publishAttemptId, {
          status: 'failed',
          finishedAt: admin.firestore.Timestamp.now(),
          errorMessage: outcome.errorMessage || 'Publish failed',
          externalPostId: outcome.externalPostId || null,
          providerResponse: outcome.providerResponse || null,
          retryable: outcome.retryable ?? true,
        });
        failed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markPublishFailure(doc.ref, claimed, message, true);
      await updatePublishAttempt(publishAttemptId, {
        status: 'failed',
        finishedAt: admin.firestore.Timestamp.now(),
        errorMessage: message,
        retryable: true,
      });
      failed += 1;
    }
  }

  return { processed, published, failed, skipped };
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
