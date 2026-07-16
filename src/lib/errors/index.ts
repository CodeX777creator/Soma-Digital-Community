export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export type ErrorCategory =
  | "auth"
  | "permission"
  | "validation"
  | "billing"
  | "credits"
  | "ai"
  | "social_oauth"
  | "social_publishing"
  | "scheduler"
  | "upload"
  | "community"
  | "academy"
  | "marketplace"
  | "admin"
  | "network"
  | "unknown";

export type ErrorCode =
  | "UNKNOWN_ERROR"
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED"
  | "FORBIDDEN"
  | "FIRESTORE_PERMISSION_DENIED"
  | "RATE_LIMIT_EXCEEDED"
  | "SERVICE_UNAVAILABLE"
  | "CREATOR_CREDITS_EXHAUSTED"
  | "BYOK_REQUIRED"
  | "AI_PROVIDER_KEY_INVALID"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_CONTENT_BLOCKED"
  | "AI_MALFORMED_RESPONSE"
  | "AI_RENDER_FAILED"
  | "AI_GENERATION_FAILED"
  | "SOCIAL_OAUTH_CONFIG_MISSING"
  | "SOCIAL_OAUTH_INVALID_CLIENT"
  | "SOCIAL_OAUTH_MISSING_SCOPES"
  | "SOCIAL_OAUTH_REDIRECT_MISMATCH"
  | "SOCIAL_OAUTH_TOKEN_EXCHANGE_FAILED"
  | "SOCIAL_ACCOUNT_ALREADY_CONNECTED"
  | "SOCIAL_CREDENTIALS_MASTER_KEY_MISSING"
  | "SOCIAL_PROVIDER_NOT_CONFIGURED"
  | "SOCIAL_APP_REVIEW_NOT_APPROVED"
  | "SOCIAL_OAUTH_FAILED"
  | "SOCIAL_PUBLISH_FAILED"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_UNSUPPORTED_TYPE"
  | "UPLOAD_INTERRUPTED"
  | "UPLOAD_STORAGE_PERMISSION_DENIED"
  | "UPLOAD_STORAGE_UNAVAILABLE"
  | "BILLING_REQUEST_FAILED"
  | "POST_NOT_FOUND"
  | "POST_DELETED"
  | "POST_DELETE_FAILED"
  | "POST_RESTORE_FAILED"
  | "ACADEMY_REQUEST_FAILED"
  | "MARKETPLACE_REQUEST_FAILED";

export interface AppErrorShape {
  code: ErrorCode | string;
  status: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  userMessage: string;
  debugMessage?: string;
  requestId?: string;
  details?: unknown;
}

export class AppError extends Error implements AppErrorShape {
  code: ErrorCode | string;
  status: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  userMessage: string;
  debugMessage?: string;
  requestId?: string;
  details?: unknown;

  constructor(shape: AppErrorShape) {
    super(shape.userMessage);
    this.name = "AppError";
    this.code = shape.code;
    this.status = shape.status;
    this.category = shape.category;
    this.severity = shape.severity;
    this.retryable = shape.retryable;
    this.userMessage = shape.userMessage;
    this.debugMessage = shape.debugMessage;
    this.requestId = shape.requestId;
    this.details = shape.details;
  }
}

export class ApiError extends AppError {
  constructor(shape: AppErrorShape) {
    super(shape);
    this.name = "ApiError";
  }
}

export class UserSafeError extends AppError {
  constructor(shape: AppErrorShape) {
    super(shape);
    this.name = "UserSafeError";
  }
}

