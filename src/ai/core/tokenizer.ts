/**
 * Token Management System
 * 
 * Provides accurate token counting, budget management, and context window
 * optimization for AI Mentor conversations.
 */

import { logger } from '@/lib/logger';

// Approximate tokens per character ratios by language
const TOKEN_RATIOS = {
  english: 0.25,    // ~4 chars per token
  code: 0.3,        // Code tends to be token-dense
  mixed: 0.28,      // Mixed content default
};

// Model-specific context limits
export const MODEL_CONTEXT_LIMITS = {
  'moonshot-v1-8k': { context: 8192, output: 2048 },
  'moonshot-v1-32k': { context: 32768, output: 4096 },
  'moonshot-v1-128k': { context: 131072, output: 4096 },
  'kimi-k2.5': { context: 256000, output: 8192 },
  'kimi-k2.6': { context: 200000, output: 8192 },
} as const;

export type ModelId = keyof typeof MODEL_CONTEXT_LIMITS;

export interface TokenBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  reservedTokens: number;
  availableTokens: number;
}

export interface TokenCount {
  total: number;
  input: number;
  output: number;
  breakdown: {
    systemPrompt: number;
    messages: number;
    userMessage: number;
  };
}

export interface ContextWindowConfig {
  maxMessages: number;
  maxTokens: number;
  maxOutputTokens?: number;
  summarizationThreshold: number;
  preserveFirstNMessages: number;
  preserveLastNMessages: number;
}

// Default configuration optimized for cost/quality balance
export const DEFAULT_CONTEXT_CONFIG: ContextWindowConfig = {
  maxMessages: 50,
  maxTokens: 6000,
  summarizationThreshold: 20,
  preserveFirstNMessages: 2,
  preserveLastNMessages: 6,
};

/**
 * Estimates token count for a text string
 * Uses a conservative estimate to avoid exceeding limits
 */
export function estimateTokenCount(text: string, contentType: keyof typeof TOKEN_RATIOS = 'mixed'): number {
  if (!text || text.length === 0) return 0;
  
  // Conservative estimate: assume mixed content
  const ratio = TOKEN_RATIOS[contentType] || TOKEN_RATIOS.mixed;
  const estimatedTokens = Math.ceil(text.length * ratio);
  
  // Add buffer for special characters, formatting, and encoding overhead
  const buffer = Math.ceil(estimatedTokens * 0.1);
  
  return estimatedTokens + buffer;
}

/**
 * Calculates token budget for a conversation
 */
export function calculateTokenBudget(
  modelId: ModelId,
  systemPromptLength: number,
  config: Partial<ContextWindowConfig> = {}
): TokenBudget {
  const limits = MODEL_CONTEXT_LIMITS[modelId];
  if (!limits) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  const systemTokens = estimateTokenCount(systemPromptLength.toString());
  const outputTokens = config.maxOutputTokens ?? limits.output;
  const reservedTokens = systemTokens + outputTokens;
  const availableTokens = limits.context - reservedTokens;

  return {
    maxInputTokens: limits.context,
    maxOutputTokens: limits.output,
    reservedTokens,
    availableTokens: Math.max(0, availableTokens),
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
  metadata?: {
    tokenCount?: number;
    importance?: number;
    summary?: string;
  };
}

/**
 * Truncates messages to fit within token budget
 * Uses intelligent prioritization to preserve important context
 */
export function truncateMessages(
  messages: Message[],
  budget: TokenBudget,
  config: ContextWindowConfig = DEFAULT_CONTEXT_CONFIG
): { messages: Message[]; summary?: string; tokensUsed: number } {
  if (messages.length === 0) {
    return { messages: [], tokensUsed: 0 };
  }

  // Calculate token counts for each message
  const messagesWithTokens = messages.map(msg => ({
    ...msg,
    estimatedTokens: msg.metadata?.tokenCount || estimateTokenCount(msg.content),
  }));

  const totalTokens = messagesWithTokens.reduce((sum, msg) => sum + msg.estimatedTokens, 0);

  // If under budget, return all messages
  if (totalTokens <= budget.availableTokens && messages.length <= config.maxMessages) {
    return { 
      messages, 
      tokensUsed: totalTokens 
    };
  }

  // Strategy: Preserve first N and last N messages, summarize middle
  const preservedFirst = messagesWithTokens.slice(0, config.preserveFirstNMessages);
  const preservedLast = messagesWithTokens.slice(-config.preserveLastNMessages);
  const middleMessages = messagesWithTokens.slice(
    config.preserveFirstNMessages, 
    -config.preserveLastNMessages || undefined
  );

  const preservedTokens = 
    preservedFirst.reduce((sum, msg) => sum + msg.estimatedTokens, 0) +
    preservedLast.reduce((sum, msg) => sum + msg.estimatedTokens, 0);

  const availableForMiddle = budget.availableTokens - preservedTokens;

  // If middle section is small enough, keep it
  const middleTokens = middleMessages.reduce((sum, msg) => sum + msg.estimatedTokens, 0);
  
  if (middleTokens <= availableForMiddle && messages.length <= config.maxMessages) {
    return {
      messages: [...preservedFirst, ...middleMessages, ...preservedLast].map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        metadata: { ...m.metadata, tokenCount: m.estimatedTokens },
      })),
      tokensUsed: preservedTokens + middleTokens,
    };
  }

  // Need to summarize middle section
  const summary = generateConversationSummary(middleMessages);
  const summaryTokens = estimateTokenCount(summary);

  logger.info('[Tokenizer] Conversation truncated with summary', {
    originalMessages: messages.length,
    preservedFirst: preservedFirst.length,
    preservedLast: preservedLast.length,
    summarizedMessages: middleMessages.length,
    originalTokens: totalTokens,
    newTokens: preservedTokens + summaryTokens,
    savings: totalTokens - (preservedTokens + summaryTokens),
  });

  const resultMessages: Message[] = [
    ...preservedFirst.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      metadata: { ...m.metadata, tokenCount: m.estimatedTokens },
    })),
    {
      role: 'system',
      content: `[Previous conversation summary: ${summary}]`,
      metadata: { tokenCount: summaryTokens },
    },
    ...preservedLast.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      metadata: { ...m.metadata, tokenCount: m.estimatedTokens },
    })),
  ];

  return {
    messages: resultMessages,
    summary,
    tokensUsed: preservedTokens + summaryTokens,
  };
}

