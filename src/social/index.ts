export {
  createSocialAccount,
  disconnectSocialAccount,
  getSocialHubCapabilities,
  getSocialHubOverview,
  getSocialHubSummary,
  listSocialAccounts,
  listSocialProviders,
  updateSocialAccount,
  createScheduledPost,
  deleteScheduledPost,
  getContentCalendarSummary,
  listScheduledPosts,
  updateScheduledPost,
  moveScheduledPost,
  applySocialPublishOutcome,
  buildNormalizedPublishPayload,
  listSocialPublishAttempts,
  recordSocialPublishAttempt,
} from './service';

export {
  getSocialProvider,
  SOCIAL_PROVIDER_REGISTRY,
} from './providers';

export {
  openSocialPayload,
  sealSocialPayload,
} from './credentials';

export type {
  EncryptedPayload,
  SocialAccountInput,
  SocialAccountRecord,
  SocialAccountStatus,
  SocialAccountUpdateInput,
  SocialCredentialPayload,
  ContentCalendarSummary,
  ScheduledPostInput,
  ScheduledPostRecord,
  ScheduledPostStatus,
  ScheduledPostUpdateInput,
  SocialPublishAttemptInput,
  SocialPublishAttemptRecord,
  SocialPublishAttemptStatus,
  NormalizedSocialMediaItem,
  NormalizedSocialPublishPayload,
  SocialHubSummary,
  SocialPlatform,
  SocialProviderDefinition,
} from './types';
