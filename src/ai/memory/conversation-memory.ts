/**
 * Conversation Memory System
 * 
 * Extracts, stores, and retrieves user insights across conversations:
 * - Goals and aspirations
 * - Preferences and communication style
 * - Business context and challenges
 * - Learned facts about the user
 * - Conversation summaries
 */

import { logger } from '@/lib/logger';

function collectMatches(input: string, pattern: RegExp): RegExpMatchArray[] {
  const globalPattern = pattern.flags.includes('g')
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);

  return Array.from(input.matchAll(globalPattern));
}

export interface UserMemory {
  userId: string;
  extractedInsights: Insight[];
  conversationSummaries: ConversationSummary[];
  preferences: UserPreferences;
  businessGoals?: string;
  lastUpdated: number;
}

export interface Insight {
  id: string;
  type: 'goal' | 'challenge' | 'preference' | 'fact' | 'business_info' | 'learning_style';
  content: string;
  confidence: number; // 0-1
  source: string; // conversation ID
  timestamp: number;
  expiresAt?: number; // Some insights may be time-bound
}

export interface ConversationSummary {
  id: string;
  threadId: string;
  summary: string;
  keyTopics: string[];
  actionItems: string[];
  timestamp: number;
  messageCount: number;
}

export interface UserPreferences {
  communicationStyle?: 'concise' | 'detailed' | 'formal' | 'casual';
  expertiseLevel?: 'beginner' | 'intermediate' | 'advanced';
  preferredTopics?: string[];
  avoidedTopics?: string[];
  responseLength?: 'short' | 'medium' | 'long';
  timezone?: string;
  preferredTone?: 'professional' | 'casual' | 'encouraging' | 'direct';
}

export interface MemoryContext {
  relevantInsights: Insight[];
  recentSummary?: ConversationSummary;
  userPreferences: UserPreferences;
  businessGoals?: string;
}

// In-memory storage (replace with database in production)
const memoryStore = new Map<string, UserMemory>();

/**
 * Extracts insights from a conversation message
 */
