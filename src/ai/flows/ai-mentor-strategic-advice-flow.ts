'use server';
/**
 * @fileOverview AI mentor strategic advice routed through the SDC AI Orchestrator.
 */

import { z } from 'genkit';
import { recordUsage } from '@/ai/analytics';
import { globalSemanticCache, isCacheableQuery } from '@/ai/core/semantic-cache';
import { estimateTokenCount } from '@/ai/core/tokenizer';
import { detectInjection } from '@/ai/guardrails';
import { logger } from '@/lib/logger';
import { buildStrategicAdvicePrompt, extractJsonObject } from '@/ai/platform';
import { executeMonetizedTextRequest, recordSkippedCredits } from '@/services/ai-platform';

const AIMentorStrategicAdviceInputSchema = z.object({
  topic: z.string().describe('The specific business topic the user wants advice on.'),
  businessDescription: z.string().describe('A detailed description of the user\'s business.'),
  userGoals: z.string().describe('The user\'s goals for their business.'),
  currentChallenges: z.string().describe('Any current challenges the user is facing.'),
  userId: z.string().optional().describe('User ID for tracking.'),
});
export type AIMentorStrategicAdviceInput = z.infer<typeof AIMentorStrategicAdviceInputSchema>;

const AIMentorStrategicAdviceOutputSchema = z.object({
  strategicAdvice: z.string().describe('Detailed strategic advice based on the provided inputs.'),
  actionableSteps: z.array(z.string()).describe('A list of concrete, actionable steps.'),
  prioritizedActions: z.array(z.object({
    action: z.string(),
    impact: z.enum(['high', 'medium', 'low']),
    effort: z.enum(['high', 'medium', 'low']),
    timeframe: z.string(),
  })).describe('Prioritized action matrix.'),
  personalizedRoadmapAdjustments: z.string().describe('Suggestions for adjusting their current business roadmap.'),
  resources: z.array(z.string()).optional().describe('Recommended resources for further learning.'),
});
export type AIMentorStrategicAdviceOutput = z.infer<typeof AIMentorStrategicAdviceOutputSchema>;

export async function aiMentorStrategicAdvice(input: AIMentorStrategicAdviceInput): Promise<AIMentorStrategicAdviceOutput> {
  const startTime = Date.now();

  try {
    const combinedInput = `${input.topic} ${input.businessDescription} ${input.userGoals} ${input.currentChallenges}`;
    const injectionCheck = detectInjection(combinedInput);
    if (!injectionCheck.passed && injectionCheck.confidence > 0.8) {
      throw new Error('Invalid input detected');
    }

    const cacheKey = `advice:${input.topic}:${input.businessDescription.slice(0, 50)}`;
    if (input.userId && isCacheableQuery(cacheKey)) {
      const cached = await globalSemanticCache.get(cacheKey, input.userId);
      if (cached) {
        logger.info('[StrategicAdvice] Cache hit', { userId: input.userId, topic: input.topic });
        const cachedModel = cached.metadata.model || 'cached-model';
        recordUsage({
          timestamp: Date.now(),
          userId: input.userId,
          model: cachedModel,
          inputTokens: 0,
          outputTokens: 0,
          operation: 'strategic_advice',
          cached: true,
          durationMs: Date.now() - startTime,
        });
        await recordSkippedCredits({
          userId: input.userId,
          task: 'strategic_advice',
          feature: 'business_coach',
          modality: 'text',
          message: cacheKey,
          userTier: 'pro',
          providerMode: 'hybrid',
          requestId: `strategic_advice_cache_${startTime}`,
          metadata: {
            cacheHit: true,
            modelId: cachedModel,
          },
        }, 'cache_hit', {
          creditsWouldHaveCharged: 1,
        });
        return JSON.parse(cached.response) as AIMentorStrategicAdviceOutput;
      }
    }

    const prompt = buildStrategicAdvicePrompt({
      topic: injectionCheck.sanitized.slice(0, input.topic.length),
      businessDescription: input.businessDescription,
      userGoals: input.userGoals,
      currentChallenges: input.currentChallenges,
      userContext: {
        goals: input.userGoals,
        skillLevel: 'intermediate',
        preferredTone: 'professional',
      },
    });

    const result = await executeMonetizedTextRequest({
      task: 'strategic_advice',
      userId: input.userId,
      userTier: 'pro',
      qualityMode: 'premium',
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ],
      maxOutputTokens: 1600,
    }, {
      userId: input.userId || 'anonymous',
      task: 'strategic_advice',
      feature: 'business_coach',
      modality: 'text',
      message: prompt.userPrompt,
      userTier: 'pro',
      providerMode: 'hybrid',
      allowByok: true,
      requestId: `strategic_advice_${startTime}`,
    });

    const output = AIMentorStrategicAdviceOutputSchema.parse(extractJsonObject<AIMentorStrategicAdviceOutput>(result.text));
    const promptVersion = prompt.metadata.version;

    const durationMs = Date.now() - startTime;
    const outputTokens = estimateTokenCount(JSON.stringify(output));

    recordUsage({
      timestamp: startTime,
      userId: input.userId || 'anonymous',
      model: result.plan.modelId,
      inputTokens: estimateTokenCount(combinedInput),
      outputTokens,
      operation: 'strategic_advice',
      cached: false,
      durationMs,
      promptVersion,
    });

    if (input.userId && isCacheableQuery(cacheKey)) {
      globalSemanticCache.set(cacheKey, JSON.stringify(output), {
        model: result.plan.modelId,
        tokensUsed: outputTokens,
        timestamp: Date.now(),
        userId: input.userId,
        promptVersion,
      });
    }

    return output;
  } catch (error) {
    logger.error('[StrategicAdvice] Error', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
