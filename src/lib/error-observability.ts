import { logger } from "@/lib/logger";
import { toAppError, type AppError } from "@/lib/errors";

export type ErrorEventName =
  | "error_shown"
  | "api_error"
  | "generation_failed"
  | "oauth_failed"
  | "upload_failed"
  | "permission_denied"
  | "credit_blocked"
  | "route_error_boundary_triggered";

type ErrorContext = {
  requestId?: string;
  userId?: string;
  route?: string;
  action?: string;
  feature?: string;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_KEYS = ["token", "secret", "key", "authorization", "cookie", "oauth", "code", "prompt", "password"];

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.some((needle) => lower.includes(needle))) return [key, "[redacted]"];
      if (typeof value === "string" && value.length > 240) return [key, `${value.slice(0, 240)}...`];
      return [key, value];
    })
  );
}

function serializeAppError(error: AppError, context: ErrorContext = {}) {
  return {
    requestId: context.requestId || error.requestId,
    userId: context.userId,
    route: context.route,
    action: context.action,
    feature: context.feature,
    severity: error.severity,
    code: error.code,
    category: error.category,
    retryable: error.retryable,
    status: error.status,
    userMessage: error.userMessage,
    debugMessage: error.debugMessage,
    metadata: sanitizeMetadata(context.metadata),
  };
}

export function logAppError(error: unknown, context: ErrorContext = {}) {
  const appError = toAppError(error);
  const payload = serializeAppError(appError, context);
  if (appError.severity === "critical" || appError.status >= 500) {
    logger.error("Application error", new Error(appError.debugMessage || appError.userMessage), payload);
  } else {
    logger.warn("Application warning", payload);
  }
  return appError;
}

export function trackErrorEvent(event: ErrorEventName, error: unknown, context: ErrorContext = {}) {
  const appError = toAppError(error);
  const payload = {
    event,
    ...serializeAppError(appError, context),
    occurredAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    void fetch("/api/errors/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  }

  return payload;
}
