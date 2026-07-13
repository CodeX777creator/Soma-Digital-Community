import type { MonetizedFeature } from '@/services/ai-platform';
import type { StudioContentType } from './types';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  DEFAULT_CREATOR_CREDIT_TOOL_PRICING,
  normalizeCreatorCreditConfig,
  type CreatorCreditToolKey,
} from '@/lib/creator-credit-config';

export interface StudioCreditPolicy {
  feature: MonetizedFeature;
  credits?: number;
}

function toolKeyForContentType(contentType: StudioContentType): CreatorCreditToolKey {
  switch (contentType) {
    case 'caption':
      return 'caption';
    case 'ad_copy':
      return 'ad_copy';
    case 'email':
      return 'email';
    case 'blog':
      return 'blog';
    case 'script':
      return 'script';
    case 'carousel':
      return 'carousel';
    case 'sales_funnel':
      return 'sales_funnel';
    case 'marketing_planner':
      return 'marketing_planner';
    case 'prompt_library':
      return 'prompt_library';
    default:
      return 'script';
  }
}

async function resolveToolCredits(toolKey: CreatorCreditToolKey): Promise<number> {
  try {
    const snap = await adminDb.collection('config').doc('creatorCredits').get();
    const config = normalizeCreatorCreditConfig(snap.exists ? snap.data() : undefined);
    const configured = config.toolPricing[toolKey];
    if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 0) {
      return configured;
    }
  } catch {
    // Code defaults remain the emergency fallback when Firestore is unavailable.
  }

  return DEFAULT_CREATOR_CREDIT_TOOL_PRICING[toolKey];
}

export async function resolveStudioCreditPolicy(contentType: StudioContentType): Promise<StudioCreditPolicy> {
  const toolKey = toolKeyForContentType(contentType);
  const credits = await resolveToolCredits(toolKey);

  switch (contentType) {
    case 'caption':
      return { feature: 'social_media_generator', credits };
    case 'ad_copy':
      return { feature: 'social_media_generator', credits };
    case 'email':
      return { feature: 'document_generation', credits };
    case 'blog':
      return { feature: 'document_generation', credits };
    case 'script':
      return { feature: 'content_generation', credits };
    case 'carousel':
      return { feature: 'content_generation', credits };
    case 'sales_funnel':
      return { feature: 'funnel_builder', credits };
    case 'marketing_planner':
      return { feature: 'calendar_generation', credits };
    case 'prompt_library':
      return { feature: 'prompt_library', credits };
    case 'thumbnail':
      return { feature: 'content_generation', credits: 10 };
    default:
      return { feature: 'content_generation', credits };
  }
}