const MESSAGE_BY_CODE: Partial<Record<ErrorCode | string, string>> = {
  UNKNOWN_ERROR: "Something went wrong. Please try again.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again shortly.",
  VALIDATION_ERROR: "Some information needs attention before this can continue.",
  INVALID_INPUT: "Some information needs attention before this can continue.",
  UNAUTHORIZED: "Please sign in again to continue.",
  SESSION_EXPIRED: "Your session expired. Please sign in again.",
  FORBIDDEN: "You do not have access to perform this action.",
  FIRESTORE_PERMISSION_DENIED: "You do not have access to perform this action.",
  RATE_LIMIT_EXCEEDED: "You are moving a little too fast. Please wait a moment and try again.",
  SERVICE_UNAVAILABLE: "This service is temporarily unavailable. Please try again shortly.",
  CREATOR_CREDITS_EXHAUSTED: "You need Creator Credits to run this generation.",
  BYOK_REQUIRED: "Add Creator Credits, upgrade your plan, or enable your own provider key to continue.",
  AI_PROVIDER_KEY_INVALID: "Your AI provider key needs attention before this can run.",
  AI_PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable. Please try again shortly.",
  AI_PROVIDER_TIMEOUT: "The AI provider took too long to respond. Please try again shortly.",
  AI_CONTENT_BLOCKED: "This request was blocked for safety. Adjust the prompt and try again.",
  AI_MALFORMED_RESPONSE: "Soma AI returned an unexpected response. Please try again.",
  AI_RENDER_FAILED: "The media render failed. Please try again or adjust the request.",
  AI_GENERATION_FAILED: "Soma AI could not complete this request. Try again or adjust the prompt.",
  SOCIAL_OAUTH_CONFIG_MISSING: "This connection needs setup before it can be used.",
  SOCIAL_OAUTH_INVALID_CLIENT: "This social app has an invalid client ID. Ask an admin to check the provider setup.",
  SOCIAL_OAUTH_MISSING_SCOPES: "This social app is missing an approved permission. Ask an admin to review the provider setup.",
  SOCIAL_OAUTH_REDIRECT_MISMATCH: "This social app redirect URL does not match the provider setup.",
  SOCIAL_OAUTH_TOKEN_EXCHANGE_FAILED: "The provider approved the connection, but token exchange failed. Try again shortly.",
  SOCIAL_ACCOUNT_ALREADY_CONNECTED: "This social account is already connected.",
  SOCIAL_CREDENTIALS_MASTER_KEY_MISSING: "Social credential encryption needs setup before accounts can be connected.",
  SOCIAL_PROVIDER_NOT_CONFIGURED: "This social provider is not configured yet.",
  SOCIAL_APP_REVIEW_NOT_APPROVED: "This provider permission is waiting for app review approval.",
  SOCIAL_OAUTH_FAILED: "We could not connect this social account. Check the provider setup and try again.",
  SOCIAL_PUBLISH_FAILED: "This post could not be published. Review the account status and try again.",
  UPLOAD_TOO_LARGE: "This file is too large. Try a smaller file.",
  UPLOAD_UNSUPPORTED_TYPE: "This file type is not supported here.",
  UPLOAD_INTERRUPTED: "The upload was interrupted. Please try again.",
  UPLOAD_STORAGE_PERMISSION_DENIED: "You do not have permission to upload this file here.",
  UPLOAD_STORAGE_UNAVAILABLE: "File storage is temporarily unavailable. Please try again shortly.",
  BILLING_REQUEST_FAILED: "Billing could not complete this action. Please try again.",
  POST_NOT_FOUND: "This post is no longer available.",
  POST_DELETED: "This post has already been deleted.",
  POST_DELETE_FAILED: "We could not delete this post. Please try again.",
  POST_RESTORE_FAILED: "We could not restore this post. Please try again.",
  ACADEMY_REQUEST_FAILED: "Academy could not complete this action. Please try again.",
  MARKETPLACE_REQUEST_FAILED: "Marketplace could not complete this action. Please try again.",
};

const CATEGORY_BY_CODE: Partial<Record<ErrorCode | string, ErrorCategory>> = {
  UNAUTHORIZED: "auth",
  SESSION_EXPIRED: "auth",
  FORBIDDEN: "permission",
  FIRESTORE_PERMISSION_DENIED: "permission",
  VALIDATION_ERROR: "validation",
  INVALID_INPUT: "validation",
  CREATOR_CREDITS_EXHAUSTED: "credits",
  BYOK_REQUIRED: "credits",
  AI_PROVIDER_KEY_INVALID: "ai",
  AI_PROVIDER_UNAVAILABLE: "ai",
  AI_PROVIDER_TIMEOUT: "ai",
  AI_CONTENT_BLOCKED: "ai",
  AI_MALFORMED_RESPONSE: "ai",
  AI_RENDER_FAILED: "ai",
  AI_GENERATION_FAILED: "ai",
  SOCIAL_OAUTH_CONFIG_MISSING: "social_oauth",
  SOCIAL_OAUTH_INVALID_CLIENT: "social_oauth",
  SOCIAL_OAUTH_MISSING_SCOPES: "social_oauth",
  SOCIAL_OAUTH_REDIRECT_MISMATCH: "social_oauth",
  SOCIAL_OAUTH_TOKEN_EXCHANGE_FAILED: "social_oauth",
  SOCIAL_ACCOUNT_ALREADY_CONNECTED: "social_oauth",
  SOCIAL_CREDENTIALS_MASTER_KEY_MISSING: "social_oauth",
  SOCIAL_PROVIDER_NOT_CONFIGURED: "social_oauth",
  SOCIAL_APP_REVIEW_NOT_APPROVED: "social_oauth",
  SOCIAL_OAUTH_FAILED: "social_oauth",
  SOCIAL_PUBLISH_FAILED: "social_publishing",
  UPLOAD_TOO_LARGE: "upload",
  UPLOAD_UNSUPPORTED_TYPE: "upload",
  UPLOAD_INTERRUPTED: "upload",
  UPLOAD_STORAGE_PERMISSION_DENIED: "upload",
  UPLOAD_STORAGE_UNAVAILABLE: "upload",
  BILLING_REQUEST_FAILED: "billing",
  POST_NOT_FOUND: "community",
  POST_DELETED: "community",
  POST_DELETE_FAILED: "community",
  POST_RESTORE_FAILED: "community",
  ACADEMY_REQUEST_FAILED: "academy",
  MARKETPLACE_REQUEST_FAILED: "marketplace",
  RATE_LIMIT_EXCEEDED: "network",
  SERVICE_UNAVAILABLE: "network",
};

