import type { SocialPlatform } from './types';

export const SCHEDULED_POST_CONTENT_TYPES = [
  'text',
  'image',
  'carousel',
  'video',
  'document',
] as const;

export type ScheduledPostContentType = (typeof SCHEDULED_POST_CONTENT_TYPES)[number];

export interface PlatformCapability {
  supportedContentTypes: ScheduledPostContentType[];
  mediaRequired: boolean;
  maxAssets?: number;
  supportedAssetKinds: ScheduledPostContentType[];
  maxCaptionLength?: number;
  supportsHashtags: boolean;
  supportsCTA: boolean;
  preferredAspectRatios?: string[];
}

export const PLATFORM_CAPABILITIES: Record<SocialPlatform, PlatformCapability> = {
  tiktok: {
    supportedContentTypes: ['image', 'carousel', 'video'],
    mediaRequired: true,
    maxAssets: 10,
    supportedAssetKinds: ['image', 'video'],
    maxCaptionLength: 4000,
    supportsHashtags: true,
    supportsCTA: true,
    preferredAspectRatios: ['1:1', '4:5', '9:16'],
  },
  instagram: {
    supportedContentTypes: ['image', 'carousel', 'video'],
    mediaRequired: true,
    maxAssets: 10,
    supportedAssetKinds: ['image', 'video'],
    maxCaptionLength: 2200,
    supportsHashtags: true,
    supportsCTA: true,
    preferredAspectRatios: ['1:1', '4:5', '9:16'],
  },
  youtube: {
    supportedContentTypes: ['video'],
    mediaRequired: true,
    maxAssets: 1,
    supportedAssetKinds: ['video'],
    maxCaptionLength: 5000,
    supportsHashtags: true,
    supportsCTA: true,
    preferredAspectRatios: ['16:9', '9:16'],
  },
  facebook: {
    supportedContentTypes: ['text', 'image', 'video'],
    mediaRequired: false,
    maxAssets: 10,
    supportedAssetKinds: ['image', 'video'],
    maxCaptionLength: 63206,
    supportsHashtags: true,
    supportsCTA: true,
  },
  linkedin: {
    supportedContentTypes: ['text', 'image'],
    mediaRequired: false,
    maxAssets: 1,
    supportedAssetKinds: ['image'],
    maxCaptionLength: 3000,
    supportsHashtags: true,
    supportsCTA: true,
  },
  x: {
    supportedContentTypes: ['text'],
    mediaRequired: false,
    maxAssets: 0,
    supportedAssetKinds: [],
    maxCaptionLength: 280,
    supportsHashtags: true,
    supportsCTA: true,
  },
};

export function getPlatformCapability(platform: SocialPlatform): PlatformCapability {
  return PLATFORM_CAPABILITIES[platform];
}

export function isScheduledPostContentType(value: unknown): value is ScheduledPostContentType {
  return typeof value === 'string' && (SCHEDULED_POST_CONTENT_TYPES as readonly string[]).includes(value);
}

export function getDefaultContentType(platform: SocialPlatform): ScheduledPostContentType {
  return PLATFORM_CAPABILITIES[platform].supportedContentTypes[0] || 'text';
}

export function requiresMedia(platform: SocialPlatform, contentType: ScheduledPostContentType): boolean {
  const capability = PLATFORM_CAPABILITIES[platform];
  return capability.mediaRequired || contentType !== 'text';
}
