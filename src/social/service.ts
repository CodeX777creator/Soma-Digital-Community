import { admin, adminDb } from '@/lib/firebaseAdmin';
import { sanitizeString } from '@/lib/security';
import { logger } from '@/lib/logger';
import { getSocialProvider, SOCIAL_PROVIDER_REGISTRY } from './providers';
import { sealSocialPayload } from './credentials';
import type {
  ContentCalendarSummary,
  EncryptedPayload,
  SocialAccountInput,
  SocialAccountRecord,
  SocialAccountStatus,
  SocialAccountUpdateInput,
  ScheduledPostInput,
  ScheduledPostRecord,
  ScheduledPostStatus,
  ScheduledPostUpdateInput,
  SocialCredentialPayload,
  SocialHubSummary,
  SocialPlatform,
} from './types';

type SocialAccountDoc = {
  socialAccountId: string;
  ownerId: string;
  providerId: SocialPlatform;
  providerLabel: string;
  accountName: string;
  handle?: string;
  providerAccountId?: string;
  notes?: string;
  timezone?: string;
  status: SocialAccountStatus;
  scopes: string[];
  hasCredentials: boolean;
  credentialEnvelope?: EncryptedPayload | null;
  expiresAt?: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
  lastSyncedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
  lastError?: string | null;
  metadata: Record<string, unknown>;
  createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
  updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
  disconnectedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue | null;
};

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') return value;
  return null;
}

function normalizeScopes(scopes?: string[]): string[] {
  return Array.from(
    new Set((scopes || []).map((scope) => sanitizeString(scope, 120)).filter(Boolean))
  );
}

function normalizeAccountName(name: string): string {
  const value = sanitizeString(name, 120).trim();
  if (!value) {
    throw new Error('Account name is required');
  }
  return value;
}

function normalizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};

  return Object.entries(metadata).reduce<Record<string, unknown>>((acc, [key, value]) => {
    const safeKey = sanitizeString(key, 80).trim();
    if (!safeKey) return acc;
    if (typeof value === 'string') {
      acc[safeKey] = sanitizeString(value, 500);
      return acc;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      acc[safeKey] = value;
      return acc;
    }
    if (Array.isArray(value)) {
      acc[safeKey] = value.slice(0, 50).map((item) => (typeof item === 'string' ? sanitizeString(item, 120) : item));
      return acc;
    }
    if (value && typeof value === 'object') {
      acc[safeKey] = value;
    }
    return acc;
  }, {});
}

function resolveCredentialEnvelope(credentials?: SocialCredentialPayload | null): EncryptedPayload | null {
  if (!credentials) return null;
  if (!credentials.accessToken && !credentials.refreshToken && !credentials.externalAccountId) {
    return null;
  }
  return sealSocialPayload({
    accessToken: credentials.accessToken || '',
    refreshToken: credentials.refreshToken || '',
    externalAccountId: credentials.externalAccountId || '',
    expiresInSeconds: credentials.expiresInSeconds ?? null,
    tokenType: credentials.tokenType || '',
    scopes: normalizeScopes(credentials.scopes),
    metadata: normalizeMetadata(credentials.metadata),
  });
}

function resolveExpiryTimestamp(credentials?: SocialCredentialPayload | null): admin.firestore.Timestamp | null {
  if (!credentials?.expiresInSeconds || !Number.isFinite(credentials.expiresInSeconds)) {
    return null;
  }

  const expiresInSeconds = Math.max(0, Math.floor(credentials.expiresInSeconds));
  return admin.firestore.Timestamp.fromMillis(Date.now() + expiresInSeconds * 1000);
}

function serializeAccount(doc: SocialAccountDoc): SocialAccountRecord {
  return {
    socialAccountId: doc.socialAccountId,
    ownerId: doc.ownerId,
    providerId: doc.providerId,
    providerLabel: doc.providerLabel,
    accountName: doc.accountName,
    handle: doc.handle,
    providerAccountId: doc.providerAccountId,
    notes: doc.notes,
    timezone: doc.timezone,
    status: doc.status,
    scopes: doc.scopes || [],
    hasCredentials: doc.hasCredentials === true,
    expiresAt: toIso(doc.expiresAt),
    lastSyncedAt: toIso(doc.lastSyncedAt),
    lastError: doc.lastError || null,
    metadata: doc.metadata || {},
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    disconnectedAt: toIso(doc.disconnectedAt),
  };
}

