import { admin, adminDb } from '@/lib/firebaseAdmin';
import { sanitizeString } from '@/lib/security';
import { logger } from '@/lib/logger';
import { getSocialProvider, SOCIAL_PROVIDER_REGISTRY } from './providers';
import { sealSocialPayload } from './credentials';
import { getDefaultContentType, getPlatformCapability, isScheduledPostContentType } from './capabilities';
import type {
  ContentCalendarSummary,
  EncryptedPayload,
  SocialCampaignInput,
  SocialCampaignRecord,
  SocialCampaignStatus,
  SocialCampaignUpdateInput,
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
  ScheduledPostContentType,
  SocialPublishAttemptInput,
  SocialPublishAttemptRecord,
  SocialPublishAttemptStatus,
  NormalizedSocialMediaItem,
  NormalizedSocialPublishPayload,
} from './types';

type SocialAccountDoc = {
  socialAccountId: string;
  ownerId: string;
  providerId: SocialPlatform;
  providerLabel: string;
  accountName: string;
  connectionType?: 'oauth' | 'manual' | 'imported';
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

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}

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
    connectionType: doc.connectionType,
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

export async function listSocialCampaigns(ownerId: string): Promise<SocialCampaignRecord[]> {
  const snapshot = await adminDb
    .collection('socialCampaigns')
    .where('ownerId', '==', ownerId)
    .get();

  const campaigns = snapshot.docs.map((doc) => {
    const data = doc.data() as SocialCampaignDoc;
    return serializeCampaign({
      ...data,
      socialCampaignId: typeof data.socialCampaignId === 'string' ? data.socialCampaignId : doc.id,
    });
  });

  const postSnapshot = await adminDb
    .collection('scheduledPosts')
    .where('ownerId', '==', ownerId)
    .get();

  const counts = postSnapshot.docs.reduce<Record<string, number>>((acc, doc) => {
    const data = doc.data() as ScheduledPostDoc;
    if (!data.campaignId) return acc;
    acc[data.campaignId] = (acc[data.campaignId] || 0) + 1;
    return acc;
  }, {});

  return campaigns
    .map((campaign) => ({
      ...campaign,
      scheduledPostCount: counts[campaign.socialCampaignId] || 0,
    }))
    .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')));
}

export async function createSocialCampaign(input: SocialCampaignInput): Promise<SocialCampaignRecord> {
  const ownerId = input.userId || 'anonymous';
  const campaignName = normalizeCampaignName(input.campaignName);
  const campaignId = adminDb.collection('socialCampaigns').doc().id;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const doc: SocialCampaignDoc = {
    socialCampaignId: campaignId,
    ownerId,
    campaignName,
    platform: input.platform,
    goal: input.goal ? sanitizeString(input.goal, 500) : undefined,
    status: normalizeCampaignStatus(input.status),
    startDate: normalizeCampaignDate(input.startDate),
    endDate: normalizeCampaignDate(input.endDate),
    notes: input.notes ? sanitizeString(input.notes, 1000) : undefined,
    color: input.color ? sanitizeString(input.color, 24) : undefined,
    metadata: normalizeMetadata(input.metadata),
    createdAt: now,
    updatedAt: now,
  };

  await adminDb.collection('socialCampaigns').doc(campaignId).set(doc);
  logger.info('[Social] Created campaign', { socialCampaignId: campaignId, ownerId, campaignName });
  return serializeCampaign(doc);
}

async function readSocialCampaignOrThrow(ownerId: string, campaignId: string): Promise<SocialCampaignDoc> {
  const snapshot = await adminDb.collection('socialCampaigns').doc(campaignId).get();
  if (!snapshot.exists) {
    throw new Error('Campaign not found');
  }

  const data = snapshot.data() as SocialCampaignDoc;
  if (data.ownerId !== ownerId) {
    throw new Error('Campaign not found');
  }

  return {
    ...data,
    socialCampaignId: typeof data.socialCampaignId === 'string' ? data.socialCampaignId : snapshot.id,
  };
}

