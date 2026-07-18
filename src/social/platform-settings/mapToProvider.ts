import type { SocialPlatform } from '../types';
import { normalizePlatformSettings } from './validate';

export function mapPlatformSettingsToProvider(platform: SocialPlatform, input: Record<string, unknown> = {}): Record<string, unknown> {
  const settings = normalizePlatformSettings(platform, input);

  if (platform === 'tiktok') {
    return {
      publish_mode: settings.tiktokPublishMode,
      privacy_level: settings.tiktokPrivacyLevel,
      is_aigc: settings.tiktokAiGenerated === true,
      brand_content_toggle: settings.tiktokBrandedContent === true,
      brand_organic_toggle: settings.tiktokOrganicBrandContent === true,
      disable_comment: settings.tiktokAllowComments === false,
      disable_duet: settings.tiktokAllowDuet === false,
      disable_stitch: settings.tiktokAllowStitch === false,
      video_cover_timestamp_ms: Number(settings.tiktokCoverTimestampMs || 0),
    };
  }

  if (platform === 'instagram') {
    if (input.instagramMediaType === 'VIDEO') {
      return {
        media_type: 'VIDEO',
        share_to_feed: settings.instagramShareToFeed !== false,
        branded_content: settings.instagramBrandedContent === true,
      };
    }
    const format = String(settings.instagramFormat || 'feed');
    return {
      media_type: format === 'reel' ? 'REELS' : format === 'story' ? 'STORIES' : format === 'carousel' ? 'CAROUSEL' : undefined,
      share_to_feed: settings.instagramShareToFeed !== false,
      branded_content: settings.instagramBrandedContent === true,
    };
  }

  if (platform === 'youtube') {
    return {
      title: settings.youtubeTitle,
      descriptionOverride: settings.youtubeDescription,
      privacyStatus: settings.youtubeVisibility || 'private',
      selfDeclaredMadeForKids: settings.youtubeMadeForKids === true,
      categoryId: settings.youtubeCategoryId || '22',
      tags: Array.isArray(settings.youtubeTags) ? settings.youtubeTags : [],
    };
  }

  if (platform === 'facebook') {
    return {
      post_type: settings.facebookPostType || 'feed',
      promotional_disclosure: settings.facebookPromotionalDisclosure === true,
      link: settings.facebookLinkUrl,
    };
  }

  if (platform === 'linkedin') {
    return {
      author_type: settings.linkedinDestinationType || 'profile',
      organization: settings.linkedinOrganizationUrn,
      visibility: settings.linkedinVisibility || 'PUBLIC',
    };
  }

  if (platform === 'x') {
    return {
      thread: settings.xThreadEnabled === true,
      media_ids: Array.isArray(settings.xMediaIds) ? settings.xMediaIds : [],
      possibly_sensitive: settings.xSensitiveMedia === true,
    };
  }

  return {};
}
