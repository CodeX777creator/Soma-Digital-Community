import { NextRequest } from "next/server";
import { requireSubscription } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { sanitizeString } from "@/lib/security";
import { AIProviderId, PROVIDER_CATALOG } from "@/ai/platform";
import { removeProviderConnection, testProviderConnection, toggleProviderConnection, upsertProviderConnection } from "@/services/ai-platform";

function parseProviderId(raw: string): AIProviderId | null {
  return Object.prototype.hasOwnProperty.call(PROVIDER_CATALOG, raw) ? (raw as AIProviderId) : null;
}

export const PATCH = createAPIHandler(
  async (req: NextRequest, context) => {
    const entitlements = await requireSubscription(req as any, "pro");
    const providerId = parseProviderId((await context.params).providerId);
    if (!providerId) {
      return apiError("Unsupported provider", { status: 400, code: "INVALID_PROVIDER" });
    }

    const body = await req.json();
    const enabled = body.enabled === true;
    const connection = await toggleProviderConnection(entitlements.uid, providerId, enabled);

    if (!connection) {
      return apiError("Provider connection not found", { status: 404, code: "NOT_FOUND" });
    }

    return apiResponse({ connection });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
    timeout: 15000,
  }
);

export const POST = createAPIHandler(
  async (req: NextRequest, context) => {
    const entitlements = await requireSubscription(req as any, "pro");
    const providerId = parseProviderId((await context.params).providerId);
    if (!providerId) {
      return apiError("Unsupported provider", { status: 400, code: "INVALID_PROVIDER" });
    }

    const body = await req.json();

    if (body.action === "test") {
      const result = await testProviderConnection(entitlements.uid, providerId);
      return apiResponse(result);
    }

    if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return apiError("API key is required", { status: 400, code: "INVALID_INPUT" });
    }

    const connection = await upsertProviderConnection({
      userId: entitlements.uid,
      providerId,
      apiKey: sanitizeString(body.apiKey, 4096),
      enabled: body.enabled !== false,
      verified: false,
      defaultModel: typeof body.defaultModel === "string" ? sanitizeString(body.defaultModel, 120) : undefined,
      mode: body.mode === "credits" || body.mode === "byok" || body.mode === "hybrid" ? body.mode : "hybrid",
    });

    return apiResponse({ connection }, { status: 201 });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 8 },
    timeout: 20000,
  }
);

export const DELETE = createAPIHandler(
  async (_req: NextRequest, context) => {
    const entitlements = await requireSubscription(_req as any, "pro");
    const providerId = parseProviderId((await context.params).providerId);
    if (!providerId) {
      return apiError("Unsupported provider", { status: 400, code: "INVALID_PROVIDER" });
    }

    await removeProviderConnection(entitlements.uid, providerId);
    return apiResponse({ ok: true });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 8 },
    timeout: 15000,
  }
);

