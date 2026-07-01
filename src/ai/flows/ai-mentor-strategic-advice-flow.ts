'use server';
/**
 * @fileOverview An AI mentor that provides strategic business advice.
 * Enhanced with cost tracking, caching, and security improvements.
 */

import { ai, KIMI_MODELS } from '@/ai/genkit';
import { z } from 'genkit';
import { recordUsage } from '@/ai/analytics';
import { globalSemanticCache, isCacheableQuery } from '@/ai/core/semantic-cache';
import { estimateTokenCount } from '@/ai/core/tokenizer';
import { detectInjection } from '@/ai/guardrails';
import { logger } from '@/lib/logger';

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
    // Security check
    const combinedInput = `${input.topic} ${input.businessDescription} ${input.userGoals} ${input.currentChallenges}`;
    const injectionCheck = detectInjection(combinedInput);
    if (!injectionCheck.passed && injectionCheck.confidence > 0.8) {
      throw new Error('Invalid input detected');
    }

    // Check cache
    const cacheKey = `advice:${input.topic}:${input.businessDescription.slice(0, 50)}`;
    if (input.userId && isCacheableQuery(cacheKey)) {
      const cached = await globalSemanticCache.get(cacheKey, input.userId);
      if (cached) {
        logger.info('[StrategicAdvice] Cache hit', { userId: input.userId, topic: input.topic });
        return JSON.parse(cached.response);
      }
    }

    const result = await aiMentorStrategicAdviceFlow({
      ...input,
      topic: injectionCheck.sanitized.slice(0, input.topic.length),
    });
    
    // Record usage
    const durationMs = Date.now() - startTime;
    const outputTokens = estimateTokenCount(JSON.stringify(result));
    
    recordUsage({
      timestamp: startTime,
      userId: input.userId || 'anonymous',
      model: KIMI_MODELS.STANDARD,
      inputTokens: estimateTokenCount(combinedInput),
      outputTokens,
      operation: 'strategic_advice',
      cached: false,
      durationMs,
    });

    // Cache result
    if (input.userId && isCacheableQuery(cacheKey)) {
      globalSemanticCache.set(cacheKey, JSON.stringify(result), {
        model: KIMI_MODELS.STANDARD,
        tokensUsed: outputTokens,
        timestamp: Date.now(),
        userId: input.userId,
      });
    }

    return result;
  } catch (error) {
    logger.error('[StrategicAdvice] Error', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

const aiMentorStrategicAdvicePrompt = ai.definePrompt({
  name: 'aiMentorStrategicAdvicePrompt',
  model: 'kimi',
  config: {
    model: KIMI_MODELS.STANDARD,
  },
  input: { schema: AIMentorStrategicAdviceInputSchema },
  output: { schema: AIMentorStrategicAdviceOutputSchema },
  prompt: `You are an AI-powered strategic business mentor, expert in digital marketing, AI business, online income, entrepreneurship, branding, funnels, and the creator economy.

Analyze the following situation and provide strategic business advice:

### Business Description:
{{{businessDescription}}}

### User Goals:
{{{userGoals}}}

### Current Challenges:
{{{currentChallenges}}}

### Topic for Advice:
{{{topic}}}

Provide your analysis in a structured format:
1. Strategic advice that considers the full context
2. Actionable steps they can take immediately
3. Prioritized action matrix (impact vs effort)
4. Roadmap adjustments if needed
5. Relevant resources for deeper learning

Be specific, practical, and focused on measurable outcomes.`,
});

const aiMentorStrategicAdviceFlow = ai.defineFlow(
  {
    name: 'aiMentorStrategicAdviceFlow',
    inputSchema: AIMentorStrategicAdviceInputSchema,
    outputSchema: AIMentorStrategicAdviceOutputSchema,
  },
  async (input) => {
    const { output } = await aiMentorStrategicAdvicePrompt(input);
    return output!;
  },
);
