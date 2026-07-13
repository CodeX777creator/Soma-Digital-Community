export const SOCIAL_PLATFORMS = [
  'tiktok',
  'instagram',
  'facebook',
  'linkedin',
  'x',
  'youtube',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_ACCOUNT_STATUSES = [
  'connected',
  'pending',
  'expired',
  'disconnected',
  'error',
] as const;

export type SocialAccountStatus = (typeof SOCIAL_ACCOUNT_STATUSES)[number];

export interface SocialProviderDefinition {
  id: SocialPlatform;
  label: string;
  description: string;
  connectLabel: string;
  notes: string;
}

export interface SocialCredentialPayload {
  connectionType?: 'oauth' | 'manual' | 'imported';
  accessToken?: string;
  refreshToken?: string;
  externalAccountId?: string;
  expiresInSeconds?: number;
  tokenType?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

export interface EncryptedPayload {
  algorithm: 'aes-256-gcm';
  keyVersion: 'v1';
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface SocialAccountInput {
  providerId: SocialPlatform;
  accountName: string;
  connectionType?: 'oauth' | 'manual' | 'imported';
  handle?: string;
  providerAccountId?: string;
  notes?: string;
  timezone?: string;
  scopes?: string[];
  status?: SocialAccountStatus;
  credentials?: SocialCredentialPayload | null;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export interface SocialAccountUpdateInput {
  accountName?: string;
  connectionType?: 'oauth' | 'manual' | 'imported';
  handle?: string;
  providerAccountId?: string;
  notes?: string;
  timezone?: string;
  scopes?: string[];
  status?: SocialAccountStatus;
  credentials?: SocialCredentialPayload | null;
  metadata?: Record<string, unknown>;
}

export interface SocialAccountRecord {
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
  expiresAt?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  metadata: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
  disconnectedAt?: string | null;
}

export interface SocialHubSummary {
  totalAccounts: number;
  connectedAccounts: number;
  pendingAccounts: number;
  expiredAccounts: number;
  disconnectedAccounts: number;
  byProvider: Record<SocialPlatform, number>;
}

export const SOCIAL_CAMPAIGN_STATUSES = [
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
] as const;

export type SocialCampaignStatus = (typeof SOCIAL_CAMPAIGN_STATUSES)[number];

export interface SocialCampaignInput {
  campaignName: string;
  platform?: SocialPlatform;
  goal?: string;
  status?: SocialCampaignStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  color?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SocialCampaignUpdateInput {
  campaignName?: string;
  platform?: SocialPlatform;
  goal?: string;
  status?: SocialCampaignStatus;
  startDate?: string;
  endDate?: string;
  notes?: string;
  color?: string;
  metadata?: Record<string, unknown>;
}

export interface SocialCampaignRecord {
  socialCampaignId: string;
  ownerId: string;
  campaignName: string;
  platform?: SocialPlatform;
  goal?: string;
  status: SocialCampaignStatus;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string;
  color?: string;
  metadata: Record<string, unknown>;
  scheduledPostCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export const SCHEDULED_POST_STATUSES = [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'editing',
  'cancelled',
] as const;

export type ScheduledPostStatus = (typeof SCHEDULED_POST_STATUSES)[number];
export type { ScheduledPostContentType } from './capabilities';

export interface ScheduledPostInput {
  platform: SocialPlatform;
  socialAccountId?: string;
  connectedAccountId?: string;
  publicationGroupId?: string;
  contentType?: import('./capabilities').ScheduledPostContentType;
  scheduledTime: string;
  caption: string;
  hashtags?: string[];
  cta?: string;
  title?: string;
  assetIds?: string[];
  campaignId?: string;
  notes?: string;
  timezone?: string;
  status?: ScheduledPostStatus;
  platformSettings?: Record<string, unknown>;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ScheduledPostUpdateInput {
  platform?: SocialPlatform;
  socialAccountId?: string;
  connectedAccountId?: string;
  publicationGroupId?: string;
  contentType?: import('./capabilities').ScheduledPostContentType;
  scheduledTime?: string;
  caption?: string;
  hashtags?: string[];
  cta?: string;
  title?: string;
  assetIds?: string[];
  campaignId?: string;
  notes?: string;
  timezone?: string;
  status?: ScheduledPostStatus;
  platformSettings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ScheduledPostRecord {
  scheduledPostId: string;
  ownerId: string;
  platform: SocialPlatform;
  socialAccountId?: string;
  connectedAccountId?: string;
  publicationGroupId?: string;
  contentType?: import('./capabilities').ScheduledPostContentType;
  status: ScheduledPostStatus;
  scheduledTime: string;
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
  createdAt?: string | null;
  updatedAt?: string | null;
  attemptCount?: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  publishLeaseId?: string | null;
  publishLeaseExpiresAt?: string | null;
  publishedBy?: string | null;
  publishedAt?: string | null;
  failedAt?: string | null;
  lastError?: string | null;
  externalPostId?: string | null;
  providerPostId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  publishProviderResponse?: string | null;
}

export interface ContentCalendarSummary {
  totalPosts: number;
  byStatus: Record<ScheduledPostStatus, number>;
  byPlatform: Record<SocialPlatform, number>;
  upcomingPosts: number;
}

export const SOCIAL_PUBLISH_ATTEMPT_STATUSES = [
  'processing',
  'success',
  'failed',
  'skipped',
] as const;

export type SocialPublishAttemptStatus = (typeof SOCIAL_PUBLISH_ATTEMPT_STATUSES)[number];

export interface SocialPublishAttemptInput {
  scheduledPostId: string;
  ownerId: string;
  platform: SocialPlatform;
  socialAccountId?: string;
  attemptNumber: number;
  status: SocialPublishAttemptStatus;
  triggeredAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  externalPostId?: string | null;
  errorMessage?: string | null;
  providerResponse?: string | null;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
}

export interface SocialPublishAttemptRecord extends SocialPublishAttemptInput {
  publishAttemptId: string;
}