function sortAccounts(accounts: SocialAccountRecord[]): SocialAccountRecord[] {
  return accounts.sort((left, right) => {
    const leftStamp = left.updatedAt || left.createdAt || '';
    const rightStamp = right.updatedAt || right.createdAt || '';
    return String(rightStamp).localeCompare(String(leftStamp));
  });
}

export function listSocialProviders() {
  return SOCIAL_PROVIDER_REGISTRY;
}

export function getSocialHubCapabilities() {
  return {
    providers: SOCIAL_PROVIDER_REGISTRY,
    credentialStorage: 'encrypted-firestore',
    schedulingReady: false,
    publishingReady: false,
  };
}

export async function listSocialAccounts(ownerId: string): Promise<SocialAccountRecord[]> {
  const snapshot = await adminDb
    .collection('socialAccounts')
    .where('ownerId', '==', ownerId)
    .get();

  const records = snapshot.docs.map((doc) => {
    const data = doc.data() as SocialAccountDoc;
    return serializeAccount({
      ...data,
      socialAccountId: typeof data.socialAccountId === 'string' ? data.socialAccountId : doc.id,
    });
  });

  return sortAccounts(records);
}

export async function getSocialHubSummary(ownerId: string): Promise<SocialHubSummary> {
  const overview = await getSocialHubOverview(ownerId);
  return overview.summary;
}

export async function getSocialHubOverview(ownerId: string): Promise<{
  accounts: SocialAccountRecord[];
  summary: SocialHubSummary;
}> {
  const accounts = await listSocialAccounts(ownerId);
  const summary: SocialHubSummary = {
    totalAccounts: accounts.length,
    connectedAccounts: accounts.filter((account) => account.status === 'connected').length,
    pendingAccounts: accounts.filter((account) => account.status === 'pending').length,
    expiredAccounts: accounts.filter((account) => account.status === 'expired').length,
    disconnectedAccounts: accounts.filter((account) => account.status === 'disconnected').length,
    byProvider: {
      tiktok: 0,
      instagram: 0,
      facebook: 0,
      linkedin: 0,
      x: 0,
      youtube: 0,
    },
  };

  for (const account of accounts) {
    summary.byProvider[account.providerId] += 1;
  }

  return { accounts, summary };
}

export async function createSocialAccount(input: SocialAccountInput): Promise<SocialAccountRecord> {
  const provider = getSocialProvider(input.providerId);
  const ownerId = input.userId || 'anonymous';
  const accountName = normalizeAccountName(input.accountName);
  const scopes = normalizeScopes(input.scopes);
  const metadata = normalizeMetadata(input.metadata);
  const credentialEnvelope = resolveCredentialEnvelope(input.credentials);
  const expiresAt = resolveExpiryTimestamp(input.credentials);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = adminDb.collection('socialAccounts').doc();

  const doc: SocialAccountDoc = {
    socialAccountId: docRef.id,
    ownerId,
    providerId: provider.id,
    providerLabel: provider.label,
    accountName,
    handle: input.handle ? sanitizeString(input.handle, 120) : undefined,
    providerAccountId: input.providerAccountId ? sanitizeString(input.providerAccountId, 160) : undefined,
    notes: input.notes ? sanitizeString(input.notes, 500) : undefined,
    timezone: input.timezone ? sanitizeString(input.timezone, 80) : undefined,
    status: input.status || (credentialEnvelope ? 'connected' : 'pending'),
    scopes,
    hasCredentials: credentialEnvelope != null,
    credentialEnvelope,
    expiresAt,
    lastSyncedAt: null,
    lastError: null,
    metadata,
    createdAt: now,
    updatedAt: now,
    disconnectedAt: null,
  };

  await docRef.set(doc);
  logger.info('[Social] Created social account', {
    socialAccountId: doc.socialAccountId,
    ownerId,
    providerId: provider.id,
  });

  return serializeAccount(doc);
}

