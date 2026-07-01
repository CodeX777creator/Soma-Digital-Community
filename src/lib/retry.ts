/**
 * Production-grade retry logic with exponential backoff
 */

interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: Array<string | RegExp>;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    /network/i,
    /timeout/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /unavailable/i,
    "Failed to fetch",
    "NetworkError",
    "The service is currently unavailable",
  ],
  onRetry: () => {},
};

export class RetryableError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "RetryableError";
  }
}

export class NonRetryableError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "NonRetryableError";
  }
}

function isRetryableError(error: unknown, retryableErrors: Array<string | RegExp>): boolean {
  if (!(error instanceof Error)) return false;
  
  const errorMessage = error.message;
  
  return retryableErrors.some((pattern) => {
    if (typeof pattern === "string") {
      return errorMessage.includes(pattern);
    }
    return pattern.test(errorMessage);
  });
}

function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, options.maxDelay);
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on the last attempt
      if (attempt === config.maxAttempts) {
        break;
      }
      
      // Check if error is retryable
      if (!isRetryableError(error, config.retryableErrors)) {
        throw new NonRetryableError(lastError.message, lastError);
      }
      
      const delay = calculateDelay(attempt, config);
      config.onRetry(attempt, lastError, delay);
      
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  
  throw new RetryableError(
    `Operation failed after ${config.maxAttempts} attempts: ${lastError?.message}`,
    lastError || undefined
  );
}

/**
 * Wraps a function with retry logic
 */
export function withRetryWrapper<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options?: RetryOptions
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => withRetry(() => fn(...args), options);
}

/**
 * Timeout wrapper for promises
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName = "Operation"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * AbortController wrapper for fetch operations
 */
export function createAbortableOperation<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = 30000
): { promise: Promise<T>; abort: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  const promise = operation(controller.signal).finally(() => {
    clearTimeout(timeoutId);
  });
  
  return {
    promise,
    abort: () => {
      clearTimeout(timeoutId);
      controller.abort();
    },
  };
}
