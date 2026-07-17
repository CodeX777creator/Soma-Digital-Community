import { requireRole } from "@/lib/serverAuth";
import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { listAIModels } from "@/services/ai-platform";

export const GET = createAPIHandler(
  async (req) => {
    await requireRole(req as any, "admin");
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "250") || 250, 1), 500);
    const models = await listAIModels(limit);

    return apiResponse({
      models,
      count: models.length,
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 30000,
  }
);
