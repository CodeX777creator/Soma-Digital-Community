import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import {
  AI_ORCHESTRATION_OUTCOMES_COLLECTION,
  AI_PROVIDER_METRICS_COLLECTION,
} from "@/ai/telemetry/firestore";

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export const GET = createAPIHandler(
  async (req) => {
    await requireRole(req as any, "admin");
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || "100") || 100, 1), 250);

    const [metricsSnap, outcomesSnap, ledgerSnap] = await Promise.all([
      adminDb.collection(AI_PROVIDER_METRICS_COLLECTION).orderBy("updatedAt", "desc").limit(limit).get(),
      adminDb.collection(AI_ORCHESTRATION_OUTCOMES_COLLECTION).orderBy("createdAt", "desc").limit(limit).get(),
      adminDb.collection("creatorCreditLedger").orderBy("timestamp", "desc").limit(limit).get(),
    ]);

    const metrics = metricsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const outcomes = outcomesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const ledger = ledgerSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const failedOutcomes = outcomes.filter((item: any) => item.status === "failed");
    const topExpensiveModels = Object.values(
      ledger.reduce((acc: Record<string, any>, item: any) => {
        const modelId = item.modelId || "unknown";
        const current = acc[modelId] || { modelId, creditsCharged: 0, requestCount: 0 };
        current.creditsCharged += safeNumber(item.creditsCharged);
        current.requestCount += 1;
        acc[modelId] = current;
        return acc;
      }, {})
    ).sort((a: any, b: any) => b.creditsCharged - a.creditsCharged).slice(0, 10);

    const summary = {
      requestCount: metrics.reduce((total: number, item: any) => total + safeNumber(item.requestCount), 0),
      successCount: metrics.reduce((total: number, item: any) => total + safeNumber(item.successCount), 0),
      failureCount: metrics.reduce((total: number, item: any) => total + safeNumber(item.failureCount), 0),
      creditsCharged: ledger.reduce((total: number, item: any) => total + safeNumber(item.creditsCharged), 0),
      creditsReserved: ledger.reduce((total: number, item: any) => total + safeNumber(item.creditsReserved), 0),
      creditsRefunded: ledger.reduce((total: number, item: any) => total + safeNumber(item.creditsRefunded), 0),
    };

    return apiResponse({
      summary,
      metrics,
      outcomes,
      failedOutcomes,
      ledger,
      topExpensiveModels,
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 },
    timeout: 30000,
  }
);
