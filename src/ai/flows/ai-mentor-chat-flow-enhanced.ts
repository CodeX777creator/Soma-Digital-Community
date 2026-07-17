/**
 * Enhanced AI Mentor Chat Flow
 * 
 * Production-ready implementation with:
 * - Streaming support
 * - Context window management
 * - Semantic caching
 * - Prompt injection protection
 * - Conversation memory
 * - Cost tracking
 */

'use server';

import { ai, KIMI_MODELS } from '@/ai/genkit';
import { z } from 'genkit';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { 
  estimateTokenCount, 
  truncateMessages, 
  calculateTokenBudget,
  Message,
  formatMessagesForProvider,
  TokenTracker,
  validateTokenLimits,
  MODEL_CONTEXT_LIMITS,
  ModelId,
} from '@/ai/core/tokenizer';
import { 
  createSSEStream, 
  wrapOpenAIStream, 
  StreamChunk,
  simulateStream,
} from '@/ai/core/streaming-handler';
import { globalSemanticCache, isCacheableQuery } from '@/ai/core/semantic-cache';
import { detectInjection, globalInjectionTracker, assessSecurity } from '@/ai/guardrails/injection-guard';
import { 
  extractInsights, 
  storeMemory, 
  getMemoryContext,
  generateConversationSummary,
  formatMemoryForPrompt,
  extractInsightsWithImportance,
  getRelevantContext,
  vectorMemoryStore,
} from '@/ai/memory/conversation-memory';
import { hydrateMentorMemory, persistMentorMemory } from '@/ai/memory/persistent-memory';
import {
  selectModel,
  circuitBreaker,
  RoutingDecision,
} from '@/ai/core/model-router';
import { recordUsage, checkBudget } from '@/ai/analytics/cost-tracker';
import { buildChatPrompt, PROMPT_TEMPLATES, UserContext } from '@/ai/core/prompt-builder';
import { resolveAIExecutionPlan } from '@/ai/platform';
import { executeMonetizedTextRequest, executeMonetizedTextStream, normalizeRoutingPlan, recordSkippedCredits } from '@/services/ai-platform';
import { logger } from '@/lib/logger';

// Input/output schemas
const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

const AIChatInputSchema = z.object({
  history: z.array(ChatMessageSchema),
  message: z.string(),
  userId: z.string(),
  threadId: z.string(),
  userContext: z.object({
    goals: z.string().optional(),
    skillLevel: z.string().optional(),
    industry: z.string().optional(),
    businessStage: z.string().optional(),
    preferredTone: z.enum(['professional', 'casual', 'encouraging', 'direct']).optional(),
  }).optional(),
  enableStreaming: z.boolean().optional(),
  modelHint: z.enum(['cheap', 'smart', 'auto']).optional(),
  userTier: z.enum(['explorer', 'pro', 'elite']).optional(),
});

export type AIChatInput = z.infer<typeof AIChatInputSchema>;

export interface AIChatOutput {
  response: string;
  metadata: {
    model: string;
    tokensUsed: { input: number; output: number };
    cost: number;
    cached: boolean;
    durationMs: number;
    promptVersion: string;
    routing?: RoutingDecision;
    security?: {
      threatLevel: string;
      action: string;
    };
  };
}

const MENTOR_CHAT_PROMPT_VERSION = PROMPT_TEMPLATES.chat.version;

function mapMentorPreferences(input: AIChatInput): Record<string, unknown> {
  const preferences: Record<string, unknown> = {};
  const { userContext } = input;

  if (userContext?.skillLevel && ['beginner', 'intermediate', 'advanced'].includes(userContext.skillLevel)) {
    preferences.expertiseLevel = userContext.skillLevel;
  }

  if (userContext?.preferredTone) {
    preferences.preferredTone = userContext.preferredTone;
  }

  if (userContext?.businessStage) {
    preferences.preferredTopics = [userContext.businessStage];
  }

  if (userContext?.industry) {
    preferences.avoidedTopics = preferences.avoidedTopics || [];
  }

  return preferences;
}

