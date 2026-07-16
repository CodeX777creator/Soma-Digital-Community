import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiResponse, apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  generateVideoStudioAsset,
  getVideoStudioCapabilities,
  listVideoStudioAssets,
} from '@/ai/studio';
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_STYLE_PRESETS,
  type BrandTemplate,
  type VideoAspectRatio,
  type VideoScene,
  type VideoStylePreset,
  type ProductRules,
} from '@/ai/studio/types';
import { sanitizeString } from '@/lib/security';

function isAllowedStylePreset(value: unknown): value is VideoStylePreset {
  return typeof value === 'string' && (VIDEO_STYLE_PRESETS as readonly string[]).includes(value);
}

function isAllowedAspectRatio(value: unknown): value is VideoAspectRatio {
  return typeof value === 'string' && (VIDEO_ASPECT_RATIOS as readonly string[]).includes(value);
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

function normalizeProductRules(value: unknown): ProductRules | null {
  if (!value || typeof value !== 'object') return null;
  const rules = value as Record<string, unknown>;
  return {
    productName: typeof rules.productName === 'string' ? sanitizeString(rules.productName, 200) : undefined,
    productCategory: typeof rules.productCategory === 'string' ? sanitizeString(rules.productCategory, 160) : undefined,
    productPromise: typeof rules.productPromise === 'string' ? sanitizeString(rules.productPromise, 500) : undefined,
    targetAudience: typeof rules.targetAudience === 'string' ? sanitizeString(rules.targetAudience, 320) : undefined,
    differentiators: Array.isArray(rules.differentiators) ? rules.differentiators.filter((item): item is string => typeof item === 'string').map((item) => sanitizeString(item, 120)) : undefined,
    proofPoints: Array.isArray(rules.proofPoints) ? rules.proofPoints.filter((item): item is string => typeof item === 'string').map((item) => sanitizeString(item, 120)) : undefined,
    prohibitedClaims: Array.isArray(rules.prohibitedClaims) ? rules.prohibitedClaims.filter((item): item is string => typeof item === 'string').map((item) => sanitizeString(item, 120)) : undefined,
    complianceNotes: typeof rules.complianceNotes === 'string' ? sanitizeString(rules.complianceNotes, 800) : undefined,
    preferredCallToAction: typeof rules.preferredCallToAction === 'string' ? sanitizeString(rules.preferredCallToAction, 180) : undefined,
    brandTone: typeof rules.brandTone === 'string' ? sanitizeString(rules.brandTone, 120) : undefined,
  };
}

function normalizeScenes(value: unknown): VideoScene[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const scenes = value.slice(0, 12).map((scene, index) => {
    const item = scene as Record<string, unknown>;
    return {
      sceneNumber: typeof item.sceneNumber === 'number' ? item.sceneNumber : index + 1,
      durationSeconds: typeof item.durationSeconds === 'number' ? Math.max(3, Math.min(180, Math.round(item.durationSeconds))) : 10,
      visualDescription: typeof item.visualDescription === 'string' ? sanitizeString(item.visualDescription, 600) : 'Business-focused scene',
      narration: typeof item.narration === 'string' ? sanitizeString(item.narration, 600) : '',
      onScreenText: typeof item.onScreenText === 'string' ? sanitizeString(item.onScreenText, 240) : '',
      cameraDirection: typeof item.cameraDirection === 'string' ? sanitizeString(item.cameraDirection, 240) : undefined,
      transition: typeof item.transition === 'string' ? sanitizeString(item.transition, 160) : undefined,
    } satisfies VideoScene;
  });

  return scenes.length > 0 ? scenes : undefined;
}

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '12');
  if (!Number.isFinite(value)) return 12;
  return Math.min(Math.max(Math.floor(value), 1), 50);
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /ai/video-studio] Received request');
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
    if (body.durationSeconds && typeof body.durationSeconds !== 'number') {
      return apiError('durationSeconds must be a number', { status: 400, code: 'INVALID_INPUT' });
    }
    if (body.generationMode && body.generationMode !== 'draft' && body.generationMode !== 'render') {
      return apiError('generationMode must be draft or render', { status: 400, code: 'INVALID_INPUT' });
    }

    const video = await generateVideoStudioAsset({
      generationMode: body.generationMode === 'render' ? 'render' : 'draft',
      prompt: sanitizeString(body.prompt, 4000),
      promptEdits: typeof body.promptEdits === 'string' ? sanitizeString(body.promptEdits, 2000) : undefined,
      negativePrompt: typeof body.negativePrompt === 'string' ? sanitizeString(body.negativePrompt, 1000) : undefined,
      scenes: normalizeScenes(body.scenes),
      stylePreset: isAllowedStylePreset(body.stylePreset) ? body.stylePreset : undefined,
      aspectRatio: isAllowedAspectRatio(body.aspectRatio) ? body.aspectRatio : undefined,
      durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : undefined,
      captionsEnabled: body.captionsEnabled !== false,
      voiceoverTone: typeof body.voiceoverTone === 'string' ? sanitizeString(body.voiceoverTone, 120) : undefined,
      brandTemplate: normalizeBrandTemplate(body.brandTemplate),
      productRules: normalizeProductRules(body.productRules),
      brandName: typeof body.brandName === 'string' ? sanitizeString(body.brandName, 200) : undefined,
      title: typeof body.title === 'string' ? sanitizeString(body.title, 120) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.filter((item: unknown): item is string => typeof item === 'string') : undefined,
      visibility: body.visibility === 'public' || body.visibility === 'team' ? body.visibility : 'private',
      userId: entitlements.uid,
      userTier: entitlements.subscription.plan || 'pro',
      providerPreference: typeof body.providerPreference === 'string' ? body.providerPreference : undefined,
      conversationSummary: typeof body.conversationSummary === 'string' ? sanitizeString(body.conversationSummary, 2000) : undefined,
    });

    return apiResponse({ video });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 4 },
    timeout: 90000,
  }
);

export const GET = createAPIHandler(
  async (req) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
    const limit = parseLimit(req);
    const assets = await listVideoStudioAssets(entitlements.uid, limit);

    return apiResponse({
      capabilities: getVideoStudioCapabilities(),
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
