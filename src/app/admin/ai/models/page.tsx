"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { Database, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AIModel = {
  id: string;
  name: string;
  provider: string;
  type: string;
  tags?: string[];
  pricing?: Record<string, number>;
  sdcEnabled?: boolean;
  tierAccess?: string[];
  creditClass?: string;
  creditMultiplier?: number;
};

async function adminFetch(path: string, init?: RequestInit) {
  const user = getAuth().currentUser;
  const token = await user?.getIdToken();
  if (!token) throw new Error("Admin session is not ready.");
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export default function AdminAIModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminFetch("/api/admin/ai/models?limit=500");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Unable to load AI models.");
      }
      const data = await response.json();
      setModels(data.models || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load AI models.");
    } finally {
      setLoading(false);
    }
  };

  const syncModels = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await adminFetch("/api/admin/ai/models/sync", { method: "POST" });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Model sync failed.");
      }
      await loadModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Model sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void loadModels();
  }, []);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return models;
    return models.filter((model) => (
      (model.id || "").toLowerCase().includes(value) ||
      (model.name || "").toLowerCase().includes(value) ||
      (model.provider || "").toLowerCase().includes(value) ||
      (model.type || "").toLowerCase().includes(value) ||
      (model.tags || []).some((tag) => (tag || "").toLowerCase().includes(value))
    ));
  }, [models, query]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Model Catalog</p>
          <h1 className="mt-2 text-2xl font-semibold">Synced Vercel AI Gateway models</h1>
          <p className="mt-2 text-sm text-white/55">Inspect provider, type, capabilities, pricing, tier access, and SDC class.</p>
        </div>
        <Button onClick={syncModels} disabled={syncing} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync models
        </Button>
      </section>

      {error ? <div className="rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.035]">
        <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm text-white/65">
            <Database className="h-4 w-4 text-cyan-200" />
            {filtered.length} model{filtered.length === 1 ? "" : "s"}
          </div>
          <div className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-white/35" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models" className="pl-9" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading models
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filtered.map((model) => (
              <div key={model.id} className="grid gap-3 p-4 lg:grid-cols-[1.4fr_0.7fr_0.7fr_1fr] lg:items-center">
                <div>
                  <p className="font-semibold text-white">{model.name}</p>
                  <p className="mt-1 text-xs text-white/45">{model.id}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(model.tags || []).slice(0, 5).map((tag) => (
                      <span key={tag} className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/55">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="text-sm text-white/65">
                  <p>{model.provider}</p>
                  <p className="text-xs text-white/40">{model.type}</p>
                </div>
                <div className="text-sm text-white/65">
                  <p className="capitalize">{model.creditClass || "standard"}</p>
                  <p className="text-xs text-white/40">×{model.creditMultiplier || 1} multiplier</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(model.tierAccess || []).map((tier) => (
                    <span key={tier} className="rounded-full bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100">{tier}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
