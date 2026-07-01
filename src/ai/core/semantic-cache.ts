/**
 * Semantic Cache System
 * 
 * Provides intelligent caching of AI responses based on semantic similarity
 * rather than exact text matching. Reduces API costs and improves latency.
 */

import { logger } from '@/lib/logger';

export interface CacheEntry {
  id: string;
  query: string;
  queryEmbedding?: number[];
  response: string;
  metadata: {
    model: string;
    tokensUsed: number;
    timestamp: number;
    userId?: string;
    sessionId?: string;
  };
  accessStats: {
    hits: number;
    lastAccessed: number;
  };
}

export interface SemanticCacheConfig {
  maxSize: number;
  ttlMs: number;
  similarityThreshold: number;
  embeddingDimension: number;
  enablePersistence: boolean;
}

const DEFAULT_CONFIG: SemanticCacheConfig = {
  maxSize: 1000,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  similarityThreshold: 0.92, // High similarity required
  embeddingDimension: 384, // Using lightweight embeddings
  enablePersistence: false, // In-memory only by default
};

/**
 * Simple embedding using term frequency (fallback when no embedding model available)
 * Creates a normalized vector based on term frequencies
 */
export function createSimpleEmbedding(text: string, dimension: number = 384): number[] {
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  // Create a simple hash-based embedding
  const embedding = new Array(dimension).fill(0);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Simple hash function
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(j);
      hash = hash & hash;
    }
    
    // Distribute word influence across embedding
    const index = Math.abs(hash) % dimension;
    embedding[index] += 1;
    
    // Add bigram features
    if (i < words.length - 1) {
      const bigram = word + ' ' + words[i + 1];
      let bigramHash = 0;
      for (let j = 0; j < Math.min(bigram.length, 20); j++) {
        bigramHash = ((bigramHash << 5) - bigramHash) + bigram.charCodeAt(j);
        bigramHash = bigramHash & bigramHash;
      }
      const bigramIndex = Math.abs(bigramHash) % dimension;
      embedding[bigramIndex] += 0.5;
    }
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    return embedding.map(val => val / magnitude);
  }
  
  return embedding;
}

/**
 * Calculates cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimension');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Semantic Cache implementation with LRU eviction
 */
export class SemanticCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: SemanticCacheConfig;
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<SemanticCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Start cleanup interval
    setInterval(() => this.cleanup(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Generate a cache key from query
   */
  private generateKey(query: string): string {
    // Normalize query for key generation
    const normalized = query
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 200); // Limit key length
    
    // Simple hash
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
      hash = hash & hash;
    }
    
    return `query_${Math.abs(hash)}_${normalized.slice(0, 50).replace(/[^a-z0-9]/g, '_')}`;
  }

  /**
   * Check if a semantically similar query exists in cache
   */
  async get(query: string, userId?: string): Promise<CacheEntry | null> {
    const queryEmbedding = createSimpleEmbedding(query, this.config.embeddingDimension);
    
    let bestMatch: CacheEntry | null = null;
    let bestSimilarity = 0;

    const now = Date.now();

    for (const entry of this.cache.values()) {
      // Skip expired entries
      if (now - entry.metadata.timestamp > this.config.ttlMs) {
        continue;
      }

      // Skip entries from different users (privacy)
      if (userId && entry.metadata.userId && entry.metadata.userId !== userId) {
        continue;
      }

      // Calculate similarity
      const entryEmbedding = entry.queryEmbedding || 
        createSimpleEmbedding(entry.query, this.config.embeddingDimension);
      
      const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

      if (similarity > bestSimilarity && similarity >= this.config.similarityThreshold) {
        bestSimilarity = similarity;
        bestMatch = entry;
      }
    }

    if (bestMatch) {
      this.hits++;
      bestMatch.accessStats.hits++;
      bestMatch.accessStats.lastAccessed = now;
      
      logger.debug('[SemanticCache] Cache hit', {
        similarity: bestSimilarity,
        query: query.slice(0, 50),
      });
      
      return bestMatch;
    }

    this.misses++;
    return null;
  }

  /**
   * Store a response in cache
   */
  set(query: string, response: string, metadata: CacheEntry['metadata']): void {
    // Don't cache very short queries or responses
    if (query.length < 10 || response.length < 20) {
      return;
    }

    // Don't cache error responses
    if (response.toLowerCase().includes('error') || 
        response.toLowerCase().includes('sorry') && response.length < 100) {
      return;
    }

    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    const key = this.generateKey(query);
    const embedding = createSimpleEmbedding(query, this.config.embeddingDimension);

    const entry: CacheEntry = {
      id: key,
      query: query.slice(0, 500), // Limit stored query length
      queryEmbedding: embedding,
      response: response.slice(0, 10000), // Limit response length
      metadata,
      accessStats: {
        hits: 0,
        lastAccessed: Date.now(),
      },
    };

    this.cache.set(key, entry);
    
    logger.debug('[SemanticCache] Stored entry', {
      key,
      query: query.slice(0, 50),
      cacheSize: this.cache.size,
    });
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessStats.lastAccessed < oldestTime) {
        oldestTime = entry.accessStats.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('[SemanticCache] Evicted LRU entry', { key: oldestKey });
    }
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.metadata.timestamp > this.config.ttlMs) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('[SemanticCache] Cleaned expired entries', { cleaned });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
    };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    logger.info('[SemanticCache] Cache cleared');
  }

  /**
   * Invalidate entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (pattern.test(entry.query) || pattern.test(key)) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }
}

// Global cache instance
export const globalSemanticCache = new SemanticCache();

/**
 * Query normalizer for improving cache hit rates
 */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\b(a|an|the|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|dare|ought|used|to|of|in|for|on|with|at|by|from|as|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|all|each|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|but)\b/g, '')
    .trim();
}

/**
 * Check if a query is cacheable
 */
export function isCacheableQuery(query: string): boolean {
  // Don't cache if too short
  if (query.length < 10) return false;
  
  // Don't cache if contains sensitive patterns
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /credit[_-]?card/i,
  ];
  
  if (sensitivePatterns.some(p => p.test(query))) return false;
  
  return true;
}
