import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";
import { AppError, createAppError, getUserSafeMessage, toAppError } from "./errors";
import { logAppError } from "./error-observability";

// API rate limiting map (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
};

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute

export function rateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const key = identifier;
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { allowed: true, remaining: config.maxRequests - 1, resetTime: now + config.windowMs };
  }

  if (record.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count++;
  return { allowed: true, remaining: config.maxRequests - record.count, resetTime: record.resetTime };
}

// Security headers for all API responses
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

// API response wrapper with consistent error handling
export function apiResponse<T>(
  data: T,
  options: {
    status?: number;
    headers?: Record<string, string>;
    cache?: {
      maxAge?: number;
      staleWhileRevalidate?: number;
      private?: boolean;
    };
  } = {}
) {
  const { status = 200, headers = {}, cache } = options;

  const responseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    // SECURITY: Add security headers to all API responses
    ...SECURITY_HEADERS,
    ...headers,
  };

  if (cache) {
    const { maxAge = 0, staleWhileRevalidate = 0, private: isPrivate = true } = cache;
    const cacheControl = isPrivate
      ? `private, max-age=${maxAge}${staleWhileRevalidate > 0 ? `, stale-while-revalidate=${staleWhileRevalidate}` : ""}`
      : `public, max-age=${maxAge}${staleWhileRevalidate > 0 ? `, stale-while-revalidate=${staleWhileRevalidate}` : ""}`;
    responseHeaders["Cache-Control"] = cacheControl;
  } else {
    responseHeaders["Cache-Control"] = "no-store, max-age=0";
  }

  return NextResponse.json(data, { status, headers: responseHeaders });
}

export function apiError(
  message: string,
  options: {
    status?: number;
    code?: string;
    details?: unknown;
    retryAfter?: number;
    requestId?: string;
    retryable?: boolean;
  } = {}
) {
  const { status = 500, code, details, retryAfter, requestId, retryable } = options;
  const appError = createAppError({
    status,
    code,
    message,
    details,
    requestId,
    retryable,
  });

  logAppError(appError, { requestId, action: "api_response", metadata: { status, code: appError.code, details } });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, max-age=0",
    // SECURITY: Add security headers to all error responses
    ...SECURITY_HEADERS,
  };

  if (retryAfter) {
    headers["Retry-After"] = String(retryAfter);
  }

  return NextResponse.json(
    {
      error: appError.userMessage,
      code: appError.code,
      requestId,
      retryable: appError.retryable,
      // SECURITY: Only include details in development to prevent information leakage
      details: process.env.NODE_ENV === "development" ? details : undefined,
      timestamp: new Date().toISOString(),
    },
    {
      status,
      headers,
    }
  );
}

// Structured API error classes for better error handling
export class APIRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code?: string,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'APIRequestError';
  }
}

export class ValidationError extends APIRequestError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', false);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends APIRequestError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED', false);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends APIRequestError {
  constructor(message: string = 'Rate limit exceeded', public readonly retryAfter: number = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends APIRequestError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE', true);
    this.name = 'ServiceUnavailableError';
  }
}

// Validate request body against a schema
export function validateBody<T>(
  body: unknown,
  validator: (data: unknown) => { success: true; data: T } | { success: false; error: string }
): { valid: true; data: T } | { valid: false; response: NextResponse } {
  const result = validator(body);

  if (!result.success) {
    return {
      valid: false,
      response: apiError(result.error, { status: 400, code: "VALIDATION_ERROR" }),
    };
  }

  return { valid: true, data: result.data };
}

// Get client IP for rate limiting
export function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIP = req.headers.get("x-real-ip");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  return "unknown";
}

// Timeout wrapper for API handlers
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context = "Operation"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new ServiceUnavailableError(`${context} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

// Retry wrapper for async operations
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

// API handler context type
interface RouteContext {
  params: Promise<Record<string, string>>;
}

// API handler wrapper with common middleware
export function createAPIHandler<T>(
  handler: (req: NextRequest, context: RouteContext) => Promise<NextResponse>,
  options: {
    requireAuth?: boolean;
    rateLimit?: RateLimitConfig;
    timeout?: number;
    retry?: {
      maxAttempts?: number;
      delayMs?: number;
    };
  } = {}
  ) {
  return async (req: NextRequest, context: RouteContext): Promise<NextResponse> => {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Rate limiting
      if (options.rateLimit) {
        const clientIP = getClientIP(req);
        const limitResult = rateLimit(`${clientIP}:${req.url}`, options.rateLimit);

        if (!limitResult.allowed) {
          const retryAfter = Math.ceil((limitResult.resetTime - Date.now()) / 1000);
          return apiError("Rate limit exceeded", {
            status: 429,
            code: "RATE_LIMIT_EXCEEDED",
            retryAfter,
          });
        }
      }

      // Execute handler with optional timeout and retry
      const executeHandler = async () => {
        if (options.timeout) {
          return await withTimeout(handler(req, context), options.timeout, "API Request");
        }
        return await handler(req, context);
      };

      let result: NextResponse;
      if (options.retry) {
        result = await withRetry(executeHandler, options.retry);
      } else {
        result = await executeHandler();
      }

      // Log slow requests
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        logger.warn(`Slow API request: ${req.url}`, { 
          duration: `${duration}ms`,
          requestId,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      const errorRecord = error as {
        status?: number;
        code?: string;
        message?: string;
        retryAfter?: number;
      } | null;

      const knownStatus = typeof errorRecord?.status === 'number' ? errorRecord.status : null;
      const knownCode = typeof errorRecord?.code === 'string' ? errorRecord.code : undefined;
      const knownMessage = typeof errorRecord?.message === 'string' ? errorRecord.message : undefined;
      
      // Handle known error types
      if (error instanceof APIRequestError || knownStatus || error instanceof AppError) {
        const appError = error instanceof AppError
          ? error
          : createAppError({
              status: error instanceof APIRequestError ? error.status : knownStatus || 500,
              code: error instanceof APIRequestError ? error.code : knownCode,
              message: error instanceof APIRequestError ? error.message : knownMessage || 'Request failed',
              requestId,
              retryable: error instanceof APIRequestError ? error.retryable : undefined,
            });
        logAppError(appError, {
          requestId,
          route: req.url,
          action: "api_handler",
          metadata: { status: appError.status, code: appError.code, duration: `${duration}ms` },
        });
        
        return apiError(appError.userMessage, {
          status: appError.status,
          code: appError.code,
          retryAfter: error instanceof RateLimitError ? error.retryAfter : typeof errorRecord?.retryAfter === 'number' ? errorRecord.retryAfter : undefined,
          requestId,
          retryable: appError.retryable,
        });
      }

      const appError = toAppError(error, {
        status: 500,
        code: "INTERNAL_ERROR",
        requestId,
        message: error instanceof Error ? error.message : String(error),
      });
      logAppError(appError, {
        requestId,
        route: req.url,
        action: "api_handler",
        metadata: { duration: `${duration}ms`, method: req.method },
      });

      return apiError(getUserSafeMessage(appError), {
        status: 500,
        code: appError.code,
        requestId,
        retryable: appError.retryable,
        details: process.env.NODE_ENV === "development" 
          ? error instanceof Error ? error.message : String(error)
          : undefined,
      });
    }
  };
}
