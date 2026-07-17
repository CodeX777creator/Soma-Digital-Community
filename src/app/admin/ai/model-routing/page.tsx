"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Route, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    setDraft(existing || emptyConfig(selectedFeature));
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

            <label className="mt-4 block space-y-2 text-sm">
              <span className="text-white/70">Fallback model IDs, comma-separated</span>
              <Input value={draft.fallbackModelIds.join(", ")} onChange={(event) => setDraft({ ...draft, fallbackModelIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
            </label>

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
