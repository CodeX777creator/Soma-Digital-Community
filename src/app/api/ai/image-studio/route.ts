import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiResponse, apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  generateImageStudioAsset,
  getImageStudioCapabilities,
  listImageStudioAssets,
} from '@/ai/studio';
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_STYLE_PRESETS,
  type BrandTemplate,
  type ImageAspectRatio,
  type ImageStylePreset,
} from '@/ai/studio/types';
import { sanitizeString } from '@/lib/security';

function isAllowedStylePreset(value: unknown): value is ImageStylePreset {
  return typeof value === 'string' && (IMAGE_STYLE_PRESETS as readonly string[]).includes(value);
}

function isAllowedAspectRatio(value: unknown): value is ImageAspectRatio {
  return typeof value === 'string' && (IMAGE_ASPECT_RATIOS as readonly string[]).includes(value);
}

function normalizeBrandTemplate(value: unknown): BrandTemplate | null {
  if (!value || typeof value !== 'object') return null;
  const template = value as Record<string, unknown>;
  return {
    id: typeof template.id === 'string' ? template.id : undefined,
    name: typeof template.name === 'string' ? template.name : undefined,
    description: typeof template.description === 'string' ? template.description : undefined,
    logoUrl: typeof template.logoUrl === 'string' ? template.logoUrl : undefined,
    colors: Array.isArray(template.colors) ? template.colors.filter((item): item is string => typeof item === 'string') : undefined,
    fonts: Array.isArray(template.fonts) ? template.fonts.filter((item): item is string => typeof item === 'string') : undefined,
    notes: typeof template.notes === 'string' ? template.notes : undefined,
  };
}

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '12');
  if (!Number.isFinite(value)) return 12;
  return Math.min(Math.max(Math.floor(value), 1), 50);
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /ai/image-studio] Received request');
    const entitlements = await requireSubscription(req as any, 'explorer');

    const body = await req.json();

    if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return apiError('Prompt is required', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.prompt.length > 4000) {
      return apiError('Prompt too long (max 4000 characters)', { status: 400, code: 'INPUT_TOO_LONG' });
    }

    if (body.promptEdits && typeof body.promptEdits !== 'string') {
      return apiError('promptEdits must be a string', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.negativePrompt && typeof body.negativePrompt !== 'string') {
      return apiError('negativePrompt must be a string', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.title && typeof body.title !== 'string') {
      return apiError('title must be a string', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.brandName && typeof body.brandName !== 'string') {
      return apiError('brandName must be a string', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.stylePreset && !isAllowedStylePreset(body.stylePreset)) {
      return apiError('Unsupported style preset', { status: 400, code: 'INVALID_STYLE_PRESET' });
    }

    if (body.aspectRatio && !isAllowedAspectRatio(body.aspectRatio)) {
      return apiError('Unsupported aspect ratio', { status: 400, code: 'INVALID_ASPECT_RATIO' });
    }

    const image = await generateImageStudioAsset({
      prompt: sanitizeString(body.prompt, 4000),
      promptEdits: typeof body.promptEdits === 'string' ? sanitizeString(body.promptEdits, 2000) : undefined,
      negativePrompt: typeof body.negativePrompt === 'string' ? sanitizeString(body.negativePrompt, 1000) : undefined,
      stylePreset: isAllowedStylePreset(body.stylePreset) ? body.stylePreset : undefined,
      aspectRatio: isAllowedAspectRatio(body.aspectRatio) ? body.aspectRatio : undefined,
      brandTemplate: normalizeBrandTemplate(body.brandTemplate),
      brandName: typeof body.brandName === 'string' ? sanitizeString(body.brandName, 200) : undefined,
      title: typeof body.title === 'string' ? sanitizeString(body.title, 120) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.filter((item: unknown): item is string => typeof item === 'string') : undefined,
      visibility: body.visibility === 'public' || body.visibility === 'team' ? body.visibility : 'private',
      userId: entitlements.uid,
      userTier: entitlements.subscription.plan || 'pro',
      providerPreference: typeof body.providerPreference === 'string' ? body.providerPreference : undefined,
      conversationSummary: typeof body.conversationSummary === 'string' ? sanitizeString(body.conversationSummary, 2000) : undefined,
    });

    return apiResponse({ image });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 5 },
    timeout: 60000,
  }
);

export const GET = createAPIHandler(
  async (req) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
    const limit = parseLimit(req);
    const assets = await listImageStudioAssets(entitlements.uid, limit);

    return apiResponse({
      capabilities: getImageStudioCapabilities(),
      assets,
    }, {
      cache: {
        maxAge: 60,
        staleWhileRevalidate: 120,
        private: true,
      },
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 20000,
  }
);

export const POST = handler;
