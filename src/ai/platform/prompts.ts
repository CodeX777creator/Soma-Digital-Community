import { buildPrompt, PROMPT_TEMPLATES, type UserContext } from '@/ai/core/prompt-builder';

export interface StructuredPrompt {
  systemPrompt: string;
  userPrompt: string;
  fullPrompt: string;
  metadata: {
    version: string;
    template: string;
  };
}

export interface PromptContext {
  userContext: UserContext;
  conversationSummary?: string;
  recentMessages?: Array<{ role: string; content: string }>;
  variables?: Record<string, string | number | boolean>;
}

function normalizePrompt(config: Parameters<typeof buildPrompt>[0]): StructuredPrompt {
  const built = buildPrompt(config);
  return {
    systemPrompt: built.systemPrompt,
    userPrompt: built.userPrompt,
    fullPrompt: built.fullPrompt,
    metadata: {
      version: built.metadata.version,
      template: built.metadata.template,
    },
  };
}

export function buildStrategicAdvicePrompt(context: {
  topic: string;
  businessDescription: string;
  userGoals: string;
  currentChallenges: string;
  userContext: UserContext;
  conversationSummary?: string;
}): StructuredPrompt {
  return normalizePrompt({
    template: PROMPT_TEMPLATES.strategicAdvice,
    userContext: context.userContext,
    conversationContext: context.conversationSummary ? { summary: context.conversationSummary } : undefined,
    variables: {
      topic: context.topic,
      businessDescription: context.businessDescription,
      userGoals: context.userGoals,
      currentChallenges: context.currentChallenges,
    },
  });
}

export function buildContentGenerationPrompt(context: {
  contentType: string;
  businessContext: string;
  targetAudience: string;
  tone?: string;
  userContext: UserContext;
  conversationSummary?: string;
}): StructuredPrompt {
  return normalizePrompt({
    template: PROMPT_TEMPLATES.contentGeneration,
    userContext: context.userContext,
    conversationContext: context.conversationSummary ? { summary: context.conversationSummary } : undefined,
    variables: {
      contentType: context.contentType,
      businessContext: context.businessContext,
      targetAudience: context.targetAudience,
      tone: context.tone || 'professional',
    },
  });
}

export function buildRoadmapPrompt(context: {
  businessGoals: string;
  userContext: UserContext;
  conversationSummary?: string;
}): StructuredPrompt {
  return normalizePrompt({
    template: PROMPT_TEMPLATES.roadmapGeneration,
    userContext: context.userContext,
    conversationContext: context.conversationSummary ? { summary: context.conversationSummary } : undefined,
    variables: {
      businessGoals: context.businessGoals,
    },
  });
}

