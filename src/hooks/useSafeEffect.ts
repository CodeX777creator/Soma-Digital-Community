/**
 * Safe effect hooks that handle cleanup and race conditions properly
 */

import { useEffect, useRef, useCallback } from "react";

// Hook that tracks mounted state to prevent state updates after unmount
export function useIsMounted() {
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return isMounted;
}

// Safe setState that checks if component is still mounted
export function useSafeSetState<T>(
  setState: React.Dispatch<React.SetStateAction<T>>
) {
  const isMounted = useIsMounted();

  return useCallback(
    (value: React.SetStateAction<T>) => {
      if (isMounted.current) {
        setState(value);
      }
    },
    [setState, isMounted]
  );
}

// Effect that can be cancelled
export function useCancellableEffect(
  effect: (isCancelled: () => boolean) => void | (() => void),
  deps: React.DependencyList
) {
  const isCancelled = useRef(false);

  useEffect(() => {
    isCancelled.current = false;
    const cleanup = effect(() => isCancelled.current);

    return () => {
      isCancelled.current = true;
      if (cleanup) cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Hook for async operations with proper cleanup
export function useAsyncEffect<T>(
  asyncOperation: (isActive: () => boolean) => Promise<T>,
  onSuccess: (data: T, isActive: () => boolean) => void,
  onError: (error: Error, isActive: () => boolean) => void,
  deps: React.DependencyList
) {
  const isActive = useRef(true);

  useEffect(() => {
    isActive.current = true;

    asyncOperation(() => isActive.current)
      .then((data) => {
        if (isActive.current) {
          onSuccess(data, () => isActive.current);
        }
      })
      .catch((error) => {
        if (isActive.current) {
          onError(error instanceof Error ? error : new Error(String(error)), () => isActive.current);
        }
      });

    return () => {
      isActive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Debounced effect
export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: React.DependencyList,
  delay: number
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const cleanup = effect();
      if (cleanup) {
        // Store cleanup to call on unmount
        timeoutRef.current = setTimeout(cleanup, 0);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}

// Throttled effect
export function useThrottledEffect(
  effect: () => void,
  deps: React.DependencyList,
  interval: number
) {
  const lastRun = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRun.current;

    const runEffect = () => {
      lastRun.current = Date.now();
      effect();
    };

    if (timeSinceLastRun >= interval) {
      runEffect();
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(runEffect, interval - timeSinceLastRun);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, interval]);
}
