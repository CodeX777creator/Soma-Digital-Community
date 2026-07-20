import { requiresMedia } from './capabilities';
import { validatePlatformSettings } from './platform-settings';
import type { ScheduledPostContentType, ScheduledPostRecord, SocialAccountRecord, SocialPlatform } from './types';

export type PublishReadinessStatus =
  | 'ready'
  | 'needs_account_reconnect'
  | 'missing_permission'
  | 'missing_ai_disclosure'
  | 'missing_paid_promotion_disclosure'
  | 'invalid_privacy_setting'
  | 'unsupported_content_type'
  | 'missing_public_media_url'
  | 'media_still_rendering'
  | 'platform_app_review_not_approved'
  | 'not_publish_ready';

export type PublishReadinessIssue = {
  code: PublishReadinessStatus;
  label: string;
  detail: string;
  severity: 'warning' | 'blocking';
};

export type PublishReadinessResult = {
  ready: boolean;
  status: PublishReadinessStatus;
  label: string;
  issues: PublishReadinessIssue[];
  warnings: PublishReadinessIssue[];
};

export type PublishReadinessAsset = {
  assetId: string;
  title?: string;
  type?: string;
  status?: string;
  downloadUrl?: string;
  thumbnail?: string;
  mimeType?: string;
};

type AccountCapabilitySnapshot = {
  directPostSupported: boolean;
  draftUploadSupported: boolean;
  analyticsSupported: boolean;
  appReviewApproved: boolean;
  missingScopes: string[];
  tokenExpired: boolean;
  tokenExpiring: boolean;
};

const READY_LABELS: Record<PublishReadinessStatus, string> = {
  ready: 'Ready to publish',
  needs_account_reconnect: 'Needs account reconnect',
  missing_permission: 'Missing permission',
  missing_ai_disclosure: 'Missing AI disclosure',
  missing_paid_promotion_disclosure: 'Missing paid-promotion disclosure',
  invalid_privacy_setting: 'Invalid privacy setting',
  unsupported_content_type: 'Unsupported content type',
  missing_public_media_url: 'Missing public media URL',
  media_still_rendering: 'Media still rendering',
  platform_app_review_not_approved: 'Platform app-review not approved',
  not_publish_ready: 'Needs attention',
};

function issue(code: PublishReadinessStatus, detail: string, severity: PublishReadinessIssue['severity'] = 'blocking'): PublishReadinessIssue {
  return {
    code,
    label: READY_LABELS[code],
    detail,
    severity,
  };
}

function accountCapabilities(account?: SocialAccountRecord | null): AccountCapabilitySnapshot {
  const readiness = account?.connectionReadiness || (account?.metadata?.connectionReadiness as SocialAccountRecord['connectionReadiness'] | undefined);
  const metadata = account?.metadata || {};
  const scopes = new Set((account?.scopes || []).map((scope) => String(scope)));
  const appReview = metadata.appReviewStatus || metadata.providerAppReviewStatus || metadata.appReviewApproved;

  return {
    directPostSupported: scopes.has('video.publish') || Boolean(metadata.directPostSupported),
    draftUploadSupported: scopes.has('video.upload') || Boolean(metadata.draftUploadSupported),
    analyticsSupported: readiness?.analyticsReady === true || Boolean(metadata.analyticsSupported),
    appReviewApproved: appReview === true || appReview === 'approved' || appReview === 'ready',
    missingScopes: readiness?.missingScopes || [],
    tokenExpired: readiness?.status === 'needs_reauth' || account?.status === 'expired',
    tokenExpiring: Boolean(metadata.tokenExpiring),
  };
}

function hasScope(account: SocialAccountRecord | undefined | null, scope: string): boolean {
  return Boolean(account?.scopes?.includes(scope));
}

function requiredPublishScope(platform: SocialPlatform, settings: Record<string, unknown>): string | null {
  if (platform === 'tiktok') {
    return settings.tiktokPublishMode === 'direct' ? 'video.publish' : 'video.upload';
  }
  if (platform === 'instagram') return 'instagram_business_content_publish';
  if (platform === 'facebook') return 'pages_manage_posts';
  if (platform === 'linkedin') return 'w_member_social';
  if (platform === 'x') return 'tweet.write';
  if (platform === 'youtube') return 'https://www.googleapis.com/auth/youtube.upload';
  return null;
}

function isRendered(asset: PublishReadinessAsset): boolean {
  return ['ready', 'completed', 'published', 'available', 'uploaded'].includes(String(asset.status || '').toLowerCase());
}

function needsAiDisclosure(post: ScheduledPostRecord, assets: PublishReadinessAsset[]): boolean {
  return post.metadata?.aiGenerated === true
    || post.metadata?.generatedByAi === true
    || assets.some((asset) => String(asset.assetId || '').startsWith('generated_'));
}

function needsPaidDisclosure(post: ScheduledPostRecord): boolean {
  return post.metadata?.paidPromotion === true || post.metadata?.brandedContent === true || post.metadata?.sponsored === true;
}

