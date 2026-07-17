"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { Activity, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type UsagePayload = {
  summary: {
    requestCount: number;
    successCount: number;
    failureCount: number;
    creditsCharged: number;
    creditsReserved: number;
    creditsRefunded: number;
  };
  metrics: any[];
  failedOutcomes: any[];
  topExpensiveModels: Array<{ modelId: string; creditsCharged: number; requestCount: number }>;
  ledger: any[];
};

async function adminFetch(path: string) {
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) throw new Error("Admin session is not ready.");
  return fetch(path, { headers: { Authorization: `Bearer ${token}` } });
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs text-white/45">{note}</p>
    </div>
  );
}

export default function AdminAIUsagePage() {
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminFetch("/api/admin/ai/usage?limit=150");
      if (!response.ok) throw new Error("Unable to load AI usage.");
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI usage.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const successRate = useMemo(() => {
    if (!data?.summary.requestCount) return 0;
    return Math.round((data.summary.successCount / data.summary.requestCount) * 100);
  }, [data]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Gateway Usage</p>
          <h1 className="mt-2 text-2xl font-semibold">AI operations health and credit flow</h1>
        </div>
        <Button onClick={load} disabled={loading} variant="outline">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </section>

      {error ? <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-white/55"><Loader2 className="h-4 w-4 animate-spin" /> Loading usage</div>
      ) : data ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Stat label="Requests" value={data.summary.requestCount.toLocaleString()} note="Recent provider metrics" />
            <Stat label="Success rate" value={`${successRate}%`} note={`${data.summary.failureCount} failed`} />
            <Stat label="Charged" value={data.summary.creditsCharged.toLocaleString()} note="Creator Credits" />
            <Stat label="Reserved" value={data.summary.creditsReserved.toLocaleString()} note="Before reconciliation" />
            <Stat label="Returned" value={data.summary.creditsRefunded.toLocaleString()} note="Refunded to users" />
            <Stat label="Failures" value={data.failedOutcomes.length.toLocaleString()} note="Needs attention" />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.035]">
              <div className="flex items-center gap-2 border-b border-white/10 p-4 text-sm font-semibold">
                <Activity className="h-4 w-4 text-cyan-200" />
                Top expensive models
              </div>
              <div className="divide-y divide-white/10">
                {data.topExpensiveModels.length === 0 ? (
                  <p className="p-4 text-sm text-white/45">No model usage yet.</p>
                ) : data.topExpensiveModels.map((model) => (
                  <div key={model.modelId} className="grid grid-cols-[1fr_110px_90px] gap-3 p-4 text-sm">
                    <span className="truncate text-white/75">{model.modelId}</span>
                    <span className="text-right text-cyan-100">{model.creditsCharged} credits</span>
                    <span className="text-right text-white/45">{model.requestCount} req</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.035]">
              <div className="flex items-center gap-2 border-b border-white/10 p-4 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-200" />
                Failed requests
              </div>
              <div className="divide-y divide-white/10">
                {data.failedOutcomes.length === 0 ? (
                  <p className="p-4 text-sm text-white/45">No recent failed AI requests.</p>
                ) : data.failedOutcomes.slice(0, 10).map((item) => (
                  <div key={item.id || item.traceId} className="p-4">
                    <p className="text-sm font-medium text-white">{item.feature || item.task}</p>
                    <p className="mt-1 text-xs text-white/45">{item.modelId} · {item.providerId}</p>
                    <p className="mt-2 text-xs text-red-100/80">{item.errorMessage || item.reason || "Unknown failure"}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
