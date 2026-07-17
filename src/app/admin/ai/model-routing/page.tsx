"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Route, Save, Search, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const FEATURES = [
  "mentor_chat",
  "strategic_advice",
  "roadmap_generation",
  "content_generation",
  "translation",
  "image_generation",
  "video_generation",
  "voice_generation",
  "summary",
  "analysis",
];

const PLANS = ["explorer", "pro", "elite", "enterprise"];
const QUALITY = ["economy", "balanced", "premium", "cinematic", "auto"];

type Config = {
  featureKey: string;
  defaultModelId: string;
  fallbackModelIds: string[];
  requiredCapabilities: string[];
  allowedTiers: string[];
  defaultQualityMode: string;
  active: boolean;
};

type Model = { id: string; name: string; type: string; provider: string };

async function adminFetch(path: string, init?: RequestInit) {
  const token = await getAuth().currentUser?.getIdToken();
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

function MultiModelSelect({ models, selectedIds, onChange }: { models: Model[]; selectedIds?: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const safeSelectedIds = Array.isArray(selectedIds) ? selectedIds : [];

  const filtered = query.trim() ? models.filter((m) => m.id.toLowerCase().includes(query.toLowerCase()) || m.name.toLowerCase().includes(query.toLowerCase())) : models;

  const toggle = (id: string) => {
    if (safeSelectedIds.includes(id)) onChange(safeSelectedIds.filter(x => x !== id));
    else onChange([...safeSelectedIds, id]);
  };

  return (
    <div className="space-y-3">
      {safeSelectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {safeSelectedIds.map(id => (
            <div key={id} className="flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 pl-3 pr-1 py-1 text-xs text-cyan-200">
              {id}
              <button type="button" onClick={() => toggle(id)} className="rounded-full p-1 hover:bg-cyan-500/20 hover:text-cyan-100 transition-colors">
                <X className="h-3 w-3"/>
              </button>
            </div>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start border-white/10 bg-[#090B13] text-white hover:bg-white/5 hover:text-white font-normal">
            {safeSelectedIds.length === 0 ? "Select fallback models..." : `Add more fallback models (${safeSelectedIds.length} selected)`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] max-w-[90vw] p-0 border-white/10 bg-[#0b0e14] shadow-2xl shadow-black" align="start">
          <div className="flex items-center border-b border-white/10 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-white" />
            <input 
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-white/40 text-white"
              placeholder="Search by model ID or name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1">
            {filtered.length === 0 ? <p className="p-4 text-center text-sm text-white/50">No models found.</p> : null}
            {filtered.map((model) => {
              const isSelected = safeSelectedIds.includes(model.id);
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => toggle(model.id)}
                  className={`flex w-full items-center justify-between rounded-sm px-3 py-2 text-sm outline-none transition-colors hover:bg-white/10 text-white ${isSelected ? "bg-white/5" : ""}`}
                >
                  <div className="flex flex-col items-start text-left">
                    <span className="font-medium text-white/90">{model.name}</span>
                    <span className="text-[10px] text-white/40">{model.id}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-cyan-400" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function emptyConfig(featureKey = "content_generation"): Config {
  return {
    featureKey,
    defaultModelId: "",
    fallbackModelIds: [],
    requiredCapabilities: [],
    allowedTiers: ["explorer", "pro", "elite", "enterprise"],
    defaultQualityMode: "balanced",
    active: true,
  };
}

export default function AdminAIModelRoutingPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedFeature, setSelectedFeature] = useState("content_generation");
  const [draft, setDraft] = useState<Config>(emptyConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [configRes, modelRes] = await Promise.all([
      adminFetch("/api/admin/ai/model-configs"),
      adminFetch("/api/admin/ai/models?limit=500"),
    ]);
    const configData = await configRes.json();
    const modelData = await modelRes.json();
    setConfigs(configData.configs || []);
    setModels(modelData.models || []);
    setLoading(false);
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Unable to load routing config.");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const existing = configs.find((config) => config.featureKey === selectedFeature);
    setDraft({ ...emptyConfig(selectedFeature), ...(existing || {}) });
  }, [configs, selectedFeature]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await adminFetch("/api/admin/ai/model-configs", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("Unable to save routing config.");
      setMessage("Routing config saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save routing config.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div className="flex items-center gap-3">
          <Route className="h-5 w-5 text-cyan-200" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Model Routing</p>
            <h1 className="mt-2 text-2xl font-semibold">Assign models to platform features</h1>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/70">{message}</div> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-white/55"><Loader2 className="h-4 w-4 animate-spin" /> Loading routing config</div>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
            {FEATURES.map((feature) => (
              <button
                key={feature}
                type="button"
                onClick={() => setSelectedFeature(feature)}
                className={`mb-1 block w-full rounded-xl px-3 py-2 text-left text-sm ${selectedFeature === feature ? "bg-cyan-400/10 text-cyan-100" : "text-white/60 hover:bg-white/[0.06]"}`}
              >
                {feature.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-white/70">Default model</span>
                <select value={draft.defaultModelId} onChange={(event) => setDraft({ ...draft, defaultModelId: event.target.value })} className="h-11 w-full rounded-xl border border-white/10 bg-[#090B13] px-3 text-white">
                  <option value="">Choose model</option>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-white/70">Default quality</span>
                <select value={draft.defaultQualityMode} onChange={(event) => setDraft({ ...draft, defaultQualityMode: event.target.value })} className="h-11 w-full rounded-xl border border-white/10 bg-[#090B13] px-3 text-white">
                  {QUALITY.map((quality) => <option key={quality} value={quality}>{quality}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-4 block space-y-2 text-sm">
              <span className="text-white/70">Fallback model IDs</span>
              <MultiModelSelect 
                models={models} 
                selectedIds={draft.fallbackModelIds} 
                onChange={(ids) => setDraft({ ...draft, fallbackModelIds: ids })} 
              />
            </div>

            <div className="mt-5">
              <p className="mb-2 text-sm text-white/70">Allowed tiers</p>
              <div className="flex flex-wrap gap-2">
                {PLANS.map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => setDraft((current) => ({
                      ...current,
                      allowedTiers: current.allowedTiers.includes(plan)
                        ? current.allowedTiers.filter((item) => item !== plan)
                        : [...current.allowedTiers, plan],
                    }))}
                    className={`rounded-full px-3 py-1 text-sm ${draft.allowedTiers.includes(plan) ? "bg-cyan-400/15 text-cyan-100" : "bg-white/[0.05] text-white/45"}`}
                  >
                    {plan}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={save} disabled={saving || !draft.defaultModelId} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save routing
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
