/**
 * Semantic Cache System
 *
 * Firestore-backed semantic cache for reusable AI responses.
 */

import { logger } from '@/lib/logger';
import {
  deleteSemanticCacheEntries,
  persistSemanticCacheEntry,
  querySemanticCacheCandidates,
  type AISemanticCacheRecord,
} from '@/ai/telemetry/firestore';

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
    promptVersion?: string;
  };
  accessStats: {
    hits: number;
    lastAccessed: number;
  };
}

export interface SemanticCacheConfig {
  ttlMs: number;
  similarityThreshold: number;
  embeddingDimension: number;
  candidateLimit: number;
}

const DEFAULT_CONFIG: SemanticCacheConfig = {
  ttlMs: 24 * 60 * 60 * 1000,
  similarityThreshold: 0.92,
  embeddingDimension: 384,
  candidateLimit: 60,
};

export function createSimpleEmbedding(text: string, dimension: number = 384): number[] {
  const normalized = text.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter((word) => word.length > 2);
  const embedding = new Array(dimension).fill(0);

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    let hash = 0;
    for (let offset = 0; offset < word.length; offset += 1) {
      hash = ((hash << 5) - hash) + word.charCodeAt(offset);
      hash &= hash;
    }

    embedding[Math.abs(hash) % dimension] += 1;

    if (index < words.length - 1) {
      const bigram = `${word} ${words[index + 1]}`;
      let bigramHash = 0;
      for (let offset = 0; offset < Math.min(bigram.length, 20); offset += 1) {
        bigramHash = ((bigramHash << 5) - bigramHash) + bigram.charCodeAt(offset);
        bigramHash &= bigramHash;
      }
      embedding[Math.abs(bigramHash) % dimension] += 0.5;
    }
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0 ? embedding.map((value) => value / magnitude) : embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dotProduct += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function generateKey(query: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 200);
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(index);
    hash &= hash;
  }

  return `query_${Math.abs(hash)}_${normalized.slice(0, 50).replace(/[^a-z0-9]/g, '_')}`;
}

function isExpired(entry: AISemanticCacheRecord, ttlMs: number): boolean {
  return Date.now() - entry.metadata.timestamp > ttlMs;
}

export class SemanticCache {
  private config: SemanticCacheConfig;

  constructor(config: Partial<SemanticCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async get(query: string, userId?: string): Promise<CacheEntry | null> {
    const queryEmbedding = createSimpleEmbedding(query, this.config.embeddingDimension);
    const candidates = await querySemanticCacheCandidates(userId, this.config.candidateLimit);

    let bestMatch: AISemanticCacheRecord | null = null;
    let bestSimilarity = 0;

    for (const candidate of candidates) {
      if (isExpired(candidate, this.config.ttlMs)) {
        continue;
      }

      if (userId && candidate.userId && candidate.userId !== userId) {
        continue;
      }

      const entryEmbedding = candidate.queryEmbedding || createSimpleEmbedding(candidate.query, this.config.embeddingDimension);
      const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

      if (similarity > bestSimilarity && similarity >= this.config.similarityThreshold) {
        bestSimilarity = similarity;
        bestMatch = candidate;
      }
    }

    if (!bestMatch) {
      return null;
    }

    const nextHits = (bestMatch.accessStats?.hits || 0) + 1;
    const updated: AISemanticCacheRecord = {
      ...bestMatch,
      accessStats: {
        hits: nextHits,
        lastAccessed: Date.now(),
      },
    };

    void persistSemanticCacheEntry(updated).catch((error) => {
      logger.warn('[SemanticCache] Failed to update cache hit metadata', {
        cacheId: bestMatch?.cacheId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.debug('[SemanticCache] Cache hit', {
      similarity: bestSimilarity,
      query: query.slice(0, 50),
    });

    return {
      id: bestMatch.cacheId,
      query: bestMatch.query,
      queryEmbedding: bestMatch.queryEmbedding,
      response: bestMatch.response,
      metadata: bestMatch.metadata,
      accessStats: updated.accessStats,
    };
  }

  set(query: string, response: string, metadata: CacheEntry['metadata']): void {
    if (query.length < 10 || response.length < 20) {
      return;
    }

    if (response.toLowerCase().includes('error') ||
        (response.toLowerCase().includes('sorry') && response.length < 100)) {
      return;
    }

    const cacheId = generateKey(query);
    const entry: AISemanticCacheRecord = {
      cacheId,
      scope: metadata.userId ? 'user' : 'global',
      userId: metadata.userId,
      query: query.slice(0, 500),
      queryEmbedding: createSimpleEmbedding(query, this.config.embeddingDimension),
      response: response.slice(0, 10000),
      metadata,
      accessStats: {
        hits: 0,
        lastAccessed: Date.now(),
      },
      expiresAt: Date.now() + this.config.ttlMs,
    };

    void persistSemanticCacheEntry(entry).catch((error) => {
      logger.warn('[SemanticCache] Failed to persist cache entry', {
        cacheId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.debug('[SemanticCache] Stored entry', {
      cacheId,
      query: query.slice(0, 50),
    });
  }

  async clear(): Promise<void> {
    const candidates = await querySemanticCacheCandidates(undefined, this.config.candidateLimit);
    const cacheIds = candidates.map((candidate) => candidate.cacheId);
    await deleteSemanticCacheEntries(cacheIds);
    logger.info('[SemanticCache] Cache cleared');
  }

  async invalidatePattern(pattern: RegExp): Promise<number> {
    const candidates = await querySemanticCacheCandidates(undefined, this.config.candidateLimit);
    const cacheIds = candidates
      .filter((entry) => pattern.test(entry.query) || pattern.test(entry.cacheId))
      .map((entry) => entry.cacheId);
    return deleteSemanticCacheEntries(cacheIds);
  }

  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    return {
      size: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
    };
  }
}

export const globalSemanticCache = new SemanticCache();

export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .replace(/\b(a|an|the|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|need|dare|ought|used|to|of|in|for|on|with|at|by|from|as|into|through|during|before|after|above|below|between|under|again|further|then|once|here|there|when|where|why|how|all|each|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|just|but)\b/g, '')
    .trim();
}

export function isCacheableQuery(query: string): boolean {
  if (query.length < 10) return false;

  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /credit[_-]?card/i,
  ];

  return !sensitivePatterns.some((pattern) => pattern.test(query));
}
