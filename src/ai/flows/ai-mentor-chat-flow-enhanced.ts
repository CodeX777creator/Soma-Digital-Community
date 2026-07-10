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
import { buildChatPrompt, UserContext } from '@/ai/core/prompt-builder';
import { createTextClient, resolveAIExecutionPlan, type AIProviderId } from '@/ai/platform';
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
    routing?: RoutingDecision;
    security?: {
      threatLevel: string;
      action: string;
    };
  };
}

interface CompletionAttempt {
  providerId: AIProviderId;
  modelId: string;
}

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

async function completeWithFallbacks(
  attempts: CompletionAttempt[],
  messages: ChatCompletionMessageParam[],
  request: { temperature?: number; maxOutputTokens?: number; topP?: number; stopSequences?: string[] }
): Promise<{ providerId: AIProviderId; modelId: string; content: string }> {
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      const client = createTextClient(attempt.providerId);
      const response = await client.chat.completions.create({
        model: attempt.modelId,
        messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxOutputTokens ?? 2048,
        top_p: request.topP ?? 0.9,
        ...(request.stopSequences && request.stopSequences.length > 0 ? { stop: request.stopSequences } : {}),
      });

      const content = response.choices?.[0]?.message?.content || '';
      if (!content) {
        throw new Error('Empty response');
      }

      return {
        providerId: attempt.providerId,
        modelId: attempt.modelId,
        content,
      };
    } catch (error) {
      lastError = error;
      logger.warn('[ChatFlow] Completion attempt failed', {
        providerId: attempt.providerId,
        modelId: attempt.modelId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new Error(`All AI completion attempts failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
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
    const budgetCheck = checkBudget(input.userId);
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
        recordUsage({
          timestamp: Date.now(),
          userId: input.userId,
          model: cachedModel,
          inputTokens: 0,
          outputTokens: 0,
          operation: 'chat',
          cached: true,
          durationMs: Date.now() - startTime,
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
    const routing = selectModel(securityCheck.sanitized, {
      history: input.history.map((h) => h.content),
      budgetMode: input.modelHint === 'cheap' ? 'strict' : input.modelHint === 'smart' ? 'performance' : 'balanced',
      userTier: 'explorer',
    });

    const executionPlan = resolveAIExecutionPlan({
      messages: [...input.history, { role: 'user', content: securityCheck.sanitized }],
      modelHint: input.modelHint,
      userTier: 'explorer',
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

    // 9. Call the AI platform with fallback chain
    const formattedMessages = formatMessagesForProvider(allMessages, 'openai') as ChatCompletionMessageParam[];
    const attempts: CompletionAttempt[] = [
      { providerId: executionPlan.providerId, modelId: executionPlan.modelId },
      ...executionPlan.fallbackPlans,
      ...routing.fallbackChain.map((modelId) => ({
        providerId: executionPlan.providerId,
        modelId,
      })),
    ];

    const uniqueAttempts = attempts.filter((attempt, index, self) => (
      self.findIndex(
        (candidate) => candidate.providerId === attempt.providerId && candidate.modelId === attempt.modelId
      ) === index
    ));

    const completion = await completeWithFallbacks(uniqueAttempts, formattedMessages, {
      temperature: 0.7,
      maxOutputTokens: 2048,
    });
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
    });

    // 12. Cache the response
    if (isCacheableQuery(input.message) && content.length > 50) {
      globalSemanticCache.set(input.message, content, {
        model: completion.modelId,
        tokensUsed: inputTokens + outputTokens,
        timestamp: Date.now(),
        userId: input.userId,
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
        recordUsage({
          timestamp: Date.now(),
          userId: input.userId,
          model: cachedModel,
          inputTokens: 0,
          outputTokens: 0,
          operation: 'chat',
          cached: true,
          durationMs: Date.now() - startTime,
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

    // Smart model selection
    const routing = selectModel(securityCheck.sanitized, {
      budgetMode: input.modelHint === 'cheap' ? 'strict' : input.modelHint === 'smart' ? 'performance' : 'balanced',
    });
    const executionPlan = resolveAIExecutionPlan({
      messages: [...input.history, { role: 'user', content: securityCheck.sanitized }],
      modelHint: input.modelHint,
      userTier: 'explorer',
    });

    // Try primary plan, then fallbacks
    let stream;
    let modelUsed = executionPlan.modelId;
    let providerUsed = executionPlan.providerId;
    const attempts: CompletionAttempt[] = [
      { providerId: executionPlan.providerId, modelId: executionPlan.modelId },
      ...executionPlan.fallbackPlans,
      ...routing.fallbackChain.map((modelId) => ({
        providerId: executionPlan.providerId,
        modelId,
      })),
    ];

    const dedupedAttempts = attempts.filter((candidate, index, self) => (
      self.findIndex(
        (item) => item.providerId === candidate.providerId && item.modelId === candidate.modelId
      ) === index
    ));
    const finalAttempt = dedupedAttempts[dedupedAttempts.length - 1];

    for (const attempt of dedupedAttempts) {
      try {
        const client = createTextClient(attempt.providerId);
        stream = await client.chat.completions.create({
          model: attempt.modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            ...input.history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant' | 'system', content: h.content })),
            { role: 'user', content: securityCheck.sanitized },
          ],
          temperature: 0.7,
          max_tokens: 2048,
          stream: true,
        });
        modelUsed = attempt.modelId;
        providerUsed = attempt.providerId;
        circuitBreaker.recordSuccess(attempt.modelId);
        break;
      } catch (error) {
        logger.warn(`[ChatFlow] Model ${attempt.modelId} failed in stream`, {
          providerId: attempt.providerId,
          error: (error as Error).message,
        });
        circuitBreaker.recordFailure(attempt.modelId);
        if (finalAttempt && attempt.providerId === finalAttempt.providerId && attempt.modelId === finalAttempt.modelId) {
          throw error;
        }
      }
    }

    let fullContent = '';

    for await (const chunk of stream!) {
      const content = chunk.choices?.[0]?.delta?.content || '';
      fullContent += content;
      
      yield {
        id: requestId,
        content,
        isComplete: false,
      };
    }

    // Final chunk
    yield {
      id: requestId,
        content: '',
        isComplete: true,
        metadata: {
          model: modelUsed,
          finishReason: 'stop',
          securityThreatLevel: securityCheck.threatLevel,
        },
    };

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
    });

    if (isCacheableQuery(input.message)) {
      globalSemanticCache.set(input.message, fullContent, {
        model: modelUsed,
        tokensUsed: estimateTokenCount(fullContent),
        timestamp: Date.now(),
        userId: input.userId,
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
}
