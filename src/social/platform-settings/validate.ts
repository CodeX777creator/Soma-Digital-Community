import type { ScheduledPostContentType, SocialPlatform } from '../types';
import { getPlatformSettingFields, getPlatformSettingsSchema } from './schemas';

export type PlatformSettingsValidationContext = {
  contentType?: ScheduledPostContentType;
  caption?: string;
  title?: string;
  status?: string;
  scopes?: string[];
  assetCount?: number;
};

export type PlatformSettingsValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  settings: Record<string, unknown>;
};

const TIKTOK_PRIVACY_ALIASES: Record<string, string> = {
  public: 'PUBLIC_TO_EVERYONE',
  friends: 'MUTUAL_FOLLOW_FRIENDS',
  private: 'SELF_ONLY',
  PUBLIC_TO_EVERYONE: 'PUBLIC_TO_EVERYONE',
  MUTUAL_FOLLOW_FRIENDS: 'MUTUAL_FOLLOW_FRIENDS',
  SELF_ONLY: 'SELF_ONLY',
};

const PLATFORM_SETTING_ALIASES: Record<SocialPlatform, string[]> = {
  tiktok: ['privacyLevel', 'publishMode', 'mode', 'isAigc', 'brandContentToggle', 'brandOrganicToggle', 'disableComment', 'disableDuet', 'disableStitch', 'videoCoverTimestampMs', 'allowComments', 'allowDuet', 'allowStitch'],
  instagram: ['publishAs', 'shareToFeed', 'instagramMediaType'],
  youtube: ['title', 'descriptionOverride', 'youtubePrivacyStatus', 'privacyStatus', 'visibility', 'madeForKids', 'selfDeclaredMadeForKids', 'categoryId', 'tags'],
  facebook: [],
  linkedin: ['destinationType'],
  x: ['mediaIds'],
};

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
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function firstDefined(settings: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (settings[key] !== undefined) return settings[key];
  }
  return undefined;
}

export function getPlatformSettingDefaults(platform: SocialPlatform, contentType?: ScheduledPostContentType): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of getPlatformSettingFields(platform, contentType)) {
    if (field.defaultValue !== undefined) defaults[field.key] = field.defaultValue;
  }
  return defaults;
}

export function normalizePlatformSettings(
  platform: SocialPlatform,
  input: Record<string, unknown> = {},
  context: PlatformSettingsValidationContext = {}
): Record<string, unknown> {
  const defaults = getPlatformSettingDefaults(platform, context.contentType);
  const output: Record<string, unknown> = { ...defaults };

  for (const field of getPlatformSettingFields(platform, context.contentType)) {
    if (input[field.key] !== undefined) output[field.key] = input[field.key];
  }

  if (platform === 'tiktok') {
    const privacy = firstDefined(input, ['tiktokPrivacyLevel', 'privacyLevel']);
    if (privacy !== undefined) output.tiktokPrivacyLevel = TIKTOK_PRIVACY_ALIASES[String(privacy)] || String(privacy);
    output.tiktokPublishMode = firstDefined(input, ['tiktokPublishMode', 'publishMode', 'mode']) || output.tiktokPublishMode;
    output.tiktokAiGenerated = asBoolean(firstDefined(input, ['tiktokAiGenerated', 'isAigc']), Boolean(output.tiktokAiGenerated));
    output.tiktokBrandedContent = asBoolean(firstDefined(input, ['tiktokBrandedContent', 'brandContentToggle']), Boolean(output.tiktokBrandedContent));
    output.tiktokOrganicBrandContent = asBoolean(firstDefined(input, ['tiktokOrganicBrandContent', 'brandOrganicToggle']), Boolean(output.tiktokOrganicBrandContent));
    if (input.disableComment !== undefined) output.tiktokAllowComments = !asBoolean(input.disableComment);
    if (input.disableDuet !== undefined) output.tiktokAllowDuet = !asBoolean(input.disableDuet);
    if (input.disableStitch !== undefined) output.tiktokAllowStitch = !asBoolean(input.disableStitch);
    output.tiktokAllowComments = asBoolean(firstDefined(input, ['tiktokAllowComments', 'allowComments']), Boolean(output.tiktokAllowComments));
    output.tiktokAllowDuet = asBoolean(firstDefined(input, ['tiktokAllowDuet', 'allowDuet']), Boolean(output.tiktokAllowDuet));
    output.tiktokAllowStitch = asBoolean(firstDefined(input, ['tiktokAllowStitch', 'allowStitch']), Boolean(output.tiktokAllowStitch));
    const cover = firstDefined(input, ['tiktokCoverTimestampMs', 'videoCoverTimestampMs']);
    if (cover !== undefined && cover !== '') output.tiktokCoverTimestampMs = Number(cover);
  }

  if (platform === 'instagram') {
    output.instagramFormat = firstDefined(input, ['instagramFormat', 'publishAs']) || output.instagramFormat;
    output.instagramShareToFeed = asBoolean(firstDefined(input, ['instagramShareToFeed', 'shareToFeed']), Boolean(output.instagramShareToFeed));
    output.instagramBrandedContent = asBoolean(input.instagramBrandedContent, Boolean(output.instagramBrandedContent));
  }

  if (platform === 'youtube') {
    output.youtubeTitle = firstDefined(input, ['youtubeTitle', 'title']) || context.title || '';
    output.youtubeDescription = firstDefined(input, ['youtubeDescription', 'descriptionOverride']);
    output.youtubeVisibility = firstDefined(input, ['youtubeVisibility', 'youtubePrivacyStatus', 'privacyStatus', 'visibility']) || output.youtubeVisibility;
    output.youtubeMadeForKids = asBoolean(firstDefined(input, ['youtubeMadeForKids', 'madeForKids', 'selfDeclaredMadeForKids']), Boolean(output.youtubeMadeForKids));
    output.youtubeCategoryId = firstDefined(input, ['youtubeCategoryId', 'categoryId']) || output.youtubeCategoryId;
    const tags = firstDefined(input, ['youtubeTags', 'tags']);
    output.youtubeTags = asStringList(tags);
  }

  if (platform === 'facebook') {
    output.facebookPostType = input.facebookPostType || output.facebookPostType;
    output.facebookPromotionalDisclosure = asBoolean(input.facebookPromotionalDisclosure, Boolean(output.facebookPromotionalDisclosure));
    output.facebookLinkUrl = input.facebookLinkUrl || '';
  }

  if (platform === 'linkedin') {
    output.linkedinDestinationType = firstDefined(input, ['linkedinDestinationType', 'destinationType']) || output.linkedinDestinationType;
    output.linkedinOrganizationUrn = input.linkedinOrganizationUrn || '';
    output.linkedinVisibility = input.linkedinVisibility || output.linkedinVisibility;
  }

  if (platform === 'x') {
    output.xThreadEnabled = asBoolean(input.xThreadEnabled, Boolean(output.xThreadEnabled));
    output.xMediaIds = asStringList(firstDefined(input, ['xMediaIds', 'mediaIds']));
    output.xSensitiveMedia = asBoolean(input.xSensitiveMedia, Boolean(output.xSensitiveMedia));
  }

  return Object.fromEntries(Object.entries(output).filter(([, value]) => value !== undefined && value !== ''));
}