async function captureMentorMemory(input: AIChatInput, assistantResponse: string): Promise<void> {
  const insights = extractInsights(input.message, 'user', input.threadId);

  let summary: ReturnType<typeof generateConversationSummary> | undefined;
  if (input.history.length % 10 === 0) {
    summary = generateConversationSummary(
      input.threadId,
      [...input.history, { role: 'user', content: input.message }, { role: 'assistant', content: assistantResponse }]
    );
  }

  const preferences = mapMentorPreferences(input);
  const businessGoals = input.userContext?.goals || undefined;
  if (businessGoals || Object.keys(preferences).length > 0 || insights.length > 0 || summary) {
    await persistMentorMemory({
      userId: input.userId,
      threadId: input.threadId,
      businessGoals,
      preferences: Object.keys(preferences).length > 0 ? preferences : undefined,
      insights: insights.length > 0 ? insights : undefined,
      summary,
    });
  }
}

/**
 * Main chat function with all enhancements
 */
export async function aiMentorChatEnhanced(
  input: AIChatInput
): Promise<AIChatOutput> {
  const startTime = Date.now();
  const requestId = `chat_${Date.now()}`;
  
  try {
    // 1. Check budget constraints
    const budgetCheck = await checkBudget(input.userId);
    if (budgetCheck.exceeded) {
      throw new Error('Budget exceeded. Please try again later or upgrade your plan.');
    }

    // 2. Advanced security assessment with behavioral analysis
    const securityCheck = assessSecurity(input.message, input.userId);
    if (securityCheck.action === 'block') {
      const tracker = globalInjectionTracker.recordAttempt(input.userId);
      if (tracker.blocked) {
        throw new Error('Security violation detected. Account temporarily restricted.');
      }
      throw new Error('Request blocked for security reasons.');
    }
    
    if (securityCheck.action === 'quarantine' || securityCheck.action === 'warn') {
      logger.warn('[ChatFlow] Security alert', {
        userId: input.userId,
        action: securityCheck.action,
        threatLevel: securityCheck.threatLevel,
      });
    }

    // 3. Check semantic cache for similar queries
    if (isCacheableQuery(input.message)) {
      const cached = await globalSemanticCache.get(input.message, input.userId);
      if (cached) {
        logger.info('[ChatFlow] Cache hit', { userId: input.userId });
        
        // Extract insights even from cached responses
        const insights = extractInsights(input.message, 'user', input.threadId);
        if (insights.length > 0) {
          storeMemory(input.userId, { insights });
        }
        
        // Also store vector embeddings
        const vectorInsights = extractInsightsWithImportance(input.message, 'user', input.threadId);
        for (const insight of vectorInsights) {
          await vectorMemoryStore.add(input.userId, insight);
        }

        const cachedModel = cached.metadata.model || 'cached-model';
        const userTier = input.userTier || 'pro';
        recordUsage({
          timestamp: Date.now(),
          userId: input.userId,
          model: cachedModel,
          inputTokens: 0,
          outputTokens: 0,
          operation: 'chat',
          cached: true,
          durationMs: Date.now() - startTime,
          promptVersion: MENTOR_CHAT_PROMPT_VERSION,
        });

        await recordSkippedCredits({
          userId: input.userId,
          task: 'chat',
          feature: 'chat',
          modality: 'text',
          message: securityCheck.sanitized,
          userTier,
          providerMode: 'hybrid',
          requestId: `mentor_cache_${requestId}`,
          metadata: {
            cacheHit: true,
            promptVersion: MENTOR_CHAT_PROMPT_VERSION,
            modelId: cachedModel,
          },
        }, 'cache_hit', {
          creditsWouldHaveCharged: 1,
        });

        await captureMentorMemory(input, cached.response);

        return {
          response: cached.response,
          metadata: {
            model: cached.metadata.model,
            tokensUsed: { input: 0, output: 0 },
            cost: 0,
            cached: true,
            durationMs: Date.now() - startTime,
            promptVersion: MENTOR_CHAT_PROMPT_VERSION,
            security: {
              threatLevel: securityCheck.threatLevel,
              action: securityCheck.action,
            },
          },
        };
      }
    }

    // 4. Get enhanced memory context
    await hydrateMentorMemory(input.userId, { maxInsights: 12, maxSummaries: 6 });
    const legacyMemoryContext = getMemoryContext(input.userId, { maxInsights: 3 });
    const legacyMemoryText = formatMemoryForPrompt(legacyMemoryContext);
    
    // Get vector-based semantic memory
    const relevantVectorMemories = await getRelevantContext(input.userId, input.message, {
      maxResults: 5,
      types: ['goal', 'fact', 'preference'],
    });
    
    // Combine memory contexts
    const combinedMemoryContext = relevantVectorMemories.length > 0
      ? `User Context:\n${relevantVectorMemories.map(m => `- ${m.content}`).join('\n')}`
      : legacyMemoryText;

    // 5. Smart model selection with routing
    const userTier = input.userTier || 'pro';
    const routing = selectModel(securityCheck.sanitized, {
      history: input.history.map((h) => h.content),
      budgetMode: input.modelHint === 'cheap' ? 'strict' : input.modelHint === 'smart' ? 'performance' : 'balanced',
      userTier,
    });

    const executionPlan = resolveAIExecutionPlan({
      messages: [...input.history, { role: 'user', content: securityCheck.sanitized }],
      modelHint: input.modelHint,
      userTier: normalizeRoutingPlan(userTier),
    });

    logger.info('[ChatFlow] Model selected', {
      model: routing.primaryModel,
      confidence: routing.confidence,
      reasoning: routing.reasoning,
      provider: executionPlan.providerId,
      gatewayModel: executionPlan.modelId,
    });

    // 6. Build conversation history with context management
    const historyMessages: Message[] = input.history.map(h => ({
      role: h.role,
      content: h.content,
    }));

    // Add system prompt with memory
    const systemPrompt = buildChatPrompt(securityCheck.sanitized, {
      goals: input.userContext?.goals,
      skillLevel: input.userContext?.skillLevel,
      industry: input.userContext?.industry,
      businessStage: input.userContext?.businessStage,
      preferredTone: input.userContext?.preferredTone,
      extractedInsights: legacyMemoryContext.relevantInsights.map(i => i.content),
    }, {
      conversationSummary: combinedMemoryContext,
    });

    const systemMessage: Message = {
      role: 'system',
      content: systemPrompt,
    };

    const userMessage: Message = {
      role: 'user',
      content: securityCheck.sanitized,
    };

    // 7. Calculate budget and truncate if needed
    const budget = calculateTokenBudget(executionPlan.modelId, systemPrompt);
    const { messages: truncatedHistory } = truncateMessages(
      [...historyMessages, userMessage],
      budget,
    );

    const allMessages = [systemMessage, ...truncatedHistory];

    // 8. Validate token limits
    const validation = validateTokenLimits(allMessages, executionPlan.modelId);
    if (!validation.valid) {
      throw new Error(`Token limit exceeded: ${validation.error}`);
    }

    // 9. Call the monetized AI platform. Routing, fallback, BYOK, and credits are handled centrally.
    const formattedMessages = formatMessagesForProvider(allMessages, 'openai') as ChatCompletionMessageParam[];

    const completionResult = await executeMonetizedTextRequest({
      task: 'chat',
      messages: formattedMessages.map((message) => ({
        role: message.role,
        content: typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content || ''),
      })),
      userId: input.userId,
      userTier: normalizeRoutingPlan(userTier),
      modelHint: input.modelHint,
      qualityMode: input.modelHint === 'cheap' ? 'economy' : input.modelHint === 'smart' ? 'premium' : 'balanced',
      maxOutputTokens: 2048,
    }, {
      userId: input.userId,
      task: 'chat',
      feature: 'chat',
      modality: 'text',
      message: securityCheck.sanitized,
      userTier,
      providerMode: 'hybrid',
      allowByok: true,
      requestId,
      metadata: {
        promptVersion: MENTOR_CHAT_PROMPT_VERSION,
      },
    });
    const completion = {
      providerId: completionResult.plan.providerId,
      modelId: completionResult.plan.modelId,
      content: completionResult.text,
    };
    circuitBreaker.recordSuccess(completion.modelId);

    const content = completion.content;

    // 10. Calculate usage
    const inputTokens = validation.estimatedTokens;
    const outputTokens = estimateTokenCount(content);
    const durationMs = Date.now() - startTime;

    // 11. Record usage for analytics
    const usageRecord = recordUsage({
      timestamp: startTime,
      userId: input.userId,
      sessionId: input.threadId,
      model: completion.modelId,
      inputTokens,
      outputTokens,
      operation: 'chat',
      cached: false,
      durationMs,
      promptVersion: MENTOR_CHAT_PROMPT_VERSION,
    });

    // 12. Cache the response
    if (isCacheableQuery(input.message) && content.length > 50) {
      globalSemanticCache.set(input.message, content, {
        model: completion.modelId,
        tokensUsed: inputTokens + outputTokens,
        timestamp: Date.now(),
        userId: input.userId,
        promptVersion: MENTOR_CHAT_PROMPT_VERSION,
      });
    }

    // 13. Extract and store insights (both legacy and vector)
    const insights = extractInsights(input.message, 'user', input.threadId);
    if (insights.length > 0) {
      storeMemory(input.userId, { insights });
    }
    
    // Store vector embeddings for semantic search
    const vectorInsights = extractInsightsWithImportance(input.message, 'user', input.threadId);
    for (const insight of vectorInsights) {
      await vectorMemoryStore.add(input.userId, insight);
    }

    // 14. Update conversation summary periodically
    if (input.history.length % 10 === 0) {
      const summary = generateConversationSummary(
        input.threadId,
        [...input.history, { role: 'user', content: input.message }, { role: 'assistant', content }]
      );
      storeMemory(input.userId, { summary });
    }

    await captureMentorMemory(input, content);

    return {
      response: content,
      metadata: {
        model: completion.modelId,
        tokensUsed: { input: inputTokens, output: outputTokens },
        cost: usageRecord.cost,
        cached: false,
        durationMs,
        promptVersion: MENTOR_CHAT_PROMPT_VERSION,
        routing,
        security: {
          threatLevel: securityCheck.threatLevel,
          action: securityCheck.action,
        },
      },
    };

  } catch (error) {
    logger.error('[ChatFlow] Error in aiMentorChatEnhanced', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Streaming version of chat
 */
export async function* aiMentorChatStream(
  input: AIChatInput
): AsyncGenerator<StreamChunk> {
  const paidResult = await aiMentorChatEnhanced({
    ...input,
    enableStreaming: false,
  });

  for await (const chunk of simulateStream(paidResult.response, { chunkSize: 42, delayMs: 15 })) {
    yield {
      ...chunk,
      metadata: chunk.isComplete
        ? {
            model: paidResult.metadata.model,
            tokensUsed: paidResult.metadata.tokensUsed.input + paidResult.metadata.tokensUsed.output,
            finishReason: 'stop',
            securityThreatLevel: (paidResult.metadata.security?.threatLevel || 'none') as NonNullable<StreamChunk['metadata']>['securityThreatLevel'],
          }
        : chunk.metadata,
    };
  }
  return;

  /*
   * Deprecated direct provider streaming implementation removed.
   * Streaming now uses aiMentorChatEnhanced so Creator Credits, telemetry,
   * cache skips, prompt guardrails, and BYOK rules are enforced consistently.
   *
  const startTime = Date.now();
  const requestId = `chat_stream_${Date.now()}`;
  
  try {
    // Advanced security check
    const securityCheck = assessSecurity(input.message, input.userId);
    if (securityCheck.action === 'block') {
      yield {
        id: requestId,
        content: "I can't process that request due to security concerns. Please try a different question.",
        isComplete: true,
        metadata: { securityThreatLevel: securityCheck.threatLevel },
      };
      return;
    }

    // Check cache
    if (isCacheableQuery(input.message)) {
      const cached = await globalSemanticCache.get(input.message, input.userId);
      if (cached) {
        const cachedModel = cached.metadata.model || 'cached-model';
        await recordSkippedCredits({
          userId: input.userId,
          task: 'mentor_chat',
          feature: 'mentor_chat',
          modality: 'text',
          message: input.message,
          userTier: input.userTier || 'pro',
          providerMode: 'hybrid',
          requestId,
          metadata: {
            cacheHit: true,
            promptVersion: MENTOR_CHAT_PROMPT_VERSION,
            stream: true,
          },
        }, 'cache_hit', {
          model: cachedModel,
        });
        recordUsage({
          timestamp: Date.now(),
          userId: input.userId,
          model: cachedModel,
          inputTokens: 0,
          outputTokens: 0,
          operation: 'chat',
          cached: true,
          durationMs: Date.now() - startTime,
          promptVersion: MENTOR_CHAT_PROMPT_VERSION,
        });

        await captureMentorMemory(input, cached.response);

        // Simulate streaming for cached response
        for await (const chunk of simulateStream(cached.response, { chunkSize: 10, delayMs: 20 })) {
          yield { ...chunk, id: requestId };
        }
        return;
      }
    }

    // Build messages with vector memory context
    await hydrateMentorMemory(input.userId, { maxInsights: 12, maxSummaries: 6 });
    const relevantMemories = await getRelevantContext(input.userId, input.message, {
      maxResults: 3,
      minSimilarity: 0.5,
    });
    
    const systemPrompt = buildChatPrompt(securityCheck.sanitized, {
      goals: input.userContext?.goals,
      skillLevel: input.userContext?.skillLevel,
      preferredTone: input.userContext?.preferredTone,
    }, {
      conversationSummary: relevantMemories.map(m => m.content).join('\n'),
    });

    const userTier = input.userTier || 'pro';

    // Smart model selection
    const routing = selectModel(securityCheck.sanitized, {
      budgetMode: input.modelHint === 'cheap' ? 'strict' : input.modelHint === 'smart' ? 'performance' : 'balanced',
      userTier,
    });

    let fullContent = '';
    let modelUsed = 'unknown';

    const stream = executeMonetizedTextStream({
      task: 'mentor_chat',
      messages: [
        { role: 'system', content: systemPrompt },
        ...input.history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant' | 'system', content: h.content })),
        { role: 'user', content: securityCheck.sanitized },
      ],
      userId: input.userId,
      userTier: normalizeRoutingPlan(userTier),
      modelHint: input.modelHint,
      qualityMode: input.modelHint === 'cheap' ? 'economy' : input.modelHint === 'smart' ? 'premium' : 'balanced',
      maxOutputTokens: 2048,
      temperature: 0.7,
    }, {
      userId: input.userId,
      task: 'mentor_chat',
      feature: 'mentor_chat',
      modality: 'text',
      message: securityCheck.sanitized,
      userTier,
      providerMode: 'hybrid',
      allowByok: true,
      requestId,
      metadata: {
        promptVersion: MENTOR_CHAT_PROMPT_VERSION,
        stream: true,
      },
    });

    for await (const chunk of stream) {
      if (chunk.metadata?.model) {
        modelUsed = chunk.metadata.model;
      }

      if (!chunk.isComplete) {
        fullContent += chunk.content;
        yield {
          ...chunk,
          id: requestId,
          metadata: {
            ...(chunk.metadata || {}),
            securityThreatLevel: securityCheck.threatLevel,
          },
        };
      } else {
        yield {
          ...chunk,
          id: requestId,
          metadata: {
            ...(chunk.metadata || {}),
            securityThreatLevel: securityCheck.threatLevel,
          },
        };
      }
    }

    if (modelUsed !== 'unknown') {
      circuitBreaker.recordSuccess(modelUsed);
    }

    // Record usage and cache
    const durationMs = Date.now() - startTime;
    recordUsage({
      timestamp: startTime,
      userId: input.userId,
      sessionId: input.threadId,
      model: modelUsed,
      inputTokens: estimateTokenCount(systemPrompt + input.message),
      outputTokens: estimateTokenCount(fullContent),
      operation: 'chat',
      cached: false,
      durationMs,
      promptVersion: MENTOR_CHAT_PROMPT_VERSION,
    });

    if (isCacheableQuery(input.message)) {
      globalSemanticCache.set(input.message, fullContent, {
        model: modelUsed,
        tokensUsed: estimateTokenCount(fullContent),
        timestamp: Date.now(),
        userId: input.userId,
        promptVersion: MENTOR_CHAT_PROMPT_VERSION,
      });
    }

    // Store vector insights
    const vectorInsights = extractInsightsWithImportance(input.message, 'user', input.threadId);
    for (const insight of vectorInsights) {
      await vectorMemoryStore.add(input.userId, insight);
    }

    await captureMentorMemory(input, fullContent);

  } catch (error) {
    logger.error('[ChatFlow] Streaming error', error instanceof Error ? error : new Error(String(error)));
    yield {
      id: requestId,
      content: '',
      isComplete: true,
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
  */
}
