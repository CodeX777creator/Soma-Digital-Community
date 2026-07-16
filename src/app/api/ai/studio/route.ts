import { requireSubscription } from '@/lib/serverAuth';
import { apiResponse, apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { sanitizeString } from '@/lib/security';
import { generateStudioContent, getStudioPromptLibrary, resolveStudioContentType } from '@/ai/studio';
import { STUDIO_CONTENT_TYPES, LEGACY_STUDIO_CONTENT_TYPE_ALIASES } from '@/ai/studio/types';
import { queryStudioArtifacts } from '@/ai/telemetry/firestore';

const SUPPORTED_TYPES = new Set<string>([
  ...STUDIO_CONTENT_TYPES,
  ...Object.keys(LEGACY_STUDIO_CONTENT_TYPE_ALIASES),
]);

function validateTextField(value: unknown, fieldName: string, maxLength: number): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return `${fieldName} is required`;
  }

  if (value.length > maxLength) {
    return `${fieldName} is too long (max ${maxLength} characters)`;
  }

  return null;
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /ai/studio] Received request');

    const entitlements = await requireSubscription(req as any, 'explorer');
    logger.info('[API /ai/studio] Auth successful', { userId: entitlements.uid });

    const body = await req.json();

    if (!SUPPORTED_TYPES.has(String(body.contentType || ''))) {
      return apiError('Unsupported content type', { status: 400, code: 'INVALID_CONTENT_TYPE' });
    }

    const businessContextError = validateTextField(body.businessContext, 'businessContext', 4000);
    if (businessContextError) {
      return apiError(businessContextError, { status: 400, code: 'INVALID_INPUT' });
    }

    const targetAudience =
      typeof body.targetAudience === 'string' && body.targetAudience.trim()
        ? sanitizeString(body.targetAudience, 2000)
        : 'digital entrepreneurs, creators, and online business owners';

    const generated = await generateStudioContent({
      contentType: resolveStudioContentType(String(body.contentType)),
      businessContext: sanitizeString(body.businessContext, 4000),
      targetAudience,
      tone: typeof body.tone === 'string' ? body.tone : undefined,
      platform: typeof body.platform === 'string' ? body.platform : undefined,
      brandName: typeof body.brandName === 'string' ? body.brandName : undefined,
      brandVoice: typeof body.brandVoice === 'string' ? body.brandVoice : undefined,
      campaignGoal: typeof body.campaignGoal === 'string' ? body.campaignGoal : undefined,
      callToAction: typeof body.callToAction === 'string' ? body.callToAction : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      language: typeof body.language === 'string' ? body.language : undefined,
      keywords: Array.isArray(body.keywords) ? body.keywords.filter((item: unknown): item is string => typeof item === 'string') : undefined,
      userId: entitlements.uid,
      conversationSummary: typeof body.conversationSummary === 'string' ? body.conversationSummary : undefined,
    }, {
      userId: entitlements.uid,
      userTier: entitlements.subscription.plan || 'pro',
    });

    const artifacts = await queryStudioArtifacts(entitlements.uid, 12).catch((error) => {
      logger.warn('[API /ai/studio] Failed to load artifacts', {
        userId: entitlements.uid,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    });

    return apiResponse({
      content: generated,
      promptLibrary: getStudioPromptLibrary(),
      artifacts,
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 5 },
    timeout: 45000,
  }
);

export const GET = createAPIHandler(
  async (req) => {
    logger.info('[API /ai/studio] Prompt library requested');

    const entitlements = await requireSubscription(req as any, 'explorer');

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '12') || 12, 1), 50);
    const artifacts = await queryStudioArtifacts(entitlements.uid, limit).catch((error) => {
      logger.warn('[API /ai/studio] Failed to load artifacts', {
        userId: entitlements.uid,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    });

    return apiResponse({
      supportedContentTypes: STUDIO_CONTENT_TYPES,
      promptLibrary: getStudioPromptLibrary(),
      artifacts,
    }, {
      cache: {
        maxAge: 300,
        staleWhileRevalidate: 600,
        private: true,
      },
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
    timeout: 15000,
  }
);

export const POST = handler;
