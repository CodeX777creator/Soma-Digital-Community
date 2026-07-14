import { NextRequest } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiResponse, apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import {
  generateAudioStudioAsset,
  getAudioStudioCapabilities,
  listAudioStudioAssets,
} from '@/ai/studio';
import {
  AUDIO_LANGUAGES,
  AUDIO_VOICE_PRESETS,
  type AudioLanguage,
  type AudioVoicePreset,
  type AudioVoiceProfile,
  type BrandTemplate,
  type ProductRules,
  type VoiceBrandProfile,
} from '@/ai/studio/types';
import { sanitizeString } from '@/lib/security';

function isAllowedVoicePreset(value: unknown): value is AudioVoicePreset {
  return typeof value === 'string' && (AUDIO_VOICE_PRESETS as readonly string[]).includes(value);
}

function isAllowedLanguage(value: unknown): value is string {
  return typeof value === 'string' && (AUDIO_LANGUAGES as readonly string[]).includes(value);
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

function normalizeVoiceProfile(value: unknown): AudioVoiceProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Record<string, unknown>;
  return {
    voiceId: typeof profile.voiceId === 'string' ? profile.voiceId : undefined,
    name: typeof profile.name === 'string' ? profile.name : undefined,
    description: typeof profile.description === 'string' ? profile.description : undefined,
    language: isAllowedLanguage(profile.language) ? (profile.language as AudioLanguage) : undefined,
    style: typeof profile.style === 'string' ? profile.style : undefined,
    stability: typeof profile.stability === 'number' ? profile.stability : undefined,
    similarityBoost: typeof profile.similarityBoost === 'number' ? profile.similarityBoost : undefined,
    speed: typeof profile.speed === 'number' ? profile.speed : undefined,
  };
}

function normalizeVoiceBrandProfile(value: unknown): VoiceBrandProfile | null {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Record<string, unknown>;
  return {
    voiceId: typeof profile.voiceId === 'string' ? profile.voiceId : undefined,
    name: typeof profile.name === 'string' ? profile.name : undefined,
    profileName: typeof profile.profileName === 'string' ? profile.profileName : undefined,
    provider: typeof profile.provider === 'string' ? profile.provider : undefined,
    description: typeof profile.description === 'string' ? profile.description : undefined,
    language: isAllowedLanguage(profile.language) ? (profile.language as AudioLanguage) : undefined,
    style: typeof profile.style === 'string' ? profile.style : undefined,
    stability: typeof profile.stability === 'number' ? profile.stability : undefined,
    similarityBoost: typeof profile.similarityBoost === 'number' ? profile.similarityBoost : undefined,
    speed: typeof profile.speed === 'number' ? profile.speed : undefined,
    isClonedVoice: typeof profile.isClonedVoice === 'boolean' ? profile.isClonedVoice : undefined,
    cloneSourceName: typeof profile.cloneSourceName === 'string' ? profile.cloneSourceName : undefined,
    cloneConsentConfirmed: typeof profile.cloneConsentConfirmed === 'boolean' ? profile.cloneConsentConfirmed : undefined,
    accent: typeof profile.accent === 'string' ? profile.accent : undefined,
    brandTone: typeof profile.brandTone === 'string' ? profile.brandTone : undefined,
    usageNotes: typeof profile.usageNotes === 'string' ? profile.usageNotes : undefined,
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

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '12');
  if (!Number.isFinite(value)) return 12;
  return Math.min(Math.max(Math.floor(value), 1), 50);
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /ai/audio-studio] Received request');
    const entitlements = await requireSubscription(req as any, 'explorer');

    const body = await req.json();

    if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return apiError('Prompt is required', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.prompt.length > 4000) {
      return apiError('Prompt too long (max 4000 characters)', { status: 400, code: 'INPUT_TOO_LONG' });
    }

    if (body.narrationText && typeof body.narrationText !== 'string') {
      return apiError('narrationText must be a string', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.transcript && typeof body.transcript !== 'string') {
      return apiError('transcript must be a string', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.voicePreset && !isAllowedVoicePreset(body.voicePreset)) {
      return apiError('Unsupported voice preset', { status: 400, code: 'INVALID_VOICE_PRESET' });
    }

    if (body.language && !isAllowedLanguage(body.language)) {
      return apiError('Unsupported language', { status: 400, code: 'INVALID_LANGUAGE' });
    }

    const audio = await generateAudioStudioAsset({
      prompt: sanitizeString(body.prompt, 4000),
      narrationText: typeof body.narrationText === 'string' ? sanitizeString(body.narrationText, 12000) : undefined,
      transcript: typeof body.transcript === 'string' ? sanitizeString(body.transcript, 12000) : undefined,
      title: typeof body.title === 'string' ? sanitizeString(body.title, 120) : undefined,
      voicePreset: isAllowedVoicePreset(body.voicePreset) ? body.voicePreset : undefined,
      voiceId: typeof body.voiceId === 'string' ? sanitizeString(body.voiceId, 120) : undefined,
      voiceProfile: normalizeVoiceProfile(body.voiceProfile),
      voiceBrandProfile: normalizeVoiceBrandProfile(body.voiceBrandProfile || body.voiceProfile),
      language: isAllowedLanguage(body.language) ? body.language : undefined,
      secondaryVoiceId: typeof body.secondaryVoiceId === 'string' ? sanitizeString(body.secondaryVoiceId, 120) : undefined,
      backgroundMusic: body.backgroundMusic === true,
      includeIntro: body.includeIntro !== false,
      includeOutro: body.includeOutro !== false,
      durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : undefined,
      brandTemplate: normalizeBrandTemplate(body.brandTemplate),
      productRules: normalizeProductRules(body.productRules),
      brandName: typeof body.brandName === 'string' ? sanitizeString(body.brandName, 200) : undefined,
      tone: typeof body.tone === 'string' ? sanitizeString(body.tone, 120) : undefined,
      scriptStyle: typeof body.scriptStyle === 'string' ? sanitizeString(body.scriptStyle, 120) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.filter((item: unknown): item is string => typeof item === 'string') : undefined,
      visibility: body.visibility === 'public' || body.visibility === 'team' ? body.visibility : 'private',
      userId: entitlements.uid,
      userTier: entitlements.subscription.plan || 'pro',
      providerPreference: typeof body.providerPreference === 'string' ? body.providerPreference : undefined,
      conversationSummary: typeof body.conversationSummary === 'string' ? sanitizeString(body.conversationSummary, 2000) : undefined,
    });

    return apiResponse({ audio });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 4 },
    timeout: 60000,
  }
);

export const GET = createAPIHandler(
  async (req) => {
    const entitlements = await requireSubscription(req as any, 'explorer');
    const limit = parseLimit(req);
    const assets = await listAudioStudioAssets(entitlements.uid, limit);

    return apiResponse({
      capabilities: getAudioStudioCapabilities(),
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