function normalizeCode(input: unknown, status = 500): ErrorCode | string {
  const code = typeof input === "string" && input.trim() ? input.trim() : "";
  if (code) return code;
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 429) return "RATE_LIMIT_EXCEEDED";
  if (status >= 500) return "INTERNAL_ERROR";
  return "UNKNOWN_ERROR";
}

function inferSeverity(status: number): ErrorSeverity {
  if (status >= 500) return "error";
  if (status === 429) return "warning";
  if (status >= 400) return "warning";
  return "info";
}

function inferRetryable(status: number, code: string): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500 || code === "SERVICE_UNAVAILABLE";
}

export function getUserSafeMessage(error: unknown, fallback = MESSAGE_BY_CODE.UNKNOWN_ERROR || "Something went wrong. Please try again."): string {
  if (error instanceof AppError) return error.userMessage;
  const anyError = error as { code?: unknown; status?: unknown; message?: unknown; error?: unknown } | null;
  const status = typeof anyError?.status === "number" ? anyError.status : 500;
  const code = normalizeCode(anyError?.code, status);
  const mapped = MESSAGE_BY_CODE[code];
  if (mapped) return mapped;
  if (status === 401) return MESSAGE_BY_CODE.UNAUTHORIZED || fallback;
  if (status === 403) return MESSAGE_BY_CODE.FORBIDDEN || fallback;
  if (status === 429) return MESSAGE_BY_CODE.RATE_LIMIT_EXCEEDED || fallback;
  if (status >= 500) return MESSAGE_BY_CODE.INTERNAL_ERROR || fallback;
  return typeof anyError?.error === "string" ? anyError.error : fallback;
}

export function createAppError(input: Partial<AppErrorShape> & { message?: string; code?: ErrorCode | string }): AppError {
  const status = typeof input.status === "number" ? input.status : 500;
  const code = normalizeCode(input.code, status);
  const category = input.category || CATEGORY_BY_CODE[code] || "unknown";
  const userMessage = input.userMessage || MESSAGE_BY_CODE[code] || getUserSafeMessage({ code, status }, input.message || MESSAGE_BY_CODE.UNKNOWN_ERROR);
  return new AppError({
    code,
    status,
    category,
    severity: input.severity || inferSeverity(status),
    retryable: typeof input.retryable === "boolean" ? input.retryable : inferRetryable(status, code),
    userMessage,
    debugMessage: input.debugMessage || input.message,
    requestId: input.requestId,
    details: input.details,
  });
}

export function toAppError(error: unknown, fallback?: Partial<AppErrorShape> & { message?: string }): AppError {
  if (error instanceof AppError) return error;

  const anyError = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    error?: unknown;
    requestId?: unknown;
    retryable?: unknown;
    details?: unknown;
    data?: unknown;
  } | null;

  const data = typeof anyError?.data === "object" && anyError.data !== null ? anyError.data as Record<string, unknown> : null;
  const status = typeof anyError?.status === "number"
    ? anyError.status
    : typeof fallback?.status === "number"
      ? fallback.status
      : 500;
  const code = normalizeCode(anyError?.code || data?.code || fallback?.code, status);
  const rawMessage =
    typeof data?.error === "string" ? data.error :
    typeof anyError?.error === "string" ? anyError.error :
    typeof anyError?.message === "string" ? anyError.message :
    fallback?.message;

  return createAppError({
    ...fallback,
    status,
    code,
    userMessage: MESSAGE_BY_CODE[code] || getUserSafeMessage({ code, status, error: rawMessage }, fallback?.userMessage),
    debugMessage: rawMessage,
    retryable: typeof anyError?.retryable === "boolean" ? anyError.retryable : fallback?.retryable,
    requestId: typeof anyError?.requestId === "string" ? anyError.requestId : typeof data?.requestId === "string" ? data.requestId : fallback?.requestId,
    details: anyError?.details || data?.details || fallback?.details,
  });
}

export function isRetryableError(error: unknown): boolean {
  return toAppError(error).retryable;
}

export function getErrorActionLabel(error: unknown): string {
  const appError = toAppError(error);
  if (appError.code === "UNAUTHORIZED" || appError.code === "SESSION_EXPIRED") return "Sign in";
  if (appError.code === "CREATOR_CREDITS_EXHAUSTED" || appError.code === "BYOK_REQUIRED") return "Buy Credits";
  if (appError.category === "social_oauth") return "Check Setup";
  if (appError.retryable) return "Try Again";
  return "Review";
}

export function getErrorToast(error: unknown, fallbackTitle = "Action failed") {
  const appError = toAppError(error);
  return {
    title: fallbackTitle,
    description: appError.requestId ? `${appError.userMessage} Reference: ${appError.requestId}` : appError.userMessage,
    variant: "destructive" as const,
  };
}

export * from "./domain";
