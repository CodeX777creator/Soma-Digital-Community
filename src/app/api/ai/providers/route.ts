import { NextRequest } from "next/server";
import { requireSubscription } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { sanitizeString } from "@/lib/security";
import { AIProviderId, PROVIDER_CATALOG } from "@/ai/platform";
import { listProviderConnections, upsertProviderConnection } from "@/services/ai-platform";

const SUPPORTED_PROVIDER_IDS = new Set(Object.keys(PROVIDER_CATALOG) as AIProviderId[]);

function isProviderId(value: unknown): value is AIProviderId {
  return typeof value === "string" && SUPPORTED_PROVIDER_IDS.has(value as AIProviderId);
}

export const GET = createAPIHandler(
  async (req: NextRequest) => {
    const entitlements = await requireSubscription(req as any, "pro");
    const connections = await listProviderConnections(entitlements.uid);

    return apiResponse({
      providers: Object.values(PROVIDER_CATALOG).map((provider) => ({
        providerId: provider.id,
        label: provider.label,
        supports: provider.supports,
      })),
      connections,
    }, {
      cache: {
        maxAge: 30,
        staleWhileRevalidate: 60,
        private: true,
      },
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 15000,
  }
);

export const POST = createAPIHandler(
  async (req: NextRequest) => {
    const entitlements = await requireSubscription(req as any, "pro");
    const body = await req.json();

    if (!isProviderId(body.providerId)) {
      return apiError("Unsupported provider", { status: 400, code: "INVALID_PROVIDER" });
    }

    if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return apiError("API key is required", { status: 400, code: "INVALID_INPUT" });
    }

    const connection = await upsertProviderConnection({
      userId: entitlements.uid,
      providerId: body.providerId,
      apiKey: sanitizeString(body.apiKey, 4096),
      enabled: body.enabled !== false,
      verified: false,
      defaultModel: typeof body.defaultModel === "string" ? sanitizeString(body.defaultModel, 120) : undefined,
      mode: body.mode === "credits" || body.mode === "byok" || body.mode === "hybrid" ? body.mode : "hybrid",
    });

    return apiResponse({ connection }, { status: 201 });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 6 },
    timeout: 20000,
  }
);

