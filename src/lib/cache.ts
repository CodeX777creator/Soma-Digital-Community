/**
 * Production caching utilities with SWR-like stale-while-revalidate pattern
 */

import { useEffect, useState, useCallback, useRef } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  staleAt: number;
}

interface CacheOptions {
  ttl?: number;
  staleWhileRevalidate?: number;
}

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  ttl: 5 * 60 * 1000,
  staleWhileRevalidate: 60 * 1000,
};

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  private evictLRU() {
    if (this.cache.size < this.maxSize) return;
    
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    
    const now = Date.now();
    if (now > entry.staleAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set<T>(key: string, data: T, options: CacheOptions = {}) {
    this.evictLRU();
    
    const config = { ...DEFAULT_OPTIONS, ...options };
    const now = Date.now();
    
    this.cache.set(key, {
      data,
      timestamp: now,
      staleAt: now + config.ttl + config.staleWhileRevalidate,
    });
  }

  isStale(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return true;
    
    const config = DEFAULT_OPTIONS;
    return Date.now() > entry.timestamp + config.ttl;
  }

  invalidate(key: string) {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp) {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

export const globalCache = new MemoryCache(200);

// Track in-flight requests for deduplication
const inFlightRequests = new Map<string, Promise<unknown>>();

interface SWROptions<T> {
  ttl?: number;
  staleWhileRevalidate?: number;
  fallbackData?: T;
  onError?: (error: Error) => void;
}

export async function swrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SWROptions<T> = {}
): Promise<T> {
  const cached = globalCache.get<T>(key);
  const isStale = globalCache.isStale(key);
  
  if (cached && !isStale) {
    return cached;
  }
  
  const existingRequest = inFlightRequests.get(key) as Promise<T> | undefined;
  if (existingRequest) {
    return existingRequest;
  }
  
  const request = fetcher()
    .then((data) => {
      globalCache.set(key, data, options);
      inFlightRequests.delete(key);
      return data;
    })
    .catch((error) => {
      inFlightRequests.delete(key);
      if (cached) return cached;
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    });
  
  inFlightRequests.set(key, request);
  
  if (cached) {
    request.catch(() => {});
    return cached;
  }
  
  return request;
}

export function useCachedData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: SWROptions<T> = {}
) {
  const [data, setData] = useState<T | null>(options.fallbackData || null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isMounted = useRef(true);

  const revalidate = useCallback(async () => {
    if (!key) return;
    
    const cached = globalCache.get<T>(key);
    if (cached) {
      setData(cached);
    }

    try {
      const fresh = await swrFetch(key, fetcher, options);
      if (isMounted.current) {
        setData(fresh);
        setError(null);
      }
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }, [key, fetcher, options]);

  useEffect(() => {
    isMounted.current = true;
    
    if (!key) {
      setIsLoading(false);
      return;
    }

    const cached = globalCache.get<T>(key);
    if (cached) {
      setData(cached);
      setIsLoading(false);
      if (globalCache.isStale(key)) {
        revalidate();
      }
    } else {
      setIsLoading(true);
      revalidate().finally(() => {
        if (isMounted.current) {
          setIsLoading(false);
        }
      });
    }

    return () => {
      isMounted.current = false;
    };
  }, [key, revalidate]);

  return { data, error, isLoading, revalidate };
}