/**
 * Generates a summary of conversation messages
 * This is a simplified version - in production, use an LLM for better summaries
 */
function generateConversationSummary(messages: Array<Message & { estimatedTokens: number }>): string {
  if (messages.length === 0) return '';

  // Extract key topics and decisions
  const topics = new Set<string>();
  const keyPoints: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      // Extract potential topics (simplified)
      const words = msg.content.toLowerCase().split(/\s+/);
      const topicIndicators = ['about', 'regarding', 'discussing', 'help', 'need', 'want'];
      
      for (let i = 0; i < words.length - 1; i++) {
        if (topicIndicators.includes(words[i]) && words[i + 1].length > 3) {
          topics.add(words[i + 1]);
        }
      }
    } else if (msg.role === 'assistant') {
      // Look for recommendations or advice
      if (msg.content.includes('recommend') || msg.content.includes('suggest')) {
        const sentence = msg.content.split(/[.!?]/).find(s => 
          s.toLowerCase().includes('recommend') || s.toLowerCase().includes('suggest')
        );
        if (sentence && sentence.length < 150) {
          keyPoints.push(sentence.trim());
        }
      }
    }
  }

  const topicList = Array.from(topics).slice(0, 5).join(', ');
  const pointList = keyPoints.slice(0, 3).join('; ');

  let summary = `Discussed: ${topicList}`;
  if (pointList) {
    summary += `. Key advice: ${pointList}`;
  }

  return summary;
}

/**
 * Tracks token usage across a session
 */
export class TokenTracker {
  private usage: {
    input: number;
    output: number;
    total: number;
    byModel: Map<string, { input: number; output: number }>;
  } = {
    input: 0,
    output: 0,
    total: 0,
    byModel: new Map(),
  };

  private budget: number;

  constructor(budget: number = Infinity) {
    this.budget = budget;
  }

  recordUsage(inputTokens: number, outputTokens: number, modelId: string): void {
    this.usage.input += inputTokens;
    this.usage.output += outputTokens;
    this.usage.total += inputTokens + outputTokens;

    const modelUsage = this.usage.byModel.get(modelId) || { input: 0, output: 0 };
    modelUsage.input += inputTokens;
    modelUsage.output += outputTokens;
    this.usage.byModel.set(modelId, modelUsage);

    if (this.budget !== Infinity && this.usage.total > this.budget) {
      logger.warn('[TokenTracker] Token budget exceeded', {
        budget: this.budget,
        used: this.usage.total,
        exceededBy: this.usage.total - this.budget,
      });
    }
  }

  getUsage() {
    return {
      ...this.usage,
      byModel: Object.fromEntries(this.usage.byModel),
      remaining: this.budget === Infinity ? Infinity : Math.max(0, this.budget - this.usage.total),
      percentageUsed: this.budget === Infinity ? 0 : (this.usage.total / this.budget) * 100,
    };
  }

  isBudgetExceeded(): boolean {
    return this.budget !== Infinity && this.usage.total > this.budget;
  }

  getRemainingBudget(): number {
    return this.budget === Infinity ? Infinity : Math.max(0, this.budget - this.usage.total);
  }
}

/**
 * Validates that a request is within token limits
 */
export function validateTokenLimits(
  messages: Message[],
  modelId: ModelId,
  maxOutputTokens?: number
): { valid: boolean; error?: string; estimatedTokens: number } {
  const limits = MODEL_CONTEXT_LIMITS[modelId];
  if (!limits) {
    return { valid: false, error: `Unknown model: ${modelId}`, estimatedTokens: 0 };
  }

  const totalTokens = messages.reduce(
    (sum, msg) => sum + (msg.metadata?.tokenCount || estimateTokenCount(msg.content)),
    0
  );

  const outputTokens = maxOutputTokens || limits.output;
  const totalWithOutput = totalTokens + outputTokens;

  if (totalWithOutput > limits.context) {
    return {
      valid: false,
      error: `Request exceeds context limit: ${totalWithOutput} > ${limits.context} tokens`,
      estimatedTokens: totalTokens,
    };
  }

  return { valid: true, estimatedTokens: totalTokens };
}

/**
 * Formats messages for different model providers
 */
export function formatMessagesForProvider(
  messages: Message[],
  provider: 'openai' | 'anthropic' | 'kimi' = 'kimi'
): Array<{ role: string; content: string }> {
  const roleMap: Record<string, string> = {
    system: 'system',
    user: 'user',
    assistant: provider === 'anthropic' ? 'assistant' : 'assistant',
  };

  return messages.map(msg => ({
    role: roleMap[msg.role] || msg.role,
    content: msg.content,
  }));
}
