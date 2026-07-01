/**
 * AI Memory Module Exports
 * 
 * Conversation memory and user insight management
 */

export {
  extractInsights,
  generateConversationSummary,
  getMemoryContext,
  storeMemory,
  formatMemoryForPrompt,
  cleanupMemory,
  // Vector memory exports
  vectorMemoryStore,
  generateEmbedding,
  extractInsightsWithImportance,
  getRelevantContext,
  type UserMemory,
  type Insight,
  type ConversationSummary,
  type UserPreferences,
  type MemoryContext,
  type VectorMemoryEntry,
} from './conversation-memory';