async function readSocialAccountOrThrow(ownerId: string, accountId: string): Promise<SocialAccountDoc> {
  const docRef = adminDb.collection('socialAccounts').doc(accountId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new Error('Social account not found');
  }

  const data = snapshot.data() as SocialAccountDoc;
  if (data.ownerId !== ownerId) {
    throw new Error('Social account not found');
  }

  return {
    ...data,
    socialAccountId: typeof data.socialAccountId === 'string' ? data.socialAccountId : snapshot.id,
  };
}

export async function updateSocialAccount(
  ownerId: string,
  accountId: string,
  patch: SocialAccountUpdateInput
): Promise<SocialAccountRecord> {
  const current = await readSocialAccountOrThrow(ownerId, accountId);
  const provider = getSocialProvider(current.providerId);
  const credentialEnvelope = patch.credentials === undefined
    ? current.credentialEnvelope || null
    : resolveCredentialEnvelope(patch.credentials);
  const expiresAt = patch.credentials === undefined
    ? current.expiresAt || null
    : resolveExpiryTimestamp(patch.credentials);
  const nextStatus = patch.status || (credentialEnvelope ? 'connected' : current.status);
  const updated: SocialAccountDoc = {
    ...current,
    providerLabel: provider.label,
    accountName: patch.accountName ? normalizeAccountName(patch.accountName) : current.accountName,
    handle: patch.handle !== undefined ? sanitizeString(patch.handle || '', 120) || undefined : current.handle,
    providerAccountId: patch.providerAccountId !== undefined ? sanitizeString(patch.providerAccountId || '', 160) || undefined : current.providerAccountId,
    notes: patch.notes !== undefined ? sanitizeString(patch.notes || '', 500) || undefined : current.notes,
    timezone: patch.timezone !== undefined ? sanitizeString(patch.timezone || '', 80) || undefined : current.timezone,
    scopes: patch.scopes ? normalizeScopes(patch.scopes) : current.scopes,
    status: nextStatus,
    hasCredentials: credentialEnvelope != null,
    credentialEnvelope,
    expiresAt,
    metadata: patch.metadata ? normalizeMetadata(patch.metadata) : current.metadata,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    disconnectedAt: nextStatus === 'disconnected' ? admin.firestore.FieldValue.serverTimestamp() : current.disconnectedAt || null,
  };

  await adminDb.collection('socialAccounts').doc(accountId).set(updated, { merge: true });
  logger.info('[Social] Updated social account', {
    socialAccountId: accountId,
    ownerId,
    providerId: provider.id,
    status: nextStatus,
  });

  return serializeAccount(updated);
}

export async function disconnectSocialAccount(ownerId: string, accountId: string): Promise<SocialAccountRecord> {
  return updateSocialAccount(ownerId, accountId, {
    status: 'disconnected',
    credentials: null,
    metadata: {
      disconnectedReason: 'User requested disconnect',
    },
  });
}

type ScheduledPostDoc = {
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
  metadata: Record<string, unknown>;
  createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
  updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
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
};

function normalizeScheduledStatus(status?: ScheduledPostStatus): ScheduledPostStatus {
  return status || 'draft';
}

function normalizeScheduledTime(value: string): admin.firestore.Timestamp {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid scheduledTime');
  }
  return admin.firestore.Timestamp.fromDate(parsed);
}

function normalizeAssetIds(assetIds?: string[]): string[] {
  return Array.from(new Set((assetIds || []).map((item) => sanitizeString(item, 160)).filter(Boolean)));
}

