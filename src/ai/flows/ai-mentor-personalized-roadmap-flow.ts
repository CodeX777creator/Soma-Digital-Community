'use server';
/**
 * @fileOverview AI mentor roadmap generation routed through the SDC AI Orchestrator.
 */

import { z } from 'genkit';
import { recordUsage } from '@/ai/analytics';
import { globalSemanticCache, isCacheableQuery } from '@/ai/core/semantic-cache';
import { estimateTokenCount } from '@/ai/core/tokenizer';
import { detectInjection } from '@/ai/guardrails';
import { logger } from '@/lib/logger';
import { buildRoadmapPrompt, extractJsonObject } from '@/ai/platform';
import { executeMonetizedTextRequest, recordSkippedCredits } from '@/services/ai-platform';

const BusinessGoalsInputSchema = z.object({
  businessGoals: z.string().describe('The user\'s business goals and aspirations.'),
  userId: z.string().optional().describe('User ID for tracking.'),
  existingContext: z.string().optional().describe('Previous conversation context.'),
});
export type BusinessGoalsInput = z.infer<typeof BusinessGoalsInputSchema>;

const PersonalizedRoadmapOutputSchema = z.object({
  roadmapTitle: z.string().describe('A title for the personalized business roadmap.'),
  primaryOpportunity: z.string().describe('The single biggest business opportunity for the user.'),
  fastestRevenuePath: z.string().describe('The quickest way for the user to start earning income.'),
  recommendedContentStrategy: z.string().describe('How the user should approach content to grow their audience.'),
  monetizationStrategy: z.string().describe('Specific ways the user will turn their efforts into wealth.'),
  aiGrowthForecast: z.string().describe('How AI will accelerate their business over the next 12 months.'),
  thirtyDayExecutionPlan: z.array(
    z.object({
      day: z.string().describe('Day or period (e.g. Day 1-7)'),
      task: z.string().describe('The primary focus or task'),
      outcome: z.string().describe('The expected result'),
    })
  ).describe('A structured 30-day plan.'),
  steps: z.array(
    z.object({
      title: z.string().describe('The title of a roadmap step.'),
      description: z.string().describe('A detailed description of the action items and strategy for this roadmap step.'),
      timeframe: z.string().optional().describe('Expected timeframe for this step.'),
      resources: z.array(z.string()).optional().describe('Resources needed for this step.'),
    })
  ).describe('An array of structured steps for the personalized roadmap.'),
});
export type PersonalizedRoadmapOutput = z.infer<typeof PersonalizedRoadmapOutputSchema>;

export async function generatePersonalizedRoadmap(
  input: BusinessGoalsInput
): Promise<PersonalizedRoadmapOutput> {
  const startTime = Date.now();

  try {
    const injectionCheck = detectInjection(input.businessGoals);
    if (!injectionCheck.passed && injectionCheck.confidence > 0.8) {
      throw new Error('Invalid input detected');
    }

    const cacheKey = `roadmap:${input.businessGoals.slice(0, 100)}`;
    if (input.userId && isCacheableQuery(cacheKey)) {
      const cached = await globalSemanticCache.get(cacheKey, input.userId);
      if (cached) {
        logger.info('[Roadmap] Cache hit', { userId: input.userId });
        const cachedModel = cached.metadata.model || 'cached-model';
        recordUsage({
          timestamp: Date.now(),
          userId: input.userId,
          model: cachedModel,
          inputTokens: 0,
          outputTokens: 0,
          operation: 'roadmap',
          cached: true,
          durationMs: Date.now() - startTime,
        });
        await recordSkippedCredits({
          userId: input.userId,
          task: 'roadmap_generation',
          feature: 'chat',
          modality: 'text',
          message: cacheKey,
          userTier: 'pro',
          providerMode: 'hybrid',
          requestId: `roadmap_cache_${startTime}`,
          metadata: {
            cacheHit: true,
            modelId: cachedModel,
          },
        }, 'cache_hit', {
          creditsWouldHaveCharged: 10,
        });
        return JSON.parse(cached.response) as PersonalizedRoadmapOutput;
      }
    }

    const prompt = buildRoadmapPrompt({
      businessGoals: injectionCheck.sanitized,
      userContext: {
        goals: input.businessGoals,
        skillLevel: 'intermediate',
        preferredTone: 'professional',
      },
      conversationSummary: input.existingContext,
    });

    const result = await executeMonetizedTextRequest({
      task: 'roadmap_generation',
      userId: input.userId,
      userTier: 'pro',
      qualityMode: 'premium',
      messages: [
        { role: 'system', content: prompt.systemPrompt },
        { role: 'user', content: prompt.userPrompt },
      ],
      maxOutputTokens: 1800,
    }, {
      userId: input.userId || 'anonymous',
      task: 'roadmap_generation',
      feature: 'chat',
      modality: 'text',
      message: prompt.userPrompt,
      userTier: 'pro',
      providerMode: 'hybrid',
      allowByok: true,
      requestId: `roadmap_${startTime}`,
    });

    const output = PersonalizedRoadmapOutputSchema.parse(extractJsonObject<PersonalizedRoadmapOutput>(result.text));
    const promptVersion = prompt.metadata.version;

    const durationMs = Date.now() - startTime;
    const outputTokens = estimateTokenCount(JSON.stringify(output));

    recordUsage({
      timestamp: startTime,
      userId: input.userId || 'anonymous',
      model: result.plan.modelId,
      inputTokens: estimateTokenCount(prompt.fullPrompt),
      outputTokens,
      operation: 'roadmap',
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
    logger.error('[Roadmap] Error generating roadmap', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
