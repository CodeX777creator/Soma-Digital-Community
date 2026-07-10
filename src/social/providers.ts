import type { SocialPlatform, SocialProviderDefinition } from './types';

export const SOCIAL_PROVIDER_REGISTRY: SocialProviderDefinition[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    description: 'Short-form video publishing and account metadata.',
    connectLabel: 'Connect TikTok',
    notes: 'Publishing and scheduling are added in later phases.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: 'Instagram creator and business account connections.',
    connectLabel: 'Connect Instagram',
    notes: 'Supports future post and reel workflows.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    description: 'Facebook page and business account connections.',
    connectLabel: 'Connect Facebook',
    notes: 'Useful for later page publishing and analytics.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    description: 'Professional brand account connections.',
    connectLabel: 'Connect LinkedIn',
    notes: 'Strong fit for thought-leadership publishing.',
  },
  {
    id: 'x',
    label: 'X',
    description: 'Fast social distribution and public commentary.',
    connectLabel: 'Connect X',
    notes: 'Publishing support comes in the scheduling phase.',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    description: 'Long-form video channel connections.',
    connectLabel: 'Connect YouTube',
    notes: 'Will support future content publishing and analytics.',
  },
];

export function getSocialProvider(providerId: SocialPlatform): SocialProviderDefinition {
  const provider = SOCIAL_PROVIDER_REGISTRY.find((entry) => entry.id === providerId);
  if (!provider) {
    throw new Error(`Unsupported social provider: ${providerId}`);
  }

  return provider;
}

