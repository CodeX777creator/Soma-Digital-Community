/**
 * Production API client with timeout, retry, and error handling
 */

import { withRetry, withTimeout, createAbortableOperation } from "./retry";
import { logger, logApiError } from "./logger";

interface ApiClientOptions {
  timeout?: number;
  retries?: number;
  baseUrl?: string;
  headers?: Record<string, string>;
}

const DEFAULT_OPTIONS: Required<ApiClientOptions> = {
  timeout: 30000,
  retries: 3,
  baseUrl: "",
  headers: {},
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & ApiClientOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const url = `${config.baseUrl}${endpoint}`;

  const operation = async () => {
    const { promise, abort } = createAbortableOperation(
      async (signal) => {
        const response = await fetch(url, {
          ...options,
          signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new ApiError(
            errorData?.error || `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            errorData
          );
        }

        if (response.status === 204) {
          return null as T;
        }

        return response.json() as Promise<T>;
      },
      config.timeout
    );

    return promise;
  };

  try {
    return await withRetry(operation, {
      maxAttempts: config.retries,
      onRetry: (attempt, error, delay) => {
        logger.warn(`API retry ${attempt} for ${endpoint}`, {
          error: error.message,
          delay,
        });
      },
    });
  } catch (error) {
    const apiError = error instanceof ApiError 
      ? error 
      : new ApiError(
          error instanceof Error ? error.message : "Unknown error",
          0
        );
    
    logApiError(endpoint, apiError, options.body);
    throw apiError;
  }
}

// Auth-aware fetch that includes Firebase token
export async function authFetch<T>(
  endpoint: string,
  options: RequestInit & ApiClientOptions = {}
): Promise<T> {
  // Get token from Firebase auth
  const { auth } = await import("@/lib/firebase");
  
  if (!auth?.currentUser) {
    throw new ApiError("Not authenticated", 401);
  }

  const token = await auth.currentUser.getIdToken();

  // Convert headers to Record<string, string> if needed
  const existingHeaders: Record<string, string> = {};
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        existingHeaders[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        existingHeaders[key] = value;
      });
    } else {
      Object.assign(existingHeaders, options.headers);
    }
  }

  return apiFetch<T>(endpoint, {
    ...options,
    headers: {
      ...existingHeaders,
      Authorization: `Bearer ${token}`,
    },
  });
}

// Typed API client for common operations
export const apiClient = {
  get: <T>(endpoint: string, options?: ApiClientOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "GET" }),

  post: <T>(endpoint: string, body: unknown, options?: ApiClientOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: JSON.stringify(body),
    }),

  put: <T>(endpoint: string, body: unknown, options?: ApiClientOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: JSON.stringify(body),
    }),

  delete: <T>(endpoint: string, options?: ApiClientOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "DELETE" }),
};


