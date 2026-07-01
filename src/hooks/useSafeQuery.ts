"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { logger } from "@/lib/logger";

interface UseSafeQueryOptions<T> {
  queryKey: string;
  queryFn: () => Promise<T>;
  enabled?: boolean;
  retry?: number;
  retryDelay?: number;
  staleTime?: number;
  initialData?: T;
  onError?: (error: Error) => void;
  onSuccess?: (data: T) => void;
}

interface UseSafeQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isSuccess: boolean;
  refetch: () => Promise<void>;
  retryCount: number;
}

export function useSafeQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
  retry = 3,
  retryDelay = 1000,
  staleTime = 0,
  initialData,
  onError,
  onSuccess,
}: UseSafeQueryOptions<T>): UseSafeQueryResult<T> {
  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const isMounted = useRef(true);
  const lastFetchTime = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const executeQuery = useCallback(async (isRetry = false): Promise<void> => {
    // Check if data is fresh
    const now = Date.now();
    if (!isRetry && staleTime > 0 && now - lastFetchTime.current < staleTime) {
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (isMounted.current) {
      setIsLoading(true);
      setIsError(false);
      setError(null);
    }

    let currentRetry = 0;

    while (currentRetry <= retry) {
      try {
        // Check if aborted
        if (abortControllerRef.current.signal.aborted) {
          return;
        }

        const result = await queryFn();

        if (isMounted.current) {
          setData(result);
          setIsLoading(false);
          setRetryCount(0);
          lastFetchTime.current = Date.now();
        }

        onSuccess?.(result);
        return;
      } catch (err) {
        currentRetry++;
        
        const error = err instanceof Error ? err : new Error(String(err));
        
        // Don't retry if aborted
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        logger.error(`Query failed (attempt ${currentRetry}/${retry + 1})`, error, {
          queryKey,
        });

        if (currentRetry > retry) {
          if (isMounted.current) {
            setError(error);
            setIsError(true);
            setIsLoading(false);
            setRetryCount(retry);
          }
          onError?.(error);
          return;
        }

        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(2, currentRetry - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }, [queryKey, queryFn, retry, retryDelay, staleTime, onError, onSuccess]);

  const refetch = useCallback(async () => {
    await executeQuery(true);
  }, [executeQuery]);

  useEffect(() => {
    if (enabled) {
      executeQuery();
    }
  }, [enabled, executeQuery, queryKey]);

  return {
    data,
    isLoading,
    isError,
    error,
    isSuccess: !isLoading && !isError && data !== undefined,
    refetch,
    retryCount,
  };
}

// Hook for paginated queries
interface UsePaginatedQueryOptions<T> extends Omit<UseSafeQueryOptions<T[]>, 'queryFn'> {
  queryFn: (page: number) => Promise<T[]>;
  pageSize?: number;
}

interface UsePaginatedQueryResult<T> extends Omit<UseSafeQueryResult<T[]>, 'data'> {
  data: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  fetchNextPage: () => void;
  fetchPreviousPage: () => void;
  page: number;
  setPage: (page: number) => void;
}

export function usePaginatedQuery<T>({
  queryKey,
  queryFn,
  pageSize = 10,
  ...options
}: UsePaginatedQueryOptions<T>): UsePaginatedQueryResult<T> {
  const [page, setPage] = useState(1);
  const [allData, setAllData] = useState<T[]>([]);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);

  const fetchPage = useCallback(async (pageNum: number) => {
    const result = await queryFn(pageNum);
    
    setHasNextPage(result.length === pageSize);
    setHasPreviousPage(pageNum > 1);
    
    if (pageNum === 1) {
      setAllData(result);
    } else {
      setAllData(prev => [...prev, ...result]);
    }
    
    return result;
  }, [queryFn, pageSize]);

  const { isLoading, isError, error, isSuccess, refetch, retryCount } = useSafeQuery({
    queryKey: `${queryKey}-page-${page}`,
    queryFn: () => fetchPage(page),
    ...options,
  });

  const fetchNextPage = useCallback(() => {
    if (hasNextPage && !isLoading) {
      setPage(p => p + 1);
    }
  }, [hasNextPage, isLoading]);

  const fetchPreviousPage = useCallback(() => {
    if (hasPreviousPage && !isLoading) {
      setPage(p => Math.max(1, p - 1));
    }
  }, [hasPreviousPage, isLoading]);

  return {
    data: allData,
    isLoading,
    isError,
    error,
    isSuccess,
    refetch,
    retryCount,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage,
    fetchPreviousPage,
    page,
    setPage,
  };
}