function serializeScheduledPost(doc: ScheduledPostDoc): ScheduledPostRecord {
  return {
    scheduledPostId: doc.scheduledPostId,
    ownerId: doc.ownerId,
    platform: doc.platform,
    socialAccountId: doc.socialAccountId,
    status: doc.status,
    scheduledTime: doc.scheduledTime.toDate().toISOString(),
    title: doc.title,
    caption: doc.caption,
    assetIds: doc.assetIds || [],
    campaignId: doc.campaignId,
    notes: doc.notes,
    timezone: doc.timezone,
    metadata: doc.metadata || {},
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    attemptCount: typeof doc.attemptCount === 'number' ? doc.attemptCount : undefined,
    lastAttemptAt: toIso(doc.lastAttemptAt),
    nextRetryAt: toIso(doc.nextRetryAt),
    publishLeaseId: doc.publishLeaseId || null,
    publishLeaseExpiresAt: toIso(doc.publishLeaseExpiresAt),
    publishedBy: doc.publishedBy || null,
    publishedAt: toIso(doc.publishedAt),
    failedAt: toIso(doc.failedAt),
    lastError: doc.lastError || null,
    externalPostId: doc.externalPostId || null,
    publishProviderResponse: doc.publishProviderResponse || null,
  };
}

function readScheduledPostOrThrow(ownerId: string, postId: string): Promise<ScheduledPostDoc> {
  return adminDb.collection('scheduledPosts').doc(postId).get().then((snapshot) => {
    if (!snapshot.exists) {
      throw new Error('Scheduled post not found');
    }

    const data = snapshot.data() as ScheduledPostDoc;
    if (data.ownerId !== ownerId) {
      throw new Error('Scheduled post not found');
    }

    return {
      ...data,
      scheduledPostId: typeof data.scheduledPostId === 'string' ? data.scheduledPostId : snapshot.id,
    };
  });
}

export async function createScheduledPost(input: ScheduledPostInput): Promise<ScheduledPostRecord> {
  const ownerId = input.userId || 'anonymous';
  const scheduledTime = normalizeScheduledTime(input.scheduledTime);
  const status = normalizeScheduledStatus(input.status);
  const docRef = adminDb.collection('scheduledPosts').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const doc: ScheduledPostDoc = {
    scheduledPostId: docRef.id,
    ownerId,
    platform: input.platform,
    socialAccountId: input.socialAccountId ? sanitizeString(input.socialAccountId, 160) : undefined,
    status,
    scheduledTime,
    title: input.title ? sanitizeString(input.title, 160) : undefined,
    caption: sanitizeString(input.caption, 5000),
    assetIds: normalizeAssetIds(input.assetIds),
    campaignId: input.campaignId ? sanitizeString(input.campaignId, 120) : undefined,
    notes: input.notes ? sanitizeString(input.notes, 1000) : undefined,
    timezone: input.timezone ? sanitizeString(input.timezone, 80) : undefined,
    metadata: normalizeMetadata(input.metadata),
    attemptCount: 0,
    lastAttemptAt: null,
    nextRetryAt: null,
    publishLeaseId: null,
    publishLeaseExpiresAt: null,
    publishedBy: null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    failedAt: null,
    lastError: null,
    externalPostId: null,
    publishProviderResponse: null,
  };

  await docRef.set(doc);
  logger.info('[Social] Created scheduled post', {
    scheduledPostId: doc.scheduledPostId,
    ownerId,
    platform: doc.platform,
    status: doc.status,
  });

  return serializeScheduledPost(doc);
}

