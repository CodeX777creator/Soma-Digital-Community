import { auth } from '@/lib/firebase';
import { ApiError, toAppError, type AppErrorShape } from '@/lib/errors';
import { trackErrorEvent } from '@/lib/error-observability';

export type ApiErrorPayload = {
  error?: string;
  code?: string;
  requestId?: string;
  retryable?: boolean;
  timestamp?: string;
  details?: unknown;
};

export async function parseApiError(response: Response, fallback = 'Request failed'): Promise<ApiError> {
  const payload = await response.json().catch(() => null) as ApiErrorPayload | null;
  const appError = toAppError({
    status: response.status,
    code: payload?.code,
    error: payload?.error || fallback,
    requestId: payload?.requestId,
    retryable: payload?.retryable,
    details: payload?.details,
  }, {
    status: response.status,
    message: fallback,
  });
  trackErrorEvent(
    appError.code === 'CREATOR_CREDITS_EXHAUSTED' || appError.code === 'BYOK_REQUIRED'
      ? 'credit_blocked'
      : response.status === 403
        ? 'permission_denied'
        : 'api_error',
    appError,
    { route: response.url, action: 'api_fetch' }
  );
  return new ApiError(appError as AppErrorShape);
}

export async function requireOk(response: Response, fallback = 'Request failed'): Promise<Response> {
  if (!response.ok) {
    throw await parseApiError(response, fallback);
  }
  return response;
}

export async function parseJsonResponse<T>(response: Response, fallback = 'Request failed'): Promise<T> {
  await requireOk(response, fallback);
  return response.json() as Promise<T>;
}

export async function authFetch(input: RequestInfo, init?: RequestInit) {
  if (!auth) {
    throw new Error('Authentication not initialized');
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User not authenticated');
  }

  const buildHeaders = async (forceRefresh = true) => {
    const token = await currentUser.getIdToken(forceRefresh);
    const headers = new Headers(init?.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  };

  const doFetch = async (headers: Headers) =>
    fetch(input, {
      ...init,
      headers,
      credentials: 'same-origin',
    });

  const headers = await buildHeaders(true);
  const response = await doFetch(headers);

  if (response.status === 401) {
    const refreshedHeaders = await buildHeaders(true);
    return doFetch(refreshedHeaders);
  }

  return response;
}

export async function authJsonFetch<T>(input: RequestInfo, init?: RequestInit, fallback = 'Request failed'): Promise<T> {
  const response = await authFetch(input, init);
  return parseJsonResponse<T>(response, fallback);
}
