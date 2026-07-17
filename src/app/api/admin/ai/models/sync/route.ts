import { requireRole } from "@/lib/serverAuth";
import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { syncVercelAIModels } from "@/services/ai-platform";

export const POST = createAPIHandler(
  async (req) => {
    const entitlements = await requireRole(req as any, "admin");
    const result = await syncVercelAIModels(entitlements.uid);

    return apiResponse({
      message: "AI model registry synced",
      ...result,
    });
  },
  {
    rateLimit: { windowMs: 5 * 60 * 1000, maxRequests: 3 },
    timeout: 90000,
  }
);