export async function updateScheduledPost(
  ownerId: string,
  postId: string,
  patch: ScheduledPostUpdateInput
): Promise<ScheduledPostRecord> {
  const current = await readScheduledPostOrThrow(ownerId, postId);
  const scheduledTime = patch.scheduledTime ? normalizeScheduledTime(patch.scheduledTime) : current.scheduledTime;
  const status = patch.status || current.status;

  const updated: ScheduledPostDoc = {
    ...current,
    platform: patch.platform || current.platform,
    socialAccountId: patch.socialAccountId !== undefined ? sanitizeString(patch.socialAccountId || '', 160) || undefined : current.socialAccountId,
    status,
    scheduledTime,
    title: patch.title !== undefined ? sanitizeString(patch.title || '', 160) || undefined : current.title,
    caption: patch.caption !== undefined ? sanitizeString(patch.caption || '', 5000) : current.caption,
    assetIds: patch.assetIds ? normalizeAssetIds(patch.assetIds) : current.assetIds,
    campaignId: patch.campaignId !== undefined ? sanitizeString(patch.campaignId || '', 120) || undefined : current.campaignId,
    notes: patch.notes !== undefined ? sanitizeString(patch.notes || '', 1000) || undefined : current.notes,
    timezone: patch.timezone !== undefined ? sanitizeString(patch.timezone || '', 80) || undefined : current.timezone,
    metadata: patch.metadata ? normalizeMetadata(patch.metadata) : current.metadata,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    attemptCount: current.attemptCount ?? 0,
    lastAttemptAt: current.lastAttemptAt || null,
    nextRetryAt: current.nextRetryAt || null,
    publishLeaseId: current.publishLeaseId || null,
    publishLeaseExpiresAt: current.publishLeaseExpiresAt || null,
    publishedBy: current.publishedBy || null,
    publishedAt: status === 'published' ? current.publishedAt || admin.firestore.Timestamp.now() : current.publishedAt || null,
    failedAt: status === 'failed' ? current.failedAt || admin.firestore.Timestamp.now() : current.failedAt || null,
    lastError: status === 'failed' ? current.lastError || 'Scheduled post failed' : current.lastError || null,
    externalPostId: current.externalPostId || null,
    publishProviderResponse: current.publishProviderResponse || null,
  };

  await adminDb.collection('scheduledPosts').doc(postId).set(updated, { merge: true });
  logger.info('[Social] Updated scheduled post', {
    scheduledPostId: postId,
    ownerId,
    platform: updated.platform,
    status: updated.status,
  });

  return serializeScheduledPost(updated);
}

export async function moveScheduledPost(
  ownerId: string,
  postId: string,
  scheduledTime: string
): Promise<ScheduledPostRecord> {
  const current = await readScheduledPostOrThrow(ownerId, postId);
  return updateScheduledPost(ownerId, postId, {
    scheduledTime,
    status: current.status === 'published' ? 'published' : 'scheduled',
  });
}

export async function deleteScheduledPost(ownerId: string, postId: string): Promise<void> {
  await readScheduledPostOrThrow(ownerId, postId);
  await adminDb.collection('scheduledPosts').doc(postId).delete();
  logger.info('[Social] Deleted scheduled post', { scheduledPostId: postId, ownerId });
}

function getMonthBounds(month: string): { start: Date; end: Date } {
  const parsed = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid month');
  }

  const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

export async function listScheduledPosts(
  ownerId: string,
  options: { month?: string; limit?: number } = {}
): Promise<ScheduledPostRecord[]> {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  const month = options.month || new Date().toISOString().slice(0, 7);
  const { start, end } = getMonthBounds(month);

  const snapshot = await adminDb
    .collection('scheduledPosts')
    .where('ownerId', '==', ownerId)
    .where('scheduledTime', '>=', admin.firestore.Timestamp.fromDate(start))
    .where('scheduledTime', '<=', admin.firestore.Timestamp.fromDate(end))
    .orderBy('scheduledTime', 'asc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => serializeScheduledPost({
    ...(doc.data() as ScheduledPostDoc),
    scheduledPostId: typeof doc.data().scheduledPostId === 'string' ? doc.data().scheduledPostId : doc.id,
  }));
}

export async function getContentCalendarSummary(
  ownerId: string,
  month?: string,
  providedPosts?: ScheduledPostRecord[]
): Promise<ContentCalendarSummary> {
  const posts = providedPosts || await listScheduledPosts(ownerId, { month });
  const summary: ContentCalendarSummary = {
    totalPosts: posts.length,
    byStatus: {
      draft: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
      editing: 0,
    },
    byPlatform: {
      tiktok: 0,
      instagram: 0,
      facebook: 0,
      linkedin: 0,
      x: 0,
      youtube: 0,
    },
    upcomingPosts: 0,
  };

  const now = Date.now();
  for (const post of posts) {
    summary.byStatus[post.status] += 1;
    summary.byPlatform[post.platform] += 1;

    const scheduledAt = new Date(post.scheduledTime).getTime();
    if (scheduledAt >= now && post.status !== 'published') {
      summary.upcomingPosts += 1;
    }
  }

  return summary;
}
