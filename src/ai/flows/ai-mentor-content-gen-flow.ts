'use server';
/**
 * @fileOverview AI mentor content generation routed through the SDC AI Content Studio.
 */

import { z } from 'genkit';
import { detectInjection } from '@/ai/guardrails';
import { logger } from '@/lib/logger';
import { generateStudioContent, resolveStudioContentType } from '@/ai/studio';
import { STUDIO_CONTENT_TYPES, LEGACY_STUDIO_CONTENT_TYPE_ALIASES } from '@/ai/studio/types';

const SUPPORTED_CONTENT_TYPES = new Set<string>([
  ...STUDIO_CONTENT_TYPES,
  ...Object.keys(LEGACY_STUDIO_CONTENT_TYPE_ALIASES),
]);

const ContentGenInputSchema = z.object({
  contentType: z.string().refine((value) => SUPPORTED_CONTENT_TYPES.has(value), {
    message: 'Unsupported content type',
  }).describe('The type of content to generate.'),
  businessContext: z.string().describe('The context or description of the business.'),
  targetAudience: z.string().describe('The primary target audience.'),
  tone: z.enum(['professional', 'casual', 'encouraging', 'direct', 'bold', 'playful', 'premium']).optional().describe('Tone of the content.'),
  platform: z.string().optional().describe('Target platform for the content.'),
  brandName: z.string().optional().describe('Brand or company name.'),
  brandVoice: z.string().optional().describe('Brand voice guidance.'),
  campaignGoal: z.string().optional().describe('Campaign goal or business objective.'),
  callToAction: z.string().optional().describe('Desired call to action.'),
  keywords: z.array(z.string()).optional().describe('Keywords to include in the content.'),
  notes: z.string().optional().describe('Additional instructions.'),
  language: z.string().optional().describe('Preferred output language.'),
  userId: z.string().optional().describe('User ID for caching and tracking.'),
  conversationSummary: z.string().optional().describe('Optional conversation summary for context.'),
});
export type ContentGenInput = z.infer<typeof ContentGenInputSchema>;

const ContentGenOutputSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  generatedContent: z.string(),
  strategicTips: z.array(z.string()).default([]),
  variations: z.array(z.string()).default([]),
  sections: z.array(z.object({
    heading: z.string(),
    body: z.string(),
  })).default([]),
  promptPack: z.array(z.object({
    title: z.string(),
    prompt: z.string(),
    useCase: z.string(),
  })).optional(),
  metadata: z.record(z.any()).default({}),
});
export type ContentGenOutput = z.infer<typeof ContentGenOutputSchema>;

export async function generateMentorContent(input: ContentGenInput): Promise<ContentGenOutput> {
  try {
    const injectionCheck = detectInjection(`${input.businessContext} ${input.targetAudience}`);
    if (!injectionCheck.passed && injectionCheck.confidence > 0.8) {
      throw new Error('Invalid input detected');
    }

    const result = await generateStudioContent(
      {
        contentType: resolveStudioContentType(input.contentType),
        businessContext: injectionCheck.sanitized,
        targetAudience: input.targetAudience,
        tone: input.tone,
        platform: input.platform,
        brandName: input.brandName,
        brandVoice: input.brandVoice,
        campaignGoal: input.campaignGoal,
        callToAction: input.callToAction,
        keywords: input.keywords,
        notes: input.notes,
        language: input.language,
        userId: input.userId,
        conversationSummary: input.conversationSummary,
      },
      {
        userId: input.userId,
        userTier: 'pro',
      }
    );

    return ContentGenOutputSchema.parse({
      title: result.title,
      summary: result.summary,
      generatedContent: result.generatedContent,
      strategicTips: result.strategicTips,
      variations: result.variants,
      sections: result.sections,
      promptPack: result.promptPack,
      metadata: {
        ...result.metadata,
        contentType: result.contentType,
        providerId: result.providerId,
        modelId: result.modelId,
        promptKey: result.promptKey,
      },
    });
  } catch (error) {
    logger.error('[ContentGen] Error generating content', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