export function extractInsights(
  message: string,
  role: 'user' | 'assistant',
  conversationId: string
): Insight[] {
  const insights: Insight[] = [];
  const timestamp = Date.now();

  if (role === 'user') {
    // Extract goals using patterns
    const goalPatterns = [
      { pattern: /I want to\s+(.+?)(?:\.|,|;|$)/i, type: 'goal' as const },
      { pattern: /my goal is(?: to)?\s+(.+?)(?:\.|,|;|$)/i, type: 'goal' as const },
      { pattern: /I'm trying to\s+(.+?)(?:\.|,|;|$)/i, type: 'goal' as const },
      { pattern: /I need help (?:with|on)\s+(.+?)(?:\.|,|;|$)/i, type: 'challenge' as const },
      { pattern: /I'm struggling (?:with|on)\s+(.+?)(?:\.|,|;|$)/i, type: 'challenge' as const },
      { pattern: /my business is\s+(.+?)(?:\.|,|;|$)/i, type: 'business_info' as const },
      { pattern: /I work in\s+(.+?)(?:\.|,|;|$)/i, type: 'business_info' as const },
      { pattern: /I prefer\s+(.+?)(?:\.|,|;|$)/i, type: 'preference' as const },
      { pattern: /I like (?:it )?when\s+(.+?)(?:\.|,|;|$)/i, type: 'preference' as const },
    ];

    for (const { pattern, type } of goalPatterns) {
      const matches = collectMatches(message, pattern);
      for (const match of matches) {
        const content = match[1]?.trim();
        if (content && content.length > 5 && content.length < 200) {
          insights.push({
            id: `insight_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            content,
            confidence: 0.7,
            source: conversationId,
            timestamp,
          });
        }
      }
    }

    // Detect learning style indicators
    const learningIndicators = [
      { pattern: /show me|visual|diagram|chart|image/i, style: 'visual' },
      { pattern: /step by step|how exactly|walk me through/i, style: 'hands-on' },
      { pattern: /why|theory|explain how|understand/i, style: 'theoretical' },
      { pattern: /just tell me|what should I do|give me the steps/i, style: 'practical' },
    ];

    for (const { pattern, style } of learningIndicators) {
      if (pattern.test(message)) {
        insights.push({
          id: `insight_learning_${timestamp}`,
          type: 'learning_style',
          content: `User shows preference for ${style} learning`,
          confidence: 0.6,
          source: conversationId,
          timestamp,
        });
        break; // Only take the first match
      }
    }
  }

  return insights;
}

/**
 * Generates a summary of a conversation thread
 */
export function generateConversationSummary(
  threadId: string,
  messages: Array<{ role: string; content: string }>,
  existingSummary?: string
): ConversationSummary {
  const timestamp = Date.now();
  const topics = new Set<string>();
  const actionItems: string[] = [];

  // Extract topics from user messages
  for (const msg of messages) {
    if (msg.role === 'user') {
      const words = msg.content.toLowerCase().split(/\s+/);
      
      // Look for topic indicators
      for (let i = 0; i < words.length - 1; i++) {
        if (['about', 'regarding', 'discussing', 'help', 'need'].includes(words[i])) {
          const topic = words.slice(i + 1, i + 4).join(' ').replace(/[^\w\s]/g, '');
          if (topic.length > 3) topics.add(topic);
        }
      }
    } else if (msg.role === 'assistant') {
      // Look for action items in AI responses
      const sentences = msg.content.split(/[.!?]+/);
      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();
        if (lower.includes('try') || lower.includes('start by') || lower.includes('first step')) {
          const clean = sentence.trim();
          if (clean.length > 10 && clean.length < 150) {
            actionItems.push(clean);
          }
        }
      }
    }
  }

  // Create summary
  let summary = existingSummary || '';
  if (!summary) {
    const topicList = Array.from(topics).slice(0, 5);
    summary = `Discussed: ${topicList.join(', ')}`;
    
    if (actionItems.length > 0) {
      summary += `. Key actions: ${actionItems.slice(0, 3).join('; ')}`;
    }
  }

  return {
    id: `summary_${timestamp}`,
    threadId,
    summary,
    keyTopics: Array.from(topics).slice(0, 10),
    actionItems: actionItems.slice(0, 5),
    timestamp,
    messageCount: messages.length,
  };
}

/**
 * Retrieves relevant memory context for a user
 */
export function getMemoryContext(
  userId: string,
  options: {
    maxInsights?: number;
    maxAgeDays?: number;
    includePreferences?: boolean;
  } = {}
): MemoryContext {
  const { maxInsights = 10, maxAgeDays = 30, includePreferences = true } = options;
  
  const memory = memoryStore.get(userId);
  if (!memory) {
    return {
      relevantInsights: [],
      userPreferences: {},
    };
  }

  const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  
  // Get recent insights, sorted by confidence
  const relevantInsights = memory.extractedInsights
    .filter(i => i.timestamp > cutoffTime)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxInsights);

  // Get most recent summary
  const recentSummary = memory.conversationSummaries
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  return {
    relevantInsights,
    recentSummary,
    userPreferences: includePreferences ? memory.preferences : {},
    businessGoals: memory.businessGoals,
  };
}

/**
 * Stores or updates user memory
 */
export function storeMemory(
  userId: string,
  updates: {
    insights?: Insight[];
    summary?: ConversationSummary;
    preferences?: Partial<UserPreferences>;
    businessGoals?: string;
  }
): void {
  let memory = memoryStore.get(userId);
  
  if (!memory) {
    memory = {
      userId,
      extractedInsights: [],
      conversationSummaries: [],
      preferences: {},
      lastUpdated: Date.now(),
    };
    memoryStore.set(userId, memory);
  }

  if (updates.insights) {
    // Deduplicate insights by content similarity
    for (const newInsight of updates.insights) {
      const isDuplicate = memory.extractedInsights.some(existing =>
        existing.type === newInsight.type &&
        existing.content.toLowerCase() === newInsight.content.toLowerCase()
      );
      
      if (!isDuplicate) {
        memory.extractedInsights.push(newInsight);
      }
    }

    // Limit stored insights
    if (memory.extractedInsights.length > 100) {
      memory.extractedInsights = memory.extractedInsights
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 100);
    }
  }

  if (updates.summary) {
    const isDuplicateSummary = memory.conversationSummaries.some(existing =>
      existing.id === updates.summary!.id ||
      (existing.threadId === updates.summary!.threadId && existing.summary === updates.summary!.summary)
    );

    if (!isDuplicateSummary) {
      memory.conversationSummaries.push(updates.summary);
    }
    
    // Limit stored summaries
    if (memory.conversationSummaries.length > 20) {
      memory.conversationSummaries = memory.conversationSummaries
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 20);
    }
  }

  if (updates.preferences) {
    memory.preferences = { ...memory.preferences, ...updates.preferences };
  }

  if (typeof updates.businessGoals === 'string' && updates.businessGoals.trim()) {
    memory.businessGoals = updates.businessGoals.trim();
  }

  memory.lastUpdated = Date.now();
  
  logger.debug('[ConversationMemory] Memory updated', {
    userId,
    insightsCount: memory.extractedInsights.length,
    summariesCount: memory.conversationSummaries.length,
  });
}

/**
 * Formats memory context for inclusion in prompts
 */
export function formatMemoryForPrompt(context: MemoryContext): string {
  const parts: string[] = [];

  if (context.relevantInsights.length > 0) {
    parts.push('Known User Information:');
    
    // Group by type
    const byType = context.relevantInsights.reduce((acc, insight) => {
      acc[insight.type] = acc[insight.type] || [];
      acc[insight.type].push(insight);
      return acc;
    }, {} as Record<string, Insight[]>);

    for (const [type, insights] of Object.entries(byType)) {
      const typeLabel = type.replace('_', ' ').toUpperCase();
      const content = insights.slice(0, 3).map(i => `- ${i.content}`).join('\n');
      parts.push(`${typeLabel}:\n${content}`);
    }
  }

  if (context.recentSummary) {
    parts.push(`\nPrevious Conversation Context: ${context.recentSummary.summary}`);
  }

  if (context.userPreferences.communicationStyle) {
    parts.push(`\nUser prefers ${context.userPreferences.communicationStyle} communication.`);
  }

  if (context.userPreferences.preferredTone) {
    parts.push(`User prefers a ${context.userPreferences.preferredTone} tone.`);
  }

  if (context.userPreferences.expertiseLevel) {
    parts.push(`User has ${context.userPreferences.expertiseLevel} level expertise.`);
  }

  if (context.businessGoals) {
    parts.push(`Business goals: ${context.businessGoals}`);
  }

  return parts.join('\n');
}

/**
 * Clears old memory entries
 */
export function cleanupMemory(maxAgeDays: number = 90): void {
  const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
  let cleaned = 0;

  for (const [userId, memory] of memoryStore.entries()) {
    const originalInsightCount = memory.extractedInsights.length;
    const originalSummaryCount = memory.conversationSummaries.length;

    memory.extractedInsights = memory.extractedInsights.filter(i => i.timestamp > cutoffTime);
    memory.conversationSummaries = memory.conversationSummaries.filter(s => s.timestamp > cutoffTime);

    cleaned += (originalInsightCount - memory.extractedInsights.length) +
               (originalSummaryCount - memory.conversationSummaries.length);

    if (memory.extractedInsights.length === 0 && memory.conversationSummaries.length === 0) {
      memoryStore.delete(userId);
    }
  }

  logger.info('[ConversationMemory] Cleanup completed', { cleaned });
}

// Periodic cleanup
setInterval(() => cleanupMemory(), 24 * 60 * 60 * 1000); // Daily

// ============================================================================
// VECTOR-BASED SEMANTIC MEMORY (NEW)
// ============================================================================

export interface VectorMemoryEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    timestamp: number;
    type: 'goal' | 'fact' | 'preference' | 'challenge' | 'learning_style';
    importance: number; // 0-1
    source: string;
    tags: string[];
  };
}

// Simple vector store (replace with Pinecone/Milvus in production)
class VectorMemoryStore {
  private memories = new Map<string, VectorMemoryEntry>();
  private userMemories = new Map<string, Set<string>>();

  async add(userId: string, entry: VectorMemoryEntry): Promise<void> {
    this.memories.set(entry.id, entry);
    
    if (!this.userMemories.has(userId)) {
      this.userMemories.set(userId, new Set());
    }
    this.userMemories.get(userId)!.add(entry.id);
  }

  async search(
    userId: string,
    queryEmbedding: number[],
    options: {
      types?: VectorMemoryEntry['metadata']['type'][];
      minImportance?: number;
      maxAgeMs?: number;
      limit?: number;
    } = {}
  ): Promise<Array<VectorMemoryEntry & { similarity: number }>> {
    const userMemoryIds = this.userMemories.get(userId);
    if (!userMemoryIds) return [];

    const results: Array<VectorMemoryEntry & { similarity: number }> = [];
    const now = Date.now();

    for (const id of userMemoryIds) {
      const memory = this.memories.get(id);
      if (!memory) continue;

      if (options.types && !options.types.includes(memory.metadata.type)) continue;
      if (options.minImportance && memory.metadata.importance < options.minImportance) continue;
      if (options.maxAgeMs && now - memory.metadata.timestamp > options.maxAgeMs) continue;

      const similarity = cosineSimilarity(queryEmbedding, memory.embedding);
      results.push({ ...memory, similarity });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, options.limit || 10);
  }
}

export const vectorMemoryStore = new VectorMemoryStore();

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

export function generateEmbedding(text: string): number[] {
  const dimension = 384;
  const embedding = new Array(dimension).fill(0);
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  for (const word of words) {
    let hash = 0;
    for (const char of word) {
      hash = ((hash << 5) - hash) + char.charCodeAt(0);
    }
    embedding[Math.abs(hash) % dimension] += 1;
  }

  const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  return magnitude > 0 ? embedding.map(v => v / magnitude) : embedding;
}

export function extractInsightsWithImportance(
  message: string,
  role: 'user' | 'assistant',
  source: string
): VectorMemoryEntry[] {
  const entries: VectorMemoryEntry[] = [];
  const timestamp = Date.now();

  if (role !== 'user') return entries;

  // Goal extraction with high importance
  const goalPatterns = [
    { pattern: /(?:i want to|my goal is|i'm trying to|i need to)\s+(.+?)(?:\.|;|$)/i, type: 'goal' as const },
    { pattern: /(?:i hope to|i aim to|my objective is)\s+(.+?)(?:\.|;|$)/i, type: 'goal' as const },
  ];

  for (const { pattern, type } of goalPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const content = match[1].trim();
      entries.push({
        id: `goal_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
        content,
        embedding: generateEmbedding(content),
        metadata: { timestamp, type, importance: 0.9, source, tags: ['goal'] },
      });
    }
  }

  // Preference extraction
  const prefMatch = message.match(/(?:i prefer|i like|i don't like)\s+(.+?)(?:\.|;|$)/i);
  if (prefMatch?.[1]) {
    const content = prefMatch[1].trim();
    entries.push({
      id: `pref_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
      content,
      embedding: generateEmbedding(content),
      metadata: { timestamp, type: 'preference', importance: 0.7, source, tags: ['preference'] },
    });
  }

  // Fact extraction
  const factMatch = message.match(/(?:my business is|i work in|i'm a)\s+(.+?)(?:\.|;|$)/i);
  if (factMatch?.[1] && factMatch[1].length > 10) {
    const content = factMatch[1].trim();
    entries.push({
      id: `fact_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
      content,
      embedding: generateEmbedding(content),
      metadata: { timestamp, type: 'fact', importance: 0.8, source, tags: ['fact'] },
    });
  }

  return entries;
}

export async function getRelevantContext(
  userId: string,
  query: string,
  options: {
    maxResults?: number;
    minSimilarity?: number;
    types?: VectorMemoryEntry['metadata']['type'][];
  } = {}
): Promise<VectorMemoryEntry[]> {
  const { maxResults = 5, minSimilarity = 0.6, types } = options;
  const embedding = generateEmbedding(query);
  
  const results = await vectorMemoryStore.search(userId, embedding, {
    types,
    minImportance: 0.5,
    maxAgeMs: 90 * 24 * 60 * 60 * 1000,
    limit: maxResults * 2,
  });

  return results
    .filter(r => r.similarity >= minSimilarity)
    .slice(0, maxResults)
    .map(({ similarity, ...entry }) => entry);
}
