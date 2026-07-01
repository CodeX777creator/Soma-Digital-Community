/**
 * Error Recovery & Resilience System
 * 
 * Comprehensive error handling with:
 * - Circuit breaker pattern
 * - Exponential backoff with jitter
 * - Graceful degradation
 * - Error classification
 * - Fallback strategies
 */

import { logger } from '@/lib/logger';

export type ErrorCategory = 
  | 'network'
  | 'timeout'
  | 'rate_limit'
  | 'auth'
  | 'validation'
  | 'server'
  | 'client'
  | 'unknown';

export interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  message: string;
  original: Error;
  suggestedAction: 'retry' | 'fallback' | 'fail' | 'wait';
  retryAfterMs?: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableCategories: ErrorCategory[];
  onRetry?: (attempt: number, error: ClassifiedError, delay: number) => void;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableCategories: ['network', 'timeout', 'rate_limit', 'server'],
};

/**
 * Classify errors for intelligent handling
 */
export function classifyError(error: unknown): ClassifiedError {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message.toLowerCase();

  // Network errors
  if (/network|fetch|connection|econnrefused|enotfound/i.test(message)) {
    return {
      category: 'network',
      retryable: true,
      message: err.message,
      original: err,
      suggestedAction: 'retry',
    };
  }

  // Timeout errors
  if (/timeout|etimedout/i.test(message)) {
    return {
      category: 'timeout',
      retryable: true,
      message: err.message,
      original: err,
      suggestedAction: 'retry',
    };
  }

  // Rate limit errors
  if (/rate.?limit|too.?many|quota|throttl/i.test(message)) {
    const retryAfterMatch = message.match(/retry.?after[:\s]*(\d+)/i);
    return {
      category: 'rate_limit',
      retryable: true,
      message: err.message,
      original: err,
      suggestedAction: 'wait',
      retryAfterMs: retryAfterMatch ? parseInt(retryAfterMatch[1]) * 1000 : 60000,
    };
  }

  // Auth errors
  if (/auth|unauthorized|forbidden|api.?key|token/i.test(message)) {
    return {
      category: 'auth',
      retryable: false,
      message: err.message,
      original: err,
      suggestedAction: 'fail',
    };
  }

  // Validation errors
  if (/valid|invalid|schema|parse|format/i.test(message)) {
    return {
      category: 'validation',
      retryable: false,
      message: err.message,
      original: err,
      suggestedAction: 'fail',
    };
  }

  // Server errors (5xx)
  if (/500|502|503|504|server.?error|unavailable/i.test(message)) {
    return {
      category: 'server',
      retryable: true,
      message: err.message,
      original: err,
      suggestedAction: 'retry',
    };
  }

  // Default
  return {
    category: 'unknown',
    retryable: false,
    message: err.message,
    original: err,
    suggestedAction: 'fail',
  };
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, policy: RetryPolicy): number {
  const exponential = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
  const jitter = Math.random() * policy.baseDelayMs;
  return Math.min(exponential + jitter, policy.maxDelayMs);
}

/**
 * Execute with intelligent retry
 */
export async function withResilience<T>(
  operation: () => Promise<T>,
  policy: Partial<RetryPolicy> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_POLICY, ...policy };
  let lastError: ClassifiedError | null = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const classified = classifyError(error);
      lastError = classified;

      logger.warn(`[Resilience] Operation failed (attempt ${attempt}/${config.maxAttempts})`, {
        category: classified.category,
        retryable: classified.retryable,
        message: classified.message,
      });

      // Don't retry on last attempt
      if (attempt === config.maxAttempts) {
        break;
      }

      // Check if error is retryable
      if (!classified.retryable || !config.retryableCategories.includes(classified.category)) {
        throw classified.original;
      }

      // Handle rate limiting
      if (classified.suggestedAction === 'wait' && classified.retryAfterMs) {
        logger.info(`[Resilience] Rate limited, waiting ${classified.retryAfterMs}ms`);
        await new Promise(r => setTimeout(r, classified.retryAfterMs));
        continue;
      }

      // Calculate and apply delay
      const delay = calculateDelay(attempt, config);
      config.onRetry?.(attempt, classified, delay);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError?.original || new Error('Operation failed after retries');
}

/**
 * Fallback chain executor
 */
export async function withFallbacks<T>(
  primary: () => Promise<T>,
  fallbacks: Array<() => Promise<T>>,
  options: {
    onFallback?: (index: number, error: Error) => void;
  } = {}
): Promise<T> {
  const operations = [primary, ...fallbacks];
  
  for (let i = 0; i < operations.length; i++) {
    try {
      return await operations[i]();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      if (i === operations.length - 1) {
        throw err;
      }
      
      options.onFallback?.(i, err);
      logger.info(`[Fallback] Operation ${i} failed, trying fallback ${i + 1}`);
    }
  }
  
  throw new Error('All fallbacks exhausted');
}

/**
 * Graceful degradation wrapper
 */
export async function withDegradation<T, D>(
  operation: () => Promise<T>,
  degradedOperation: () => Promise<D>,
  shouldDegrade?: (error: Error) => boolean
): Promise<T | D> {
  try {
    return await operation();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    
    if (shouldDegrade && !shouldDegrade(err)) {
      throw err;
    }
    
    logger.warn('[Degradation] Primary failed, using degraded mode', { error: err.message });
    return await degradedOperation();
  }
}

/**
 * Timeout wrapper with proper cleanup
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  abortController?: AbortController
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      abortController?.abort();
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

/**
 * Health check for external services
 */
export class HealthChecker {
  private statuses = new Map<string, { healthy: boolean; lastCheck: number; failures: number }>();
  private readonly checkIntervalMs = 60000;
  private readonly failureThreshold = 3;

  async check(serviceId: string, checkFn: () => Promise<boolean>): Promise<boolean> {
    const status = this.statuses.get(serviceId);
    const now = Date.now();

    // Use cached result if recent
    if (status && now - status.lastCheck < this.checkIntervalMs) {
      return status.healthy;
    }

    try {
      const healthy = await checkFn();
      this.statuses.set(serviceId, {
        healthy,
        lastCheck: now,
        failures: healthy ? 0 : (status?.failures || 0) + 1,
      });
      return healthy;
    } catch {
      const failures = (status?.failures || 0) + 1;
      this.statuses.set(serviceId, {
        healthy: failures < this.failureThreshold,
        lastCheck: now,
        failures,
      });
      return failures < this.failureThreshold;
    }
  }

  isHealthy(serviceId: string): boolean {
    return this.statuses.get(serviceId)?.healthy ?? true;
  }
}

export const healthChecker = new HealthChecker();
