import { recordUsage } from '@/ai/analytics';
import { detectInjection } from '@/ai/guardrails';
import { estimateTokenCount } from '@/ai/core/tokenizer';
import { globalSemanticCache, isCacheableQuery } from '@/ai/core/semantic-cache';
import { extractJsonObject } from '@/ai/platform';
import { persistStudioArtifact } from '@/ai/telemetry/firestore';
import { executeMonetizedTextRequest, normalizeRoutingPlan, recordSkippedCredits } from '@/services/ai-platform';
import { logger } from '@/lib/logger';
import { sanitizeString } from '@/lib/security';
import {
  buildStudioPrompt,
  getStudioPromptLibrary,
  resolveStudioContentType,
} from './prompts';
import { resolveStudioCreditPolicy } from './credit-policy';
import type {
  StudioGenerationInput,
  StudioGenerationOutput,
  StudioGenerationResult,
  StudioContentType,
} from './types';

const STUDIO_PROMPT_VERSION = '1.0.0';
const STUDIO_SCHEMA_VARIANT = 'studio-text-v1';

async function safePersistStudioArtifact(record: Parameters<typeof persistStudioArtifact>[0]): Promise<void> {
  try {
    await persistStudioArtifact(record);
  } catch (error) {
    logger.warn('[Studio] Failed to persist studio artifact', {
      artifactId: record.artifactId,
      ownerId: record.ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildCacheKey(input: StudioGenerationInput, resolvedType: StudioContentType): string {
  return [
    resolvedType,
    input.businessContext,
    input.targetAudience,
    input.tone || 'default',
    input.platform || 'default',
    input.brandName || 'default',
    input.campaignGoal || 'default',
    input.callToAction || 'default',
    input.language || 'English',
  ].join(':');
}

function normalizeParsedOutput(parsed: Partial<StudioGenerationOutput>, contentType: StudioContentType): StudioGenerationOutput {
  const generatedContent = typeof parsed.generatedContent === 'string' ? parsed.generatedContent : '';
  const strategicTips = Array.isArray(parsed.strategicTips)
    ? parsed.strategicTips.filter((item): item is string => typeof item === 'string')
    : [];
  const variants = Array.isArray(parsed.variants)
    ? parsed.variants.filter((item): item is string => typeof item === 'string')
    : [];
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .filter((section) => section && typeof section === 'object')
        .map((section) => ({
          heading: typeof (section as { heading?: unknown }).heading === 'string' ? (section as { heading: string }).heading : 'Section',
          body: typeof (section as { body?: unknown }).body === 'string' ? (section as { body: string }).body : '',
        }))
    : [];

  const promptPack = Array.isArray(parsed.promptPack)
    ? parsed.promptPack
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => ({
          title: typeof (entry as { title?: unknown }).title === 'string' ? (entry as { title: string }).title : 'Prompt',
          prompt: typeof (entry as { prompt?: unknown }).prompt === 'string' ? (entry as { prompt: string }).prompt : '',
          useCase: typeof (entry as { useCase?: unknown }).useCase === 'string' ? (entry as { useCase: string }).useCase : 'General use',
        }))
    : undefined;

  return {
    schemaVariant: STUDIO_SCHEMA_VARIANT,
    contentType,
    title: typeof parsed.title === 'string' && parsed.title.trim().length > 0 ? parsed.title : `${contentType.replace('_', ' ')} draft`,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    generatedContent,
    strategicTips,
    variants,
    sections,
    ...(promptPack ? { promptPack } : {}),
    metadata: typeof parsed.metadata === 'object' && parsed.metadata !== null ? parsed.metadata : {},
  };
}

async function generateStudioContentInternal(
  input: StudioGenerationInput,
  options: { userTier?: 'free' | 'explorer' | 'pro' | 'elite'; userId?: string } = {}
): Promise<StudioGenerationResult> {
  const startedAt = Date.now();
  const resolvedContentType = resolveStudioContentType(input.contentType);
  const cacheKey = buildCacheKey(input, resolvedContentType);
  const combinedInput = `${input.businessContext} ${input.targetAudience} ${input.platform || ''} ${input.brandVoice || ''} ${input.notes || ''}`;

  const injectionCheck = detectInjection(combinedInput);
  if (!injectionCheck.passed && injectionCheck.confidence >= 0.8) {
    throw new Error('Invalid input detected');
  }

  const normalizedInput: StudioGenerationInput = {
    ...input,
    contentType: resolvedContentType,
    businessContext: sanitizeString(injectionCheck.sanitized || input.businessContext, 4000),
    targetAudience: sanitizeString(input.targetAudience, 2000),
    tone: input.tone,
    platform: sanitizeString(input.platform || 'unspecified', 200),
    brandName: sanitizeString(input.brandName || '', 200) || undefined,
    brandVoice: sanitizeString(input.brandVoice || '', 500) || undefined,
    campaignGoal: sanitizeString(input.campaignGoal || '', 500) || undefined,
    callToAction: sanitizeString(input.callToAction || '', 500) || undefined,
    notes: sanitizeString(input.notes || '', 1000) || undefined,
    language: sanitizeString(input.language || 'English', 100),
    keywords: input.keywords?.map((keyword) => sanitizeString(keyword, 100)).filter((keyword): keyword is string => Boolean(keyword)),
    conversationSummary: sanitizeString(input.conversationSummary || '', 2000) || undefined,
  };

  if (input.userId && isCacheableQuery(cacheKey)) {
    const cached = await globalSemanticCache.get(cacheKey, input.userId);
    if (cached) {
      const cachedOutput = normalizeParsedOutput(JSON.parse(cached.response) as Partial<StudioGenerationOutput>, resolvedContentType);
      const cachedModel = cached.metadata.model || 'cached-model';
      const cachedPromptVersion = cached.metadata.promptVersion || STUDIO_PROMPT_VERSION;
      const cachedCreditPolicy = await resolveStudioCreditPolicy(resolvedContentType);
      await recordSkippedCredits({
        userId: options.userId || input.userId,
        task: 'content_generation',
        feature: cachedCreditPolicy.feature,
        modality: 'text',
        message: cacheKey,
        userTier: options.userTier || 'pro',
        providerMode: 'hybrid',
        requestId: `studio_cache_${startedAt}`,
        metadata: {
          cacheHit: true,
          studioContentType: resolvedContentType,
          modelId: cachedModel,
          promptVersion: cachedPromptVersion,
        },
      }, 'cache_hit', {
        creditsWouldHaveCharged: cachedCreditPolicy.credits,
      });
      recordUsage({
        timestamp: startedAt,
        userId: input.userId,
        model: cachedModel,
        inputTokens: 0,
        outputTokens: 0,
        operation: 'content_gen',
        cached: true,
        durationMs: Date.now() - startedAt,
        promptVersion: cachedPromptVersion,
      });
      await safePersistStudioArtifact({
        artifactId: `studio_${startedAt}_${Math.random().toString(36).slice(2, 8)}`,
        ownerId: input.userId,
        schemaVariant: STUDIO_SCHEMA_VARIANT,
        source: 'cached',
        cacheKey,
        contentType: resolvedContentType,
        title: cachedOutput.title,
        summary: cachedOutput.summary,
        generatedContent: cachedOutput.generatedContent,
        strategicTips: cachedOutput.strategicTips,
        variants: cachedOutput.variants,
        sections: cachedOutput.sections,
        promptPack: cachedOutput.promptPack,
        metadata: {
          ...cachedOutput.metadata,
          cacheHit: true,
          promptVersion: cachedPromptVersion,
          promptKey: resolvedContentType,
        },
        providerId: cachedModel.includes('moonshot') ? 'moonshot' : 'vercel-ai-gateway',
        modelId: cachedModel,
        promptKey: resolvedContentType,
        promptVersion: cachedPromptVersion,
        promptPreview: cached.response.slice(0, 180),
        durationMs: Date.now() - startedAt,
      });
      return {
        ...cachedOutput,
        providerId: cachedModel.includes('moonshot') ? 'moonshot' : 'vercel-ai-gateway',
        modelId: cachedModel,
        durationMs: Date.now() - startedAt,
        promptKey: resolvedContentType,
        promptVersion: cachedPromptVersion,
        schemaVariant: STUDIO_SCHEMA_VARIANT,
      };
    }
  }

  const prompt = buildStudioPrompt(normalizedInput);
  const qualityMode =
    resolvedContentType === 'script' ||
    resolvedContentType === 'blog' ||
    resolvedContentType === 'sales_funnel' ||
    resolvedContentType === 'marketing_planner' ||
    resolvedContentType === 'prompt_library'
      ? 'premium'
      : 'balanced';
  const creditPolicy = await resolveStudioCreditPolicy(resolvedContentType);

  const result = await executeMonetizedTextRequest({
    task: 'content_generation',
    userId: options.userId || input.userId,
    userTier: normalizeRoutingPlan(options.userTier || 'pro'),
    qualityMode,
    messages: [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userPrompt },
    ],
    maxOutputTokens: resolvedContentType === 'marketing_planner' || resolvedContentType === 'sales_funnel' ? 2200 : 1600,
  } as any, {
    userId: options.userId || input.userId || 'anonymous',
    task: 'content_generation',
    feature: creditPolicy.feature,
    modality: 'text',
    message: prompt.userPrompt,
    userTier: options.userTier || 'pro',
    providerMode: 'hybrid',
    allowByok: true,
    requestId: `studio_${startedAt}`,
    metadata: {
      studioContentType: resolvedContentType,
      creditOverride: creditPolicy.credits,
    },
  });

  const parsed = extractJsonObject<Partial<StudioGenerationOutput>>(result.text);
  const normalized = normalizeParsedOutput(parsed, resolvedContentType);
  const outputTokens = estimateTokenCount(JSON.stringify(normalized));
  const artifactId = `studio_${startedAt}_${Math.random().toString(36).slice(2, 8)}`;
  const promptVersion = prompt.metadata.version || STUDIO_PROMPT_VERSION;

  recordUsage({
    timestamp: startedAt,
    userId: options.userId || input.userId || 'anonymous',
    model: result.plan.modelId,
    inputTokens: estimateTokenCount(prompt.fullPrompt),
    outputTokens,
    operation: 'content_gen',
    cached: false,
    durationMs: result.durationMs,
    promptVersion,
  });

  if (input.userId && isCacheableQuery(cacheKey)) {
    globalSemanticCache.set(cacheKey, JSON.stringify(normalized), {
      model: result.plan.modelId,
      tokensUsed: outputTokens,
      timestamp: Date.now(),
      userId: input.userId,
      promptVersion,
    });
  }

  if (options.userId || input.userId) {
    await safePersistStudioArtifact({
      artifactId,
      ownerId: options.userId || input.userId || 'anonymous',
      schemaVariant: STUDIO_SCHEMA_VARIANT,
      source: 'generated',
      cacheKey,
      contentType: resolvedContentType,
      title: normalized.title,
      summary: normalized.summary,
      generatedContent: normalized.generatedContent,
      strategicTips: normalized.strategicTips,
      variants: normalized.variants,
      sections: normalized.sections,
      promptPack: normalized.promptPack,
      metadata: {
        ...normalized.metadata,
        promptVersion,
        promptKey: prompt.metadata.template,
        qualityMode,
        cached: false,
      },
      providerId: result.plan.providerId,
      modelId: result.plan.modelId,
      promptKey: prompt.metadata.template,
      promptVersion,
      promptPreview: prompt.fullPrompt.slice(0, 180),
      durationMs: result.durationMs,
    });
  }

  return {
    ...normalized,
    providerId: result.plan.providerId,
    modelId: result.plan.modelId,
    durationMs: result.durationMs,
    promptKey: prompt.metadata.template,
    promptVersion,
    schemaVariant: STUDIO_SCHEMA_VARIANT,
  };
}

export async function generateStudioContent(
  input: StudioGenerationInput,
  options: { userTier?: 'free' | 'explorer' | 'pro' | 'elite'; userId?: string } = {}
): Promise<StudioGenerationResult> {
  logger.info('[Studio] Generating content', {
    contentType: input.contentType,
    platform: input.platform,
    brandName: input.brandName,
    userId: options.userId || input.userId,
  });

  return generateStudioContentInternal(input, options);
}

export async function generateMentorContent(
  input: StudioGenerationInput,
  options: { userTier?: 'free' | 'explorer' | 'pro' | 'elite'; userId?: string } = {}
): Promise<{
  generatedContent: string;
  strategicTips: string[];
  variations: string[];
  metadata: Record<string, unknown>;
}> {
  const result = await generateStudioContent(input, options);

  return {
    generatedContent: result.generatedContent,
    strategicTips: result.strategicTips,
    variations: result.variants,
    metadata: {
      contentType: result.contentType,
      title: result.title,
      summary: result.summary,
      providerId: result.providerId,
      modelId: result.modelId,
      promptKey: result.promptKey,
      promptVersion: result.promptVersion,
      promptLibrary: getStudioPromptLibrary(),
    },
  };
}