export function evaluatePostPublishReadiness(input: {
  post: ScheduledPostRecord;
  account?: SocialAccountRecord | null;
  assets?: PublishReadinessAsset[];
}): PublishReadinessResult {
  const { post, account } = input;
  const assets = input.assets || [];
  const issues: PublishReadinessIssue[] = [];
  const warnings: PublishReadinessIssue[] = [];
  const contentType = (post.contentType || 'text') as ScheduledPostContentType;
  const settingsResult = validatePlatformSettings(post.platform, post.platformSettings || {}, {
    contentType,
    caption: post.caption,
    title: post.title,
    status: post.status,
    assetCount: post.assetIds?.length || assets.length,
  });

  if (!account) {
    issues.push(issue('needs_account_reconnect', 'Choose a connected destination account before scheduling.'));
  } else if (account.status !== 'connected' || !account.hasCredentials) {
    issues.push(issue('needs_account_reconnect', `${account.providerLabel || account.providerId} needs reconnection before publishing.`));
  } else if (account.lastError) {
    issues.push(issue('needs_account_reconnect', account.lastError));
  }

  const capabilities = accountCapabilities(account);
  if (capabilities.tokenExpired) {
    issues.push(issue('needs_account_reconnect', 'The access token is expired or needs reauthorization.'));
  }
  if (capabilities.tokenExpiring) {
    warnings.push(issue('needs_account_reconnect', 'The access token may expire soon.', 'warning'));
  }

  const requiredScope = requiredPublishScope(post.platform, settingsResult.settings);
  if (account && requiredScope && !hasScope(account, requiredScope)) {
    issues.push(issue('missing_permission', `${account.providerLabel || post.platform} is missing ${requiredScope}.`));
  }
  for (const missingScope of capabilities.missingScopes) {
    if (requiredScope && missingScope === requiredScope) continue;
    warnings.push(issue('missing_permission', `${account?.providerLabel || post.platform} may be missing ${missingScope}.`, 'warning'));
  }

  if (post.platform === 'tiktok') {
    if (settingsResult.settings.tiktokPublishMode === 'direct' && !capabilities.directPostSupported) {
      issues.push(issue('platform_app_review_not_approved', 'TikTok Direct Post is not approved or missing video.publish.'));
    }
    if (settingsResult.settings.tiktokPublishMode !== 'direct' && !capabilities.draftUploadSupported && account) {
      issues.push(issue('missing_permission', 'TikTok Draft Inbox requires video.upload permission.'));
    }
    if (needsAiDisclosure(post, assets) && settingsResult.settings.tiktokAiGenerated !== true) {
      issues.push(issue('missing_ai_disclosure', 'This appears to use AI-generated media. Turn on the TikTok AI-generated content label.'));
    }
    if (needsPaidDisclosure(post) && settingsResult.settings.tiktokBrandedContent !== true && settingsResult.settings.tiktokOrganicBrandContent !== true) {
      issues.push(issue('missing_paid_promotion_disclosure', 'Turn on the correct TikTok branded or organic brand content disclosure.'));
    }
  }

  if (post.platform === 'facebook' && needsPaidDisclosure(post) && settingsResult.settings.facebookPromotionalDisclosure !== true) {
    issues.push(issue('missing_paid_promotion_disclosure', 'Turn on the Facebook promotional disclosure for paid or sponsored content.'));
  }

  if (post.platform === 'instagram' && needsPaidDisclosure(post) && settingsResult.settings.instagramBrandedContent !== true) {
    warnings.push(issue('missing_paid_promotion_disclosure', 'Confirm whether Instagram branded content disclosure is needed.', 'warning'));
  }

  for (const validationError of settingsResult.errors) {
    const code = validationError.toLowerCase().includes('privacy') ? 'invalid_privacy_setting' : 'unsupported_content_type';
    issues.push(issue(code, validationError));
  }
  for (const validationWarning of settingsResult.warnings) {
    warnings.push(issue('not_publish_ready', validationWarning, 'warning'));
  }

  if (requiresMedia(post.platform, contentType)) {
    if ((post.assetIds || []).length === 0) {
      issues.push(issue('missing_public_media_url', `${post.platform} requires media before publishing.`));
    }
    for (const asset of assets) {
      if (!isRendered(asset)) issues.push(issue('media_still_rendering', `${asset.title || asset.assetId} is not ready yet.`));
      if (!asset.downloadUrl) issues.push(issue('missing_public_media_url', `${asset.title || asset.assetId} needs a public media URL.`));
    }
  }

  if (post.platform === 'x' && contentType !== 'text' && (!Array.isArray(settingsResult.settings.xMediaIds) || settingsResult.settings.xMediaIds.length === 0)) {
    issues.push(issue('missing_public_media_url', 'X media publishing needs uploaded media IDs until direct media upload is enabled.'));
  }

  const blocking = issues.filter((entry) => entry.severity === 'blocking');
  const status = blocking[0]?.code || 'ready';
  return {
    ready: blocking.length === 0,
    status,
    label: READY_LABELS[status],
    issues,
    warnings,
  };
}