export async function updateSocialCampaign(
  ownerId: string,
  campaignId: string,
  patch: SocialCampaignUpdateInput
): Promise<SocialCampaignRecord> {
  const current = await readSocialCampaignOrThrow(ownerId, campaignId);
  const updated: SocialCampaignDoc = {
    ...current,
    campaignName: patch.campaignName ? normalizeCampaignName(patch.campaignName) : current.campaignName,
    platform: patch.platform || current.platform,
    goal: patch.goal !== undefined ? sanitizeString(patch.goal || '', 500) || undefined : current.goal,
    status: patch.status || current.status,
    startDate: patch.startDate !== undefined ? normalizeCampaignDate(patch.startDate) : current.startDate || null,
    endDate: patch.endDate !== undefined ? normalizeCampaignDate(patch.endDate) : current.endDate || null,
    notes: patch.notes !== undefined ? sanitizeString(patch.notes || '', 1000) || undefined : current.notes,
    color: patch.color !== undefined ? sanitizeString(patch.color || '', 24) || undefined : current.color,
    metadata: patch.metadata ? normalizeMetadata(patch.metadata) : current.metadata,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await adminDb.collection('socialCampaigns').doc(campaignId).set(updated, { merge: true });
  logger.info('[Social] Updated campaign', { socialCampaignId: campaignId, ownerId, status: updated.status });
  return serializeCampaign(updated);
}

export async function deleteSocialCampaign(ownerId: string, campaignId: string): Promise<void> {
  await readSocialCampaignOrThrow(ownerId, campaignId);
  await adminDb.collection('socialCampaigns').doc(campaignId).delete();
  logger.info('[Social] Deleted campaign', { socialCampaignId: campaignId, ownerId });
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
  const connectionType = input.connectionType
    || input.credentials?.connectionType
    || (credentialEnvelope ? 'oauth' : 'manual');
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = adminDb.collection('socialAccounts').doc();

  const doc = stripUndefined<SocialAccountDoc>({
    socialAccountId: docRef.id,
    ownerId,
    providerId: provider.id,
    providerLabel: provider.label,
    accountName,
    connectionType,
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
  });

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
  const connectionType = patch.connectionType
    || patch.credentials?.connectionType
    || current.connectionType
    || (credentialEnvelope ? 'oauth' : 'manual');
  const nextStatus = patch.status || (credentialEnvelope ? 'connected' : current.status);
  const updated = stripUndefined<SocialAccountDoc>({
    ...current,
    providerLabel: provider.label,
    accountName: patch.accountName ? normalizeAccountName(patch.accountName) : current.accountName,
    connectionType,
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
  });

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
  providerPostId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  publishProviderResponse?: string | null;
};

type SocialCampaignDoc = {
  socialCampaignId: string;
  ownerId: string;
  campaignName: string;
  platform?: SocialPlatform;
  goal?: string;
  status: SocialCampaignStatus;
  startDate?: admin.firestore.Timestamp | null;
  endDate?: admin.firestore.Timestamp | null;
  notes?: string;
  color?: string;
  metadata: Record<string, unknown>;
  createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
  updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
};

type GeneratedAssetDoc = {
  assetId?: string;
  ownerId?: string;
  createdBy?: string;
  type?: string;
  mimeType?: string;
  status?: string;
  renderState?: string;
  downloadUrl?: string;
  thumbnail?: string;
  storagePath?: string;
};

type SocialPublishAttemptDoc = {
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
  metadata: Record<string, unknown>;
  createdAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
  updatedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
};

function createValidationError(message: string, code = 'INVALID_SCHEDULED_POST'): Error {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = 400;
  error.code = code;
  return error;
}

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

function normalizeHashtags(hashtags?: string[]): string[] {
  return Array.from(
    new Set(
      (hashtags || [])
        .map((item) => sanitizeString(item.replace(/^#/, ''), 80).trim())
        .filter(Boolean)
    )
  ).slice(0, 30);
}

function normalizePublicationGroupId(value?: string): string | undefined {
  return value ? sanitizeString(value, 160) || undefined : undefined;
}

function normalizeContentType(platform: SocialPlatform, value?: ScheduledPostContentType): ScheduledPostContentType {
  return value && isScheduledPostContentType(value) ? value : getDefaultContentType(platform);
}

function inferAssetKind(asset: GeneratedAssetDoc): ScheduledPostContentType | 'audio' | 'unknown' {
  if (asset.type === 'image' || asset.type === 'video' || asset.type === 'document') {
    return asset.type;
  }

  if (typeof asset.mimeType === 'string') {
    if (asset.mimeType.startsWith('image/')) return 'image';
    if (asset.mimeType.startsWith('video/')) return 'video';
    if (asset.mimeType.startsWith('audio/')) return 'audio';
    if (asset.mimeType.includes('pdf') || asset.mimeType.includes('document')) return 'document';
  }

  if (asset.thumbnail && !asset.downloadUrl && asset.type === 'audio') return 'audio';
  return 'unknown';
}

function normalizeMediaItemType(kind: ScheduledPostContentType | 'audio' | 'unknown'): NormalizedSocialMediaItem['type'] {
  if (kind === 'image' || kind === 'video' || kind === 'document' || kind === 'audio') {
    return kind;
  }
  return 'unknown';
}

function buildFinalSocialText(caption: string, hashtags?: string[], cta?: string): string {
  const parts = [caption.trim()];
  const normalizedTags = normalizeHashtags(hashtags);
  if (normalizedTags.length > 0) {
    parts.push(normalizedTags.map((tag) => `#${tag}`).join(' '));
  }
  if (cta?.trim()) {
    parts.push(cta.trim());
  }
  return parts.filter(Boolean).join('\n\n');
}

function normalizeAttemptTime(value?: string | null): admin.firestore.Timestamp | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(parsed);
}

function serializePublishAttempt(doc: SocialPublishAttemptDoc): SocialPublishAttemptRecord {
  return {
    publishAttemptId: doc.publishAttemptId,
    scheduledPostId: doc.scheduledPostId,
    ownerId: doc.ownerId,
    platform: doc.platform,
    socialAccountId: doc.socialAccountId,
    publicationGroupId: doc.publicationGroupId,
    provider: doc.provider,
    contentType: doc.contentType,
    attemptNumber: doc.attemptNumber,
    status: doc.status,
    triggeredAt: toIso(doc.triggeredAt) || new Date().toISOString(),
    startedAt: toIso(doc.startedAt),
    finishedAt: toIso(doc.finishedAt),
    durationMs: doc.durationMs ?? null,
    externalPostId: doc.externalPostId || null,
    providerPostId: doc.providerPostId || doc.externalPostId || null,
    failureCode: doc.failureCode || null,
    errorMessage: doc.errorMessage || null,
    providerResponse: doc.providerResponse || null,
    retryable: Boolean(doc.retryable),
    payloadVersion: doc.payloadVersion || 'social-publish-v1',
    metadata: doc.metadata || {},
  };
}

async function resolveGeneratedAsset(assetId: string): Promise<GeneratedAssetDoc | null> {
  const snapshot = await adminDb.collection('generatedAssets').doc(assetId).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as GeneratedAssetDoc;
}

async function validateConnectedAccount(input: {
  ownerId: string;
  platform: SocialPlatform;
  connectedAccountId?: string;
  requireConnected: boolean;
}): Promise<void> {
  if (!input.connectedAccountId) {
    if (input.requireConnected) {
      throw createValidationError('Choose a connected destination account before scheduling this post.', 'DESTINATION_REQUIRED');
    }
    return;
  }

  if (!input.requireConnected) {
    return;
  }

  const snapshot = await adminDb.collection('socialAccounts').doc(input.connectedAccountId).get();
  if (!snapshot.exists) {
    throw createValidationError('The selected social account could not be found.', 'DESTINATION_NOT_FOUND');
  }

  const account = snapshot.data() as SocialAccountDoc;
  if (account.ownerId !== input.ownerId || account.providerId !== input.platform) {
    throw createValidationError('The selected social account does not match this post destination.', 'DESTINATION_MISMATCH');
  }

  if (input.requireConnected && account.status !== 'connected') {
    throw createValidationError('The selected social account is not connected.', 'DESTINATION_DISCONNECTED');
  }
}

async function validateAssetIds(input: {
  ownerId: string;
  platform: SocialPlatform;
  contentType: ScheduledPostContentType;
  status: ScheduledPostStatus;
  assetIds: string[];
}): Promise<void> {
  const capability = getPlatformCapability(input.platform);
  const publishable = input.status !== 'draft' && input.status !== 'editing';

  if (!capability.supportedContentTypes.includes(input.contentType)) {
    throw createValidationError(`${input.platform} does not support ${input.contentType} scheduled posts.`, 'UNSUPPORTED_CONTENT_TYPE');
  }

  if (capability.maxAssets && input.assetIds.length > capability.maxAssets) {
    throw createValidationError(`${input.platform} supports a maximum of ${capability.maxAssets} media asset(s).`, 'TOO_MANY_ASSETS');
  }

  if (publishable && input.contentType === 'carousel' && input.assetIds.length < 2) {
    throw createValidationError('Carousel posts need at least two ordered assets.', 'CAROUSEL_ASSETS_REQUIRED');
  }

  if (publishable && (capability.mediaRequired || input.contentType !== 'text') && input.assetIds.length === 0) {
    throw createValidationError(`${input.platform} ${input.contentType} posts need a completed media asset.`, 'MEDIA_REQUIRED');
  }

  if (input.assetIds.length === 0) return;

  const snapshots = await Promise.all(input.assetIds.map((assetId) => adminDb.collection('generatedAssets').doc(assetId).get()));
  snapshots.forEach((snapshot, index) => {
    const assetId = input.assetIds[index];
    if (!snapshot.exists) {
      throw createValidationError(`Media asset ${assetId} could not be found.`, 'ASSET_NOT_FOUND');
    }

    const asset = snapshot.data() as GeneratedAssetDoc;
    const assetOwner = asset.ownerId || asset.createdBy;
    if (assetOwner !== input.ownerId) {
      throw createValidationError('You can only schedule media assets that belong to your account.', 'ASSET_OWNER_MISMATCH');
    }

    if (asset.status && asset.status !== 'completed') {
      throw createValidationError('Only completed generated assets can be scheduled.', 'ASSET_NOT_READY');
    }

    if (asset.renderState && asset.renderState !== 'completed') {
      throw createValidationError('Only completed video renders can be scheduled.', 'ASSET_NOT_READY');
    }

    const assetKind = inferAssetKind(asset);
    if (publishable && !capability.supportedAssetKinds.includes(assetKind as ScheduledPostContentType)) {
      throw createValidationError(`${input.platform} does not support the selected ${assetKind} asset.`, 'ASSET_TYPE_UNSUPPORTED');
    }

    if (publishable && input.contentType === 'video' && assetKind !== 'video') {
      throw createValidationError('Video posts require a completed video asset.', 'VIDEO_ASSET_REQUIRED');
    }

    if (publishable && input.contentType === 'image' && assetKind !== 'image') {
      throw createValidationError('Image posts require a completed image asset.', 'IMAGE_ASSET_REQUIRED');
    }

    if (publishable && input.contentType === 'document' && assetKind !== 'document') {
      throw createValidationError('Document posts require a completed document asset.', 'DOCUMENT_ASSET_REQUIRED');
    }
  });
}

async function validateScheduledPostDocument(doc: ScheduledPostDoc): Promise<void> {
  if (doc.metadata?.calendarMode === 'events') {
    return;
  }

  const capability = getPlatformCapability(doc.platform);
  const publishable = doc.status !== 'draft' && doc.status !== 'editing';
  const caption = (doc.caption || '').trim();
  const scheduledAt = doc.scheduledTime.toDate().getTime();

  if (publishable && scheduledAt < Date.now() - 60_000) {
    throw createValidationError('Scheduled posts cannot be placed in the past. Save it as a draft instead.', 'SCHEDULED_TIME_IN_PAST');
  }

  if (capability.maxCaptionLength && caption.length > capability.maxCaptionLength) {
    throw createValidationError(`${doc.platform} captions must be ${capability.maxCaptionLength} characters or fewer.`, 'CAPTION_TOO_LONG');
  }

  if (publishable && doc.contentType === 'text' && !caption) {
    throw createValidationError('Text posts need a caption before scheduling.', 'CAPTION_REQUIRED');
  }

  validatePlatformSettings(doc.platform, doc.platformSettings || {});

  await validateConnectedAccount({
    ownerId: doc.ownerId,
    platform: doc.platform,
    connectedAccountId: doc.connectedAccountId || doc.socialAccountId,
    requireConnected: publishable,
  });

  await validateAssetIds({
    ownerId: doc.ownerId,
    platform: doc.platform,
    contentType: doc.contentType || getDefaultContentType(doc.platform),
    status: doc.status,
    assetIds: doc.assetIds || [],
  });
}

function validatePlatformSettings(platform: SocialPlatform, settings: Record<string, unknown>): void {
  if (platform === 'tiktok') {
    const privacyLevel = settings.privacyLevel;
    if (privacyLevel !== undefined && !['public', 'friends', 'private'].includes(String(privacyLevel))) {
      throw createValidationError('TikTok privacy must be public, friends, or private.', 'INVALID_PLATFORM_SETTINGS');
    }
    return;
  }

  if (platform === 'youtube') {
    const visibility = settings.visibility;
    if (visibility !== undefined && !['public', 'unlisted', 'private'].includes(String(visibility))) {
      throw createValidationError('YouTube visibility must be public, unlisted, or private.', 'INVALID_PLATFORM_SETTINGS');
    }
    const title = settings.title;
    if (typeof title === 'string' && title.length > 100) {
      throw createValidationError('YouTube titles must be 100 characters or fewer.', 'INVALID_PLATFORM_SETTINGS');
    }
    return;
  }

  if (platform === 'instagram') {
    const publishAs = settings.publishAs;
    if (publishAs !== undefined && !['feed', 'reel', 'story'].includes(String(publishAs))) {
      throw createValidationError('Instagram format must be feed, reel, or story.', 'INVALID_PLATFORM_SETTINGS');
    }
    return;
  }

  if (platform === 'linkedin') {
    const destinationType = settings.destinationType;
    if (destinationType !== undefined && !['profile', 'organization'].includes(String(destinationType))) {
      throw createValidationError('LinkedIn destination must be profile or organization.', 'INVALID_PLATFORM_SETTINGS');
    }
  }
}

function serializeScheduledPost(doc: ScheduledPostDoc): ScheduledPostRecord {
  return {
    scheduledPostId: doc.scheduledPostId,
    ownerId: doc.ownerId,
    platform: doc.platform,
    socialAccountId: doc.socialAccountId,
    connectedAccountId: doc.connectedAccountId || doc.socialAccountId,
    publicationGroupId: doc.publicationGroupId,
    contentType: doc.contentType || getDefaultContentType(doc.platform),
    status: doc.status,
    scheduledTime: doc.scheduledTime.toDate().toISOString(),
    title: doc.title,
    caption: doc.caption,
    hashtags: doc.hashtags || [],
    cta: doc.cta,
    assetIds: doc.assetIds || [],
    campaignId: doc.campaignId,
    notes: doc.notes,
    timezone: doc.timezone,
    platformSettings: doc.platformSettings || {},
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
    providerPostId: doc.providerPostId || doc.externalPostId || null,
    failureCode: doc.failureCode || null,
    failureMessage: doc.failureMessage || doc.lastError || null,
    publishProviderResponse: doc.publishProviderResponse || null,
  };
}

function normalizeCampaignName(name: string): string {
  const value = sanitizeString(name, 140).trim();
  if (!value) {
    throw new Error('Campaign name is required');
  }
  return value;
}

function normalizeCampaignStatus(status?: SocialCampaignStatus): SocialCampaignStatus {
  return status || 'draft';
}

function normalizeCampaignDate(value?: string): admin.firestore.Timestamp | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(parsed);
}

function serializeCampaign(doc: SocialCampaignDoc, scheduledPostCount = 0): SocialCampaignRecord {
  return {
    socialCampaignId: doc.socialCampaignId,
    ownerId: doc.ownerId,
    campaignName: doc.campaignName,
    platform: doc.platform,
    goal: doc.goal,
    status: doc.status,
    startDate: toIso(doc.startDate),
    endDate: toIso(doc.endDate),
    notes: doc.notes,
    color: doc.color,
    metadata: doc.metadata || {},
    scheduledPostCount,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
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
  const connectedAccountId = input.connectedAccountId || input.socialAccountId;
  const docRef = adminDb.collection('scheduledPosts').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const doc = stripUndefined<ScheduledPostDoc>({
    scheduledPostId: docRef.id,
    ownerId,
    platform: input.platform,
    socialAccountId: connectedAccountId ? sanitizeString(connectedAccountId, 160) : undefined,
    connectedAccountId: connectedAccountId ? sanitizeString(connectedAccountId, 160) : undefined,
    publicationGroupId: normalizePublicationGroupId(input.publicationGroupId),
    contentType: normalizeContentType(input.platform, input.contentType),
    status,
    scheduledTime,
    title: input.title ? sanitizeString(input.title, 160) : undefined,
    caption: sanitizeString(input.caption, 5000),
    hashtags: normalizeHashtags(input.hashtags),
    cta: input.cta ? sanitizeString(input.cta, 500) : undefined,
    assetIds: normalizeAssetIds(input.assetIds),
    campaignId: input.campaignId ? sanitizeString(input.campaignId, 120) : undefined,
    notes: input.notes ? sanitizeString(input.notes, 1000) : undefined,
    timezone: input.timezone ? sanitizeString(input.timezone, 80) : undefined,
    platformSettings: input.platformSettings ? normalizeMetadata(input.platformSettings) : undefined,
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
    providerPostId: null,
    failureCode: null,
    failureMessage: null,
    publishProviderResponse: null,
  });

  await validateScheduledPostDocument(doc);
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
  const platform = patch.platform || current.platform;
  const connectedAccountId = patch.connectedAccountId !== undefined || patch.socialAccountId !== undefined
    ? sanitizeString((patch.connectedAccountId || patch.socialAccountId || ''), 160) || undefined
    : current.connectedAccountId || current.socialAccountId;

  const updated = stripUndefined<ScheduledPostDoc>({
    ...current,
    platform,
    socialAccountId: connectedAccountId,
    connectedAccountId,
    publicationGroupId: patch.publicationGroupId !== undefined ? normalizePublicationGroupId(patch.publicationGroupId) : current.publicationGroupId,
    contentType: patch.contentType !== undefined ? normalizeContentType(platform, patch.contentType) : current.contentType || getDefaultContentType(platform),
    status,
    scheduledTime,
    title: patch.title !== undefined ? sanitizeString(patch.title || '', 160) || undefined : current.title,
    caption: patch.caption !== undefined ? sanitizeString(patch.caption || '', 5000) : current.caption,
    hashtags: patch.hashtags !== undefined ? normalizeHashtags(patch.hashtags) : current.hashtags || [],
    cta: patch.cta !== undefined ? sanitizeString(patch.cta || '', 500) || undefined : current.cta,
    assetIds: patch.assetIds ? normalizeAssetIds(patch.assetIds) : current.assetIds,
    campaignId: patch.campaignId !== undefined ? sanitizeString(patch.campaignId || '', 120) || undefined : current.campaignId,
    notes: patch.notes !== undefined ? sanitizeString(patch.notes || '', 1000) || undefined : current.notes,
    timezone: patch.timezone !== undefined ? sanitizeString(patch.timezone || '', 80) || undefined : current.timezone,
    platformSettings: patch.platformSettings !== undefined ? normalizeMetadata(patch.platformSettings) : current.platformSettings || {},
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
    providerPostId: current.providerPostId || current.externalPostId || null,
    failureCode: current.failureCode || null,
    failureMessage: status === 'failed' ? current.failureMessage || current.lastError || 'Scheduled post failed' : current.failureMessage || null,
    publishProviderResponse: current.publishProviderResponse || null,
  });

  await validateScheduledPostDocument(updated);
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
  if (['published', 'publishing', 'cancelled'].includes(current.status)) {
    const error = new Error('This post can no longer be moved.') as Error & { status?: number; code?: string };
    error.status = 400;
    error.code = 'POST_MOVE_LOCKED';
    throw error;
  }
  return updateScheduledPost(ownerId, postId, {
    scheduledTime,
    status: 'scheduled',
  });
}

export async function deleteScheduledPost(ownerId: string, postId: string): Promise<void> {
  await readScheduledPostOrThrow(ownerId, postId);
  await adminDb.collection('scheduledPosts').doc(postId).delete();
  logger.info('[Social] Deleted scheduled post', { scheduledPostId: postId, ownerId });
}

export async function buildNormalizedPublishPayload(
  ownerId: string,
  postId: string
): Promise<NormalizedSocialPublishPayload> {
  const post = await readScheduledPostOrThrow(ownerId, postId);
  const connectedAccountId = post.connectedAccountId || post.socialAccountId;
  const account = connectedAccountId
    ? await adminDb.collection('socialAccounts').doc(connectedAccountId).get().then((snapshot) => snapshot.exists ? snapshot.data() as SocialAccountDoc : null)
    : null;

  if (account && account.ownerId !== ownerId) {
    throw createValidationError('The selected social account does not belong to this user.', 'DESTINATION_OWNER_MISMATCH');
  }

  const mediaItems = await Promise.all((post.assetIds || []).map(async (assetId, index): Promise<NormalizedSocialMediaItem> => {
    const asset = await resolveGeneratedAsset(assetId);
    const assetKind = asset ? inferAssetKind(asset) : 'unknown';
    return {
      assetId,
      order: index,
      type: normalizeMediaItemType(assetKind),
      mimeType: asset?.mimeType,
      downloadUrl: asset?.downloadUrl,
      thumbnail: asset?.thumbnail,
      storagePath: asset?.storagePath,
    };
  }));

  const contentType = post.contentType || getDefaultContentType(post.platform);
  const hashtags = normalizeHashtags(post.hashtags);
  const caption = post.caption || '';
  const finalText = buildFinalSocialText(caption, hashtags, post.cta);

  return {
    payloadVersion: 'social-publish-v1',
    scheduledPostId: post.scheduledPostId,
    ownerId: post.ownerId,
    publicationGroupId: post.publicationGroupId,
    platform: post.platform,
    connectedAccountId,
    destination: {
      socialAccountId: connectedAccountId,
      providerAccountId: account?.providerAccountId,
      accountName: account?.accountName,
      handle: account?.handle,
      status: account?.status,
    },
    content: {
      contentType,
      caption,
      hashtags,
      cta: post.cta,
      finalText,
      mediaItems,
    },
    scheduling: {
      scheduledTime: post.scheduledTime.toDate().toISOString(),
      timezone: post.timezone,
      status: post.status,
    },
    platformSettings: post.platformSettings || {},
    metadata: {
      ...post.metadata,
      providerPostId: post.providerPostId || post.externalPostId || null,
      failureCode: post.failureCode || null,
      failureMessage: post.failureMessage || post.lastError || null,
    },
  };
}

export async function listSocialPublishAttempts(
  ownerId: string,
  options: { scheduledPostId?: string; limit?: number } = {}
): Promise<SocialPublishAttemptRecord[]> {
  let query: FirebaseFirestore.Query = adminDb
    .collection('socialPublishAttempts')
    .where('ownerId', '==', ownerId);

  if (options.scheduledPostId) {
    query = query.where('scheduledPostId', '==', sanitizeString(options.scheduledPostId, 160));
  }

  const snapshot = await query
    .orderBy('triggeredAt', 'desc')
    .limit(Math.min(Math.max(options.limit || 20, 1), 100))
    .get();

  return snapshot.docs.map((doc) => serializePublishAttempt({
    ...(doc.data() as SocialPublishAttemptDoc),
    publishAttemptId: typeof doc.data().publishAttemptId === 'string' ? doc.data().publishAttemptId : doc.id,
  }));
}

export async function recordSocialPublishAttempt(input: SocialPublishAttemptInput): Promise<SocialPublishAttemptRecord> {
  const ref = adminDb.collection('socialPublishAttempts').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const doc = stripUndefined<SocialPublishAttemptDoc>({
    publishAttemptId: ref.id,
    scheduledPostId: sanitizeString(input.scheduledPostId, 160),
    ownerId: sanitizeString(input.ownerId, 160),
    platform: input.platform,
    socialAccountId: input.socialAccountId ? sanitizeString(input.socialAccountId, 160) : undefined,
    publicationGroupId: input.publicationGroupId ? sanitizeString(input.publicationGroupId, 160) : undefined,
    provider: input.provider ? sanitizeString(input.provider, 80) : undefined,
    contentType: input.contentType,
    attemptNumber: Math.max(1, Math.floor(input.attemptNumber || 1)),
    status: input.status,
    triggeredAt: normalizeAttemptTime(input.triggeredAt) || admin.firestore.Timestamp.now(),
    startedAt: normalizeAttemptTime(input.startedAt),
    finishedAt: normalizeAttemptTime(input.finishedAt),
    durationMs: typeof input.durationMs === 'number' ? Math.max(0, Math.floor(input.durationMs)) : null,
    externalPostId: input.externalPostId ? sanitizeString(input.externalPostId, 240) : null,
    providerPostId: input.providerPostId ? sanitizeString(input.providerPostId, 240) : input.externalPostId ? sanitizeString(input.externalPostId, 240) : null,
    failureCode: input.failureCode ? sanitizeString(input.failureCode, 120) : null,
    errorMessage: input.errorMessage ? sanitizeString(input.errorMessage, 1000) : null,
    providerResponse: input.providerResponse ? sanitizeString(input.providerResponse, 4000) : null,
    retryable: Boolean(input.retryable),
    payloadVersion: input.payloadVersion || 'social-publish-v1',
    metadata: normalizeMetadata(input.metadata),
    createdAt: now,
    updatedAt: now,
  });

  await ref.set(doc);
  return serializePublishAttempt(doc);
}

export async function applySocialPublishOutcome(input: {
  ownerId: string;
  scheduledPostId: string;
  status: Extract<SocialPublishAttemptStatus, 'success' | 'failed' | 'skipped'>;
  providerPostId?: string | null;
  externalPostId?: string | null;
  failureCode?: string | null;
  errorMessage?: string | null;
  providerResponse?: string | null;
  retryable?: boolean;
}): Promise<ScheduledPostRecord> {
  const current = await readScheduledPostOrThrow(input.ownerId, input.scheduledPostId);
  const nextStatus: ScheduledPostStatus = input.status === 'success' ? 'published' : input.status === 'failed' ? 'failed' : current.status;
  const providerPostId = input.providerPostId || input.externalPostId || null;

  return updateScheduledPost(input.ownerId, input.scheduledPostId, {
    status: nextStatus,
    metadata: {
      ...current.metadata,
      lastPublishOutcome: input.status,
      lastProviderResponse: input.providerResponse || null,
      retryable: Boolean(input.retryable),
    },
    platformSettings: current.platformSettings || {},
    // These are persisted below through direct merge because they are operational fields,
    // not public patch input in the regular scheduler UI.
  }).then(async (updated) => {
    await adminDb.collection('scheduledPosts').doc(input.scheduledPostId).set(stripUndefined({
      providerPostId,
      externalPostId: input.externalPostId || providerPostId,
      failureCode: input.failureCode || null,
      failureMessage: input.errorMessage || null,
      lastError: input.status === 'failed' ? input.errorMessage || 'Publish failed' : null,
      publishProviderResponse: input.providerResponse || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }), { merge: true });

    return {
      ...updated,
      providerPostId,
      externalPostId: input.externalPostId || providerPostId,
      failureCode: input.failureCode || null,
      failureMessage: input.errorMessage || null,
      lastError: input.status === 'failed' ? input.errorMessage || 'Publish failed' : null,
      publishProviderResponse: input.providerResponse || null,
    };
  });
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
      publishing: 0,
      published: 0,
      failed: 0,
      editing: 0,
      cancelled: 0,
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

export async function getContentCalendarCampaignSummary(ownerId: string): Promise<{
  totalCampaigns: number;
  byStatus: Record<SocialCampaignStatus, number>;
  activeCampaigns: number;
  campaigns: SocialCampaignRecord[];
}> {
  const campaigns = await listSocialCampaigns(ownerId);
  const byStatus: Record<SocialCampaignStatus, number> = {
    draft: 0,
    active: 0,
    paused: 0,
    completed: 0,
    archived: 0,
  };

  for (const campaign of campaigns) {
    byStatus[campaign.status] += 1;
  }

  return {
    totalCampaigns: campaigns.length,
    activeCampaigns: byStatus.active,
    byStatus,
    campaigns,
  };
}
