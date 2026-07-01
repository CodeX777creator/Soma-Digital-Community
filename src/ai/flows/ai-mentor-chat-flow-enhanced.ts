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
import OpenAI from 'openai';
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
import { 
  selectModel, 
  circuitBreaker,
  RoutingDecision,
} from '@/ai/core/model-router';
import { withFallbacks } from '@/ai/core/error-recovery';
import { recordUsage, checkBudget } from '@/ai/analytics/cost-tracker';
import { buildChatPrompt, UserContext } from '@/ai/core/prompt-builder';
import { logger } from '@/lib/logger';

// Kimi client configuration
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';

let kimiClientInstance: OpenAI | null = null;
function getKimiClient(): OpenAI {
  if (!kimiClientInstance) {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) throw new Error('KIMI_API_KEY not set');
    kimiClientInstance = new OpenAI({ apiKey, baseURL: KIMI_BASE_URL });
  }
  return kimiClientInstance;
}

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
      history: input.history.map(h => h.content),
      budgetMode: input.modelHint === 'cheap' ? 'strict' : input.modelHint === 'smart' ? 'performance' : 'balanced',
      userTier: 'explorer',
    });
    
    logger.info('[ChatFlow] Model selected', {
      model: routing.primaryModel,
      confidence: routing.confidence,
      reasoning: routing.reasoning,
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
    const budget = calculateTokenBudget(routing.primaryModel, systemPrompt.length);
    const { messages: truncatedHistory } = truncateMessages(
      [...historyMessages, userMessage],
      budget,
    );

    const allMessages = [systemMessage, ...truncatedHistory];

    // 8. Validate token limits
    const validation = validateTokenLimits(allMessages, routing.primaryModel);
    if (!validation.valid) {
      throw new Error(`Token limit exceeded: ${validation.error}`);
    }

    // 9. Call Kimi API with fallback chain
    const client = getKimiClient();
    const formattedMessages = formatMessagesForProvider(allMessages, 'kimi') as ChatCompletionMessageParam[];

    const response = await withFallbacks(
      async () => {
        const result = await client.chat.completions.create({
          model: routing.primaryModel,
          messages: formattedMessages,
          temperature: 0.7,
          max_tokens: 2048,
        });
        circuitBreaker.recordSuccess(routing.primaryModel);
        return result;
      },
      routing.fallbackChain.map(modelId => async () => {
        logger.info('[ChatFlow] Using fallback model', { fallback: modelId });
        const result = await client.chat.completions.create({
          model: modelId,
          messages: formattedMessages as ChatCompletionMessageParam[],
          temperature: 0.7,
          max_tokens: 2048,
        });
        circuitBreaker.recordSuccess(modelId);
        return result;
      }),
      {
        onFallback: (index, error) => {
          logger.warn(`[ChatFlow] Fallback ${index + 1} triggered`, { error: error.message });
          if (index === 0) {
            circuitBreaker.recordFailure(routing.primaryModel);
          }
        },
      }
    );

    const content = response.choices?.[0]?.message?.content || '';

    // 10. Calculate usage
    const inputTokens = validation.estimatedTokens;
    const outputTokens = estimateTokenCount(content);
    const durationMs = Date.now() - startTime;

    // 11. Record usage for analytics
    const usageRecord = recordUsage({
      timestamp: startTime,
      userId: input.userId,
      sessionId: input.threadId,
      model: routing.primaryModel,
      inputTokens,
      outputTokens,
      operation: 'chat',
      cached: false,
      durationMs,
    });

    // 12. Cache the response
    if (isCacheableQuery(input.message) && content.length > 50) {
      globalSemanticCache.set(input.message, content, {
        model: routing.primaryModel,
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

    return {
      response: content,
      metadata: {
        model: routing.primaryModel,
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
        // Simulate streaming for cached response
        for await (const chunk of simulateStream(cached.response, { chunkSize: 10, delayMs: 20 })) {
          yield { ...chunk, id: requestId };
        }
        return;
      }
    }

    // Build messages with vector memory context
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
    const client = getKimiClient();

    // Try primary model, then fallbacks
    let stream;
    let modelUsed = routing.primaryModel;
    
    for (const modelId of [routing.primaryModel, ...routing.fallbackChain]) {
      try {
        stream = await client.chat.completions.create({
          model: modelId,
          messages: [
            { role: 'system', content: systemPrompt },
            ...input.history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant' | 'system', content: h.content })),
            { role: 'user', content: securityCheck.sanitized },
          ],
          temperature: 0.7,
          max_tokens: 2048,
          stream: true,
        });
        modelUsed = modelId;
        circuitBreaker.recordSuccess(modelId);
        break;
      } catch (error) {
        logger.warn(`[ChatFlow] Model ${modelId} failed in stream`, { error: (error as Error).message });
        circuitBreaker.recordFailure(modelId);
        if (modelId === routing.fallbackChain[routing.fallbackChain.length - 1]) {
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
