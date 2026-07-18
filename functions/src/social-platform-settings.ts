type SocialPlatform = 'tiktok' | 'instagram' | 'facebook' | 'linkedin' | 'x' | 'youtube';

const TIKTOK_PRIVACY_ALIASES: Record<string, string> = {
  public: 'PUBLIC_TO_EVERYONE',
  friends: 'MUTUAL_FOLLOW_FRIENDS',
  private: 'SELF_ONLY',
  PUBLIC_TO_EVERYONE: 'PUBLIC_TO_EVERYONE',
  MUTUAL_FOLLOW_FRIENDS: 'MUTUAL_FOLLOW_FRIENDS',
  SELF_ONLY: 'SELF_ONLY',
};

function firstDefined(settings: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (settings[key] !== undefined) return settings[key];
  }
  return undefined;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

export function normalizePlatformSettings(platform: SocialPlatform, input: Record<string, unknown> = {}): Record<string, unknown> {
  const settings: Record<string, unknown> = {};

  if (platform === 'tiktok') {
    const privacy = firstDefined(input, ['tiktokPrivacyLevel', 'privacyLevel']);
    settings.tiktokPublishMode = firstDefined(input, ['tiktokPublishMode', 'publishMode', 'mode']) || 'draft';
    settings.tiktokPrivacyLevel = privacy ? TIKTOK_PRIVACY_ALIASES[String(privacy)] || String(privacy) : 'SELF_ONLY';
    settings.tiktokAiGenerated = asBoolean(firstDefined(input, ['tiktokAiGenerated', 'isAigc']));
    settings.tiktokBrandedContent = asBoolean(firstDefined(input, ['tiktokBrandedContent', 'brandContentToggle']));
    settings.tiktokOrganicBrandContent = asBoolean(firstDefined(input, ['tiktokOrganicBrandContent', 'brandOrganicToggle']));
    settings.tiktokAllowComments = input.disableComment !== undefined ? !asBoolean(input.disableComment) : asBoolean(firstDefined(input, ['tiktokAllowComments', 'allowComments']), true);
    settings.tiktokAllowDuet = input.disableDuet !== undefined ? !asBoolean(input.disableDuet) : asBoolean(firstDefined(input, ['tiktokAllowDuet', 'allowDuet']), true);
    settings.tiktokAllowStitch = input.disableStitch !== undefined ? !asBoolean(input.disableStitch) : asBoolean(firstDefined(input, ['tiktokAllowStitch', 'allowStitch']), true);
    settings.tiktokCoverTimestampMs = Number(firstDefined(input, ['tiktokCoverTimestampMs', 'videoCoverTimestampMs']) || 0);
  }

  if (platform === 'instagram') {
    settings.instagramFormat = firstDefined(input, ['instagramFormat', 'publishAs']) || 'feed';
    settings.instagramShareToFeed = asBoolean(firstDefined(input, ['instagramShareToFeed', 'shareToFeed']), true);
    settings.instagramBrandedContent = asBoolean(input.instagramBrandedContent);
  }

  if (platform === 'youtube') {
    settings.youtubeTitle = firstDefined(input, ['youtubeTitle', 'title']);
    settings.youtubeDescription = firstDefined(input, ['youtubeDescription', 'descriptionOverride']);
    settings.youtubeVisibility = firstDefined(input, ['youtubeVisibility', 'youtubePrivacyStatus', 'privacyStatus', 'visibility']) || 'private';
    settings.youtubeMadeForKids = asBoolean(firstDefined(input, ['youtubeMadeForKids', 'madeForKids', 'selfDeclaredMadeForKids']));
    settings.youtubeCategoryId = firstDefined(input, ['youtubeCategoryId', 'categoryId']) || '22';
    settings.youtubeTags = asStringList(firstDefined(input, ['youtubeTags', 'tags']));
  }

  if (platform === 'facebook') {
    settings.facebookPostType = input.facebookPostType || 'feed';
    settings.facebookPromotionalDisclosure = asBoolean(input.facebookPromotionalDisclosure);
    settings.facebookLinkUrl = input.facebookLinkUrl;
  }

  if (platform === 'linkedin') {
    settings.linkedinDestinationType = firstDefined(input, ['linkedinDestinationType', 'destinationType']) || 'profile';
    settings.linkedinOrganizationUrn = input.linkedinOrganizationUrn;
    settings.linkedinVisibility = input.linkedinVisibility || 'PUBLIC';
  }

  if (platform === 'x') {
    settings.xThreadEnabled = asBoolean(input.xThreadEnabled);
    settings.xMediaIds = asStringList(firstDefined(input, ['xMediaIds', 'mediaIds']));
    settings.xSensitiveMedia = asBoolean(input.xSensitiveMedia);
  }

  return settings;
}

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

  if (platform === 'x') {
    return {
      media_ids: Array.isArray(settings.xMediaIds) ? settings.xMediaIds : [],
      thread: settings.xThreadEnabled === true,
      possibly_sensitive: settings.xSensitiveMedia === true,
    };
  }

  if (platform === 'linkedin') {
    return {
      author_type: settings.linkedinDestinationType || 'profile',
      organization: settings.linkedinOrganizationUrn,
      visibility: settings.linkedinVisibility || 'PUBLIC',
    };
  }

  if (platform === 'facebook') {
    return {
      post_type: settings.facebookPostType || 'feed',
      promotional_disclosure: settings.facebookPromotionalDisclosure === true,
      link: settings.facebookLinkUrl,
    };
  }

  return {};
}
