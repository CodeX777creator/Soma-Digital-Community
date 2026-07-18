import assert from 'node:assert/strict';
import { evaluatePostPublishReadiness } from '../src/social/publish-readiness';
import { mapPlatformSettingsToProvider } from '../src/social/platform-settings/mapToProvider';
import { validatePlatformSettings } from '../src/social/platform-settings/validate';
import type { ScheduledPostRecord, SocialAccountRecord, SocialPlatform } from '../src/social/types';

function account(platform: SocialPlatform, scopes: string[] = []): SocialAccountRecord {
  return {
    socialAccountId: `acct_${platform}`,
    ownerId: 'user_1',
    providerId: platform,
    providerLabel: platform,
    accountName: `${platform} account`,
    status: 'connected',
    scopes,
    hasCredentials: true,
    metadata: {},
  };
}

function post(platform: SocialPlatform, patch: Partial<ScheduledPostRecord> = {}): ScheduledPostRecord {
  return {
    scheduledPostId: `post_${platform}`,
    ownerId: 'user_1',
    platform,
    connectedAccountId: `acct_${platform}`,
    socialAccountId: `acct_${platform}`,
    contentType: platform === 'youtube' || platform === 'tiktok' ? 'video' : 'text',
    status: 'scheduled',
    scheduledTime: new Date(Date.now() + 60_000).toISOString(),
    caption: 'A useful post for entrepreneurs.',
    hashtags: ['business'],
    assetIds: [],
    platformSettings: {},
    metadata: {},
    createdAt: null,
    updatedAt: null,
    ...patch,
  };
}

function run(): void {
  const tiktokProvider = mapPlatformSettingsToProvider('tiktok', {
    tiktokPublishMode: 'direct',
    tiktokPrivacyLevel: 'SELF_ONLY',
    tiktokAiGenerated: true,
    tiktokBrandedContent: true,
  });
  assert.equal(tiktokProvider.publish_mode, 'direct');
  assert.equal(tiktokProvider.privacy_level, 'SELF_ONLY');
  assert.equal(tiktokProvider.is_aigc, true);
  assert.equal(tiktokProvider.brand_content_toggle, true);

  const tiktokDirect = evaluatePostPublishReadiness({
    post: post('tiktok', {
      contentType: 'video',
      assetIds: ['asset_1'],
      platformSettings: { tiktokPublishMode: 'direct', tiktokPrivacyLevel: 'SELF_ONLY' },
    }),
    account: account('tiktok', ['video.upload']),
    assets: [{ assetId: 'asset_1', type: 'video', status: 'completed', downloadUrl: 'https://cdn.test/video.mp4' }],
  });
  assert.equal(tiktokDirect.ready, false);
  assert.equal(tiktokDirect.issues.some((issue) => issue.code === 'missing_permission'), true);

  const tiktokDraft = evaluatePostPublishReadiness({
    post: post('tiktok', {
      contentType: 'video',
      assetIds: ['asset_1'],
      platformSettings: { tiktokPublishMode: 'draft', tiktokPrivacyLevel: 'SELF_ONLY' },
    }),
    account: account('tiktok', ['video.upload']),
    assets: [{ assetId: 'asset_1', type: 'video', status: 'completed', downloadUrl: 'https://cdn.test/video.mp4' }],
  });
  assert.equal(tiktokDraft.issues.some((issue) => issue.code === 'missing_permission'), false);

  const invalidPrivacy = validatePlatformSettings('tiktok', { tiktokPrivacyLevel: 'friends-only' }, { contentType: 'video' });
  assert.equal(invalidPrivacy.ok, false);

  const youtubeTitle = validatePlatformSettings('youtube', { youtubeTitle: 'x'.repeat(101), youtubeVisibility: 'private' }, { contentType: 'video' });
  assert.equal(youtubeTitle.ok, false);
  const youtubeProvider = mapPlatformSettingsToProvider('youtube', {
    youtubeTitle: 'My video',
    youtubeVisibility: 'unlisted',
    youtubeMadeForKids: true,
    youtubeTags: ['one', 'two'],
  });
  assert.equal(youtubeProvider.privacyStatus, 'unlisted');
  assert.equal(youtubeProvider.selfDeclaredMadeForKids, true);
  assert.deepEqual(youtubeProvider.tags, ['one', 'two']);

  const instagramProvider = mapPlatformSettingsToProvider('instagram', { instagramFormat: 'reel', instagramShareToFeed: false });
  assert.equal(instagramProvider.media_type, 'REELS');
  assert.equal(instagramProvider.share_to_feed, false);

  const instagramCarousel = validatePlatformSettings('instagram', { instagramFormat: 'carousel' }, { contentType: 'carousel', assetCount: 1 });
  assert.equal(instagramCarousel.ok, false);

  const xTooLong = evaluatePostPublishReadiness({
    post: post('x', { caption: 'x'.repeat(281), platformSettings: { xThreadEnabled: false } }),
    account: account('x', ['tweet.write']),
  });
  assert.equal(xTooLong.ready, false);
  assert.equal(xTooLong.issues.some((issue) => issue.code === 'unsupported_content_type'), true);

  const unknown = validatePlatformSettings('youtube', { youtubeVisibility: 'private', rawProviderThing: true }, { contentType: 'video' });
  assert.equal(unknown.ok, false);

  const draftIncomplete = evaluatePostPublishReadiness({
    post: post('instagram', { status: 'draft', contentType: 'image', assetIds: [] }),
    account: account('instagram', ['instagram_content_publish']),
  });
  assert.equal(draftIncomplete.ready, false);

  console.log('Social platform settings validation passed.');
}

run();
