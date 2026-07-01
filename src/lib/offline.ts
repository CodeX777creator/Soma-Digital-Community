/**
 * Offline detection and queueing utilities
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { secureStorage, safeJsonParse, safeJsonStringify } from "./secureStorage";
import { logger } from "./logger";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [wasOffline, setWasOffline] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    // Check initial state safely (SSR compatible)
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      if (isMounted.current) {
        setIsOnline(true);
        setWasOffline(true);
        // Reset wasOffline after a delay
        setTimeout(() => {
          if (isMounted.current) {
            setWasOffline(false);
          }
        }, 3000);
      }
    };

    const handleOffline = () => {
      if (isMounted.current) {
        setIsOnline(false);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      isMounted.current = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}

interface QueuedOperation<T> {
  id: string;
  operation: () => Promise<T>;
  retries: number;
  maxRetries: number;
}

class OfflineQueue {
  private queue: Map<string, QueuedOperation<unknown>> = new Map();
  private isProcessing = false;
  private storageKey = "soma-offline-queue";
  private maxQueueSize = 50;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      // SECURITY: Use secureStorage with validation
      const schema = {
        id: 'string',
        retries: 'number',
        maxRetries: 'number',
      };
      
      const stored = secureStorage.get<Array<{id: string; retries: number; maxRetries: number}>>(
        'offline-queue',
        { 
          schema,
          validate: (data) => Array.isArray(data) && data.every(item => 
            typeof item.id === 'string' && 
            typeof item.retries === 'number' && 
            typeof item.maxRetries === 'number'
          )
        }
      );
      
      if (stored) {
        // Note: We can't restore functions, just metadata
        // Actual operations need to be re-registered
        logger.info('Loaded offline queue from storage', { count: stored.length });
      }
    } catch {
      // Ignore storage errors (e.g., quota exceeded, private mode)
      logger.warn('Failed to load offline queue from storage');
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      const serializable = Array.from(this.queue.entries()).map(([id, op]) => ({
        id,
        retries: op.retries,
        maxRetries: op.maxRetries,
      }));
      
      // SECURITY: Use secureStorage with size limit
      secureStorage.set('offline-queue', serializable, { maxSize: 50 * 1024 });
    } catch {
      // Ignore storage errors
      logger.warn('Failed to save offline queue to storage');
    }
  }

  enqueue<T>(id: string, operation: () => Promise<T>, maxRetries = 3) {
    // Prevent queue from growing too large
    if (this.queue.size >= this.maxQueueSize) {
      // Remove oldest item
      const firstKey = this.queue.keys().next().value;
      if (firstKey) {
        this.queue.delete(firstKey);
      }
    }

    this.queue.set(id, {
      id,
      operation: operation as () => Promise<unknown>,
      retries: 0,
      maxRetries,
    });
    this.saveToStorage();
    this.processQueue();
  }

  dequeue(id: string) {
    this.queue.delete(id);
    this.saveToStorage();
  }

  async processQueue() {
    if (this.isProcessing) return;
    if (typeof window !== 'undefined' && !navigator.onLine) return;
    
    this.isProcessing = true;

    for (const [id, item] of this.queue.entries()) {
      if (item.retries >= item.maxRetries) {
        this.queue.delete(id);
        continue;
      }

      try {
        await item.operation();
        this.queue.delete(id);
        this.saveToStorage();
      } catch (error) {
        item.retries++;
      }
    }

    this.isProcessing = false;
  }

  getQueueSize() {
    return this.queue.size;
  }

  clear() {
    this.queue.clear();
    this.saveToStorage();
  }
}

export const offlineQueue = new OfflineQueue();

// Hook for offline-aware operations
export function useOfflineAware() {
  const { isOnline, wasOffline } = useOnlineStatus();

  const executeWhenOnline = useCallback(<T,>(
    operation: () => Promise<T>,
    options: { 
      queueId?: string; 
      onSuccess?: (result: T) => void;
      onError?: (error: Error) => void;
    } = {}
  ) => {
    if (isOnline) {
      return operation()
        .then((result) => {
          options.onSuccess?.(result);
          return result;
        })
        .catch((error) => {
          const err = error instanceof Error ? error : new Error(String(error));
          options.onError?.(err);
          throw err;
        });
    } else if (options.queueId) {
      offlineQueue.enqueue(options.queueId, operation);
      const error = new Error("Device is offline. Operation queued for retry.");
      options.onError?.(error);
      return Promise.reject(error);
    } else {
      const error = new Error("Device is offline.");
      options.onError?.(error);
      return Promise.reject(error);
    }
  }, [isOnline]);

  return {
    isOnline,
    wasOffline,
    executeWhenOnline,
    queueSize: offlineQueue.getQueueSize(),
  };
}

// Hook for debounced save operations
export function useDebouncedSave<T>(
  saveFn: (data: T) => Promise<void>,
  delay = 2000
) {
  const [pendingData, setPendingData] = useState<T | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const scheduleSave = useCallback((data: T) => {
    setSaveError(null);
    setPendingData(data);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      if (!isMounted.current) return;
      
      setIsSaving(true);
      try {
        await saveFn(data);
        if (isMounted.current) {
          setPendingData(null);
        }
      } catch (error) {
        if (isMounted.current) {
          setSaveError(error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        if (isMounted.current) {
          setIsSaving(false);
        }
      }
    }, delay);
  }, [saveFn, delay]);

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (pendingData) {
      setIsSaving(true);
      try {
        await saveFn(pendingData);
        if (isMounted.current) {
          setPendingData(null);
        }
      } catch (error) {
        if (isMounted.current) {
          setSaveError(error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        if (isMounted.current) {
          setIsSaving(false);
        }
      }
    }
  }, [pendingData, saveFn]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setPendingData(null);
    setSaveError(null);
  }, []);

  return {
    scheduleSave,
    pendingData,
    isSaving,
    saveError,
    flush,
    cancel,
  };
}
