import type { ScheduledPostContentType, SocialPlatform } from '../types';

export type PlatformSettingInputType = 'select' | 'boolean' | 'text' | 'textarea' | 'number' | 'stringList';

export type PlatformSettingOption = {
  label: string;
  value: string;
  description?: string;
};

export type PlatformSettingField = {
  key: string;
  label: string;
  description: string;
  inputType: PlatformSettingInputType;
  options?: PlatformSettingOption[];
  defaultValue?: unknown;
  required?: boolean;
  appliesTo?: ScheduledPostContentType[];
  providerField?: string;
  helpText?: string;
  min?: number;
  max?: number;
  maxLength?: number;
};

export type PlatformSettingGroup = {
  key: string;
  label: string;
  description: string;
  fields: PlatformSettingField[];
};

export type PlatformSettingsSchema = {
  platform: SocialPlatform;
  label: string;
  description: string;
  groups: PlatformSettingGroup[];
};

const privacyOptions = [
  { label: 'Public', value: 'public' },
  { label: 'Unlisted', value: 'unlisted' },
  { label: 'Private', value: 'private' },
];

export const PLATFORM_SETTINGS_SCHEMAS: Record<SocialPlatform, PlatformSettingsSchema> = {
  tiktok: {
    platform: 'tiktok',
    label: 'TikTok',
    description: 'Direct Post and Draft Inbox settings required by TikTok.',
    groups: [
      {
        key: 'privacy',
        label: 'Privacy',
        description: 'Choose how the TikTok post should be delivered.',
        fields: [
          {
            key: 'tiktokPublishMode',
            label: 'Publish mode',
            description: 'Direct posts publish automatically. Draft Inbox sends the video to TikTok for final review.',
            inputType: 'select',
            defaultValue: 'draft',
            required: true,
            appliesTo: ['video', 'image', 'carousel'],
            providerField: 'publish_mode',
            options: [
              { label: 'Draft inbox', value: 'draft', description: 'Safer while app review is pending.' },
              { label: 'Direct post', value: 'direct', description: 'Publishes automatically when permission is approved.' },
            ],
          },
          {
            key: 'tiktokPrivacyLevel',
            label: 'Audience',
            description: 'Who can view this TikTok post.',
            inputType: 'select',
            defaultValue: 'SELF_ONLY',
            required: true,
            appliesTo: ['video', 'image', 'carousel'],
            providerField: 'privacy_level',
            options: [
              { label: 'Everyone', value: 'PUBLIC_TO_EVERYONE' },
              { label: 'Friends', value: 'MUTUAL_FOLLOW_FRIENDS' },
              { label: 'Only me', value: 'SELF_ONLY' },
            ],
          },
        ],
      },
      {
        key: 'disclosure',
        label: 'Disclosures',
        description: 'Labels TikTok may require for AI-generated or promotional content.',
        fields: [
          {
            key: 'tiktokAiGenerated',
            label: 'AI-generated content label',
            description: 'Disclose if the video was created or materially edited with AI.',
            inputType: 'boolean',
            defaultValue: false,
            appliesTo: ['video', 'image', 'carousel'],
            providerField: 'is_aigc',
          },
          {
            key: 'tiktokBrandedContent',
            label: 'Branded content',
            description: 'Use when the post promotes a brand or paid partnership.',
            inputType: 'boolean',
            defaultValue: false,
            appliesTo: ['video'],
            providerField: 'brand_content_toggle',
          },
          {
            key: 'tiktokOrganicBrandContent',
            label: 'Organic brand content',
            description: 'Use when this is your own brand content, not a paid sponsorship.',
            inputType: 'boolean',
            defaultValue: false,
            appliesTo: ['video'],
            providerField: 'brand_organic_toggle',
          },
        ],
      },
      {
        key: 'interactions',
        label: 'Interactions',
        description: 'Control viewer interactions where TikTok allows it.',
        fields: [
          { key: 'tiktokAllowComments', label: 'Allow comments', description: 'Let viewers comment where TikTok supports the selected format.', inputType: 'boolean', defaultValue: true, appliesTo: ['video', 'image', 'carousel'], providerField: 'disable_comment' },
          { key: 'tiktokAllowDuet', label: 'Allow duet', description: 'Let viewers duet this video.', inputType: 'boolean', defaultValue: true, appliesTo: ['video'], providerField: 'disable_duet' },
          { key: 'tiktokAllowStitch', label: 'Allow stitch', description: 'Let viewers stitch this video.', inputType: 'boolean', defaultValue: true, appliesTo: ['video'], providerField: 'disable_stitch' },
          { key: 'tiktokCoverTimestampMs', label: 'Cover timestamp', description: 'Optional cover frame position in milliseconds.', inputType: 'number', defaultValue: 0, min: 0, appliesTo: ['video'], providerField: 'video_cover_timestamp_ms', helpText: '1000 ms = 1 second.' },
        ],
      },
    ],
  },
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    description: 'Feed, Reel, Story, and Carousel publishing settings.',
    groups: [
      {
        key: 'format',
        label: 'Format',
        description: 'Choose the Instagram placement.',
        fields: [
          {
            key: 'instagramFormat',
            label: 'Placement',
            description: 'Where this should appear on Instagram.',
            inputType: 'select',
            defaultValue: 'feed',
            required: true,
            providerField: 'media_type',
            options: [
              { label: 'Feed', value: 'feed' },
              { label: 'Reel', value: 'reel' },
              { label: 'Story', value: 'story' },
              { label: 'Carousel', value: 'carousel' },
            ],
          },
          { key: 'instagramShareToFeed', label: 'Share Reel to feed', description: 'Also show Reels in the profile feed when supported.', inputType: 'boolean', defaultValue: true, appliesTo: ['video'], providerField: 'share_to_feed' },
          { key: 'instagramBrandedContent', label: 'Branded content', description: 'Reserve disclosure context for paid partnership workflows.', inputType: 'boolean', defaultValue: false },
        ],
      },
    ],
  },
  youtube: {
    platform: 'youtube',
    label: 'YouTube',
    description: 'Metadata and audience controls for YouTube uploads.',
    groups: [
      {
        key: 'metadata',
        label: 'Metadata',
        description: 'YouTube requires a title and visibility for native uploads.',
        fields: [
          { key: 'youtubeTitle', label: 'Title', description: 'Public-facing YouTube video title.', inputType: 'text', required: true, maxLength: 100, appliesTo: ['video'], providerField: 'title' },
          { key: 'youtubeDescription', label: 'Description override', description: 'Optional YouTube-only description. If empty, Soma uses the caption.', inputType: 'textarea', appliesTo: ['video'], providerField: 'description' },
          { key: 'youtubeVisibility', label: 'Visibility', description: 'Who can view the YouTube video.', inputType: 'select', defaultValue: 'private', required: true, appliesTo: ['video'], options: privacyOptions, providerField: 'privacyStatus' },
          { key: 'youtubeMadeForKids', label: 'Made for kids', description: 'Declare whether this content is made for children.', inputType: 'boolean', defaultValue: false, appliesTo: ['video'], providerField: 'selfDeclaredMadeForKids' },
          { key: 'youtubeCategoryId', label: 'Category', description: 'Optional YouTube category ID.', inputType: 'text', defaultValue: '22', appliesTo: ['video'], providerField: 'categoryId' },
          { key: 'youtubeTags', label: 'Tags', description: 'Comma-separated YouTube tags.', inputType: 'stringList', appliesTo: ['video'], providerField: 'tags' },
        ],
      },
    ],
  },
  facebook: {
    platform: 'facebook',
    label: 'Facebook',
    description: 'Page publishing settings.',
    groups: [
      {
        key: 'post',
        label: 'Post',
        description: 'Choose how this should appear on Facebook.',
        fields: [
          { key: 'facebookPostType', label: 'Post type', description: 'Feed, photo, video, or Reel-style post.', inputType: 'select', defaultValue: 'feed', options: [
            { label: 'Feed post', value: 'feed' },
            { label: 'Photo post', value: 'photo' },
            { label: 'Video post', value: 'video' },
            { label: 'Reel', value: 'reel' },
          ], providerField: 'post_type' },
          { key: 'facebookPromotionalDisclosure', label: 'Promotional disclosure', description: 'Mark if this is paid or promotional content.', inputType: 'boolean', defaultValue: false },
          { key: 'facebookLinkUrl', label: 'Link URL', description: 'Optional link to include with text posts.', inputType: 'text', providerField: 'link' },
        ],
      },
    ],
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn',
    description: 'Professional publishing settings.',
    groups: [
      {
        key: 'destination',
        label: 'Destination',
        description: 'Choose profile or organization publishing.',
        fields: [
          { key: 'linkedinDestinationType', label: 'Destination type', description: 'Publish as a profile or organization page.', inputType: 'select', defaultValue: 'profile', required: true, options: [
            { label: 'Profile', value: 'profile' },
            { label: 'Organization', value: 'organization' },
          ], providerField: 'author_type' },
          { key: 'linkedinOrganizationUrn', label: 'Organization URN', description: 'Required when publishing to an organization page.', inputType: 'text', providerField: 'organization' },
          { key: 'linkedinVisibility', label: 'Visibility', description: 'LinkedIn API currently supports public publishing for this flow.', inputType: 'select', defaultValue: 'PUBLIC', required: true, options: [
            { label: 'Public', value: 'PUBLIC' },
          ], providerField: 'visibility' },
        ],
      },
    ],
  },
  x: {
    platform: 'x',
    label: 'X',
    description: 'Post, thread, and media handoff settings.',
    groups: [
      {
        key: 'post',
        label: 'Post',
        description: 'X has short text limits and optional media IDs.',
        fields: [
          { key: 'xThreadEnabled', label: 'Create as thread', description: 'Split long content into a thread where supported later.', inputType: 'boolean', defaultValue: false },
          { key: 'xMediaIds', label: 'Uploaded media IDs', description: 'Comma-separated X media IDs. Needed until direct media upload is enabled.', inputType: 'stringList', providerField: 'media_ids' },
          { key: 'xSensitiveMedia', label: 'Sensitive media', description: 'Mark media as sensitive when required.', inputType: 'boolean', defaultValue: false, providerField: 'possibly_sensitive' },
        ],
      },
    ],
  },
};

export function getPlatformSettingsSchema(platform: SocialPlatform): PlatformSettingsSchema {
  return PLATFORM_SETTINGS_SCHEMAS[platform];
}

export function getPlatformSettingFields(platform: SocialPlatform, contentType?: ScheduledPostContentType): PlatformSettingField[] {
  const schema = getPlatformSettingsSchema(platform);
  return schema.groups.flatMap((group) => group.fields).filter((field) => {
    if (!field.appliesTo || !contentType) return true;
    return field.appliesTo.includes(contentType);
  });
}