export function validatePlatformSettings(
  platform: SocialPlatform,
  input: Record<string, unknown> = {},
  context: PlatformSettingsValidationContext = {}
): PlatformSettingsValidationResult {
  const settings = normalizePlatformSettings(platform, input, context);
  const fields = getPlatformSettingFields(platform, context.contentType);
  const allowedKeys = new Set(fields.map((field) => field.key));
  const acceptedInputKeys = new Set([...allowedKeys, ...(PLATFORM_SETTING_ALIASES[platform] || [])]);
  const errors: string[] = [];
  const warnings: string[] = [];
  const publishable = context.status !== 'draft' && context.status !== 'editing';

  for (const key of Object.keys(input)) {
    if (!acceptedInputKeys.has(key)) errors.push(`${getPlatformSettingsSchema(platform).label} setting "${key}" is not supported.`);
  }

  for (const key of Object.keys(settings)) {
    if (!allowedKeys.has(key)) errors.push(`${getPlatformSettingsSchema(platform).label} setting "${key}" is not supported for this format.`);
  }

  for (const field of fields) {
    const value = settings[field.key];
    if (publishable && field.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field.label} is required.`);
    }
    if (field.options && value !== undefined && value !== '' && !field.options.some((option) => option.value === String(value))) {
      errors.push(`${field.label} must be one of: ${field.options.map((option) => option.label).join(', ')}.`);
    }
    if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) {
      errors.push(`${field.label} must be ${field.maxLength} characters or fewer.`);
    }
    if (field.inputType === 'number' && value !== undefined && value !== '') {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) errors.push(`${field.label} must be a number.`);
      if (field.min !== undefined && numericValue < field.min) errors.push(`${field.label} must be at least ${field.min}.`);
      if (field.max !== undefined && numericValue > field.max) errors.push(`${field.label} must be ${field.max} or less.`);
    }
  }

  if (platform === 'instagram' && settings.instagramFormat === 'carousel') {
    const count = context.assetCount || 0;
    if (count > 0 && (count < 2 || count > 10)) errors.push('Instagram carousels require 2 to 10 ordered media assets.');
  }

  if (platform === 'linkedin' && settings.linkedinDestinationType === 'organization' && !settings.linkedinOrganizationUrn) {
    warnings.push('LinkedIn organization publishing requires a page destination. Soma will use the connected destination when available.');
  }

  if (platform === 'youtube' && context.contentType && context.contentType !== 'video') {
    warnings.push('YouTube native publishing is currently prepared for video uploads.');
  }

  if (platform === 'x' && (context.caption || '').length > 280 && !settings.xThreadEnabled) {
    errors.push('X posts must be 280 characters or fewer unless thread mode is enabled.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    settings,
  };
}

export function getPlatformWarnings(
  platform: SocialPlatform,
  input: Record<string, unknown> = {},
  context: PlatformSettingsValidationContext = {}
): string[] {
  return validatePlatformSettings(platform, input, context).warnings;
}
