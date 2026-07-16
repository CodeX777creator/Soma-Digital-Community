import { createAppError, type AppError, type AppErrorShape, type ErrorCategory, type ErrorCode } from "@/lib/errors";

type DomainErrorOptions = Partial<Omit<AppErrorShape, "code" | "category">> & {
  message?: string;
  details?: unknown;
};

function createDomainError(category: ErrorCategory, code: ErrorCode | string, options: DomainErrorOptions = {}): AppError {
  return createAppError({
    ...options,
    code,
    category,
    debugMessage: options.debugMessage || options.message,
  });
}

export function createAuthError(code: ErrorCode | string = "UNAUTHORIZED", options?: DomainErrorOptions) {
  return createDomainError("auth", code, { status: 401, ...options });
}

export function createCreditError(code: ErrorCode | string = "CREATOR_CREDITS_EXHAUSTED", options?: DomainErrorOptions) {
  return createDomainError("credits", code, { status: 402, ...options });
}

export function createSocialOAuthError(code: ErrorCode | string = "SOCIAL_OAUTH_FAILED", options?: DomainErrorOptions) {
  return createDomainError("social_oauth", code, { status: 400, ...options });
}

export function createSocialPublishingError(code: ErrorCode | string = "SOCIAL_PUBLISH_FAILED", options?: DomainErrorOptions) {
  return createDomainError("social_publishing", code, { status: 400, ...options });
}

export function createAcademyError(code: ErrorCode | string = "ACADEMY_REQUEST_FAILED", options?: DomainErrorOptions) {
  return createDomainError("academy", code, { status: 400, ...options });
}

export function createCommunityError(code: ErrorCode | string = "POST_NOT_FOUND", options?: DomainErrorOptions) {
  return createDomainError("community", code, { status: 400, ...options });
}

export function createUploadError(code: ErrorCode | string = "UPLOAD_UNSUPPORTED_TYPE", options?: DomainErrorOptions) {
  return createDomainError("upload", code, { status: 400, ...options });
}

export function createBillingError(code: ErrorCode | string = "BILLING_REQUEST_FAILED", options?: DomainErrorOptions) {
  return createDomainError("billing", code, { status: 400, ...options });
}

export function createAIError(code: ErrorCode | string = "AI_GENERATION_FAILED", options?: DomainErrorOptions) {
  return createDomainError("ai", code, { status: 500, ...options });
}
