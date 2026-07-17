import type { MonetizedFeature } from '@/services/ai-platform';
import type { StudioContentType } from './types';
import { adminDb } from '@/lib/firebaseAdmin';
import {
  DEFAULT_CREATOR_CREDIT_CONFIG,
  normalizeCreatorCreditConfig,
  type WorkflowKey,
} from '@/lib/creator-credit-config';

export interface StudioCreditPolicy {
  feature: MonetizedFeature;
  workflow: WorkflowKey;
}

function workflowKeyForContentType(contentType: StudioContentType): WorkflowKey {
  switch (contentType) {
    case 'caption':
      return 'caption';
    case 'ad_copy':
      return 'ad_copy';
    case 'email':
      return 'email_writer';
    case 'blog':
      return 'blog_writer';
    case 'script':
      return 'script';
    case 'carousel':
      return 'carousel';
    case 'sales_funnel':
      return 'sales_funnel';
    case 'marketing_planner':
      return 'roadmap_generation';
    case 'prompt_library':
      return 'prompt_library';
    case 'thumbnail':
      return 'image_generation' as any; // Thumbnail might not be a studio workflow explicitly, but keeping for compatibility
    default:
      return 'summary';
  }
}

export async function resolveStudioCreditPolicy(contentType: StudioContentType): Promise<StudioCreditPolicy> {
  const workflow = workflowKeyForContentType(contentType);
  
  switch (contentType) {
    case 'caption':
      return { feature: 'chat', workflow };
    case 'ad_copy':
      return { feature: 'chat', workflow };
    case 'email':
      return { feature: 'chat', workflow };
    case 'blog':
      return { feature: 'chat', workflow };
    case 'script':
      return { feature: 'chat', workflow };
    case 'carousel':
      return { feature: 'chat', workflow };
    case 'sales_funnel':
      return { feature: 'chat', workflow };
    case 'marketing_planner':
      return { feature: 'chat', workflow };
    case 'prompt_library':
      return { feature: 'chat', workflow };
    case 'thumbnail':
      return { feature: 'image_generation', workflow };
    default:
      return { feature: 'chat', workflow };
  }
}
