/**
 * AI Core Module Exports
 * 
 * Centralized exports for all AI infrastructure modules
 */

// Token Management
export {
  estimateTokenCount,
  calculateTokenBudget,
  truncateMessages,
  validateTokenLimits,
  formatMessagesForProvider,
  TokenTracker,
  MODEL_CONTEXT_LIMITS,
  DEFAULT_CONTEXT_CONFIG,
  type TokenBudget,
  type TokenCount,
  type Message,
  type ContextWindowConfig,
  type ModelId,
} from './tokenizer';

// Streaming
export {
  createSSEStream,
  wrapOpenAIStream,
  parseSSEStream,
  StreamConsumer,
  createStreamingResponse,
  simulateStream,
  type StreamChunk,
  type StreamConfig,
} from './streaming-handler';

// Semantic Caching
export {
  SemanticCache,
  globalSemanticCache,
  createSimpleEmbedding,
  cosineSimilarity,
  normalizeQuery,
  isCacheableQuery,
  type CacheEntry,
  type SemanticCacheConfig,
} from './semantic-cache';

// Prompt Building
export {
  buildPrompt,
  buildChatPrompt,
  PROMPT_TEMPLATES,
  wrapWithGuardrails,
  extractContextVariables,
  validatePrompt,
  type PromptTemplate,
  type UserContext,
  type PromptConfig,
} from './prompt-builder';

// Model Router
export {
  selectModel,
  classifyTask,
  circuitBreaker,
  MODEL_CONFIGS,
  type RoutingDecision,
  type TaskClassification,
  type ModelConfig,
} from './model-router';

// Error Recovery
export {
  withResilience,
  withFallbacks,
  withDegradation,
  withTimeout,
  healthChecker,
  classifyError,
  type ErrorCategory,
  type ClassifiedError,
  type RetryPolicy,
} from './error-recovery';
