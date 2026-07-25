"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { Loader2, Route, Save, Search, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const FEATURES = [
  "chat",
  "roadmap_generation",
  "image_generation",
  "video_generation",
  "audio_generation",
  "document_analysis",
  "translation",
  "vision",
  "speech_to_text",
];

const PLANS = ["explorer", "pro", "elite", "enterprise"];
const QUALITY = ["economy", "balanced", "premium", "cinematic", "auto"];
const DEFAULT_TIERS = ["explorer", "pro", "elite", "enterprise"];
const PREMIUM_TIERS = ["pro", "elite", "enterprise"];
const ELITE_TIERS = ["elite", "enterprise"];
type TierScope = "all" | "pro_plus" | "elite_plus";

type Config = {
  featureKey: string;
  defaultModelId: string;
  fallbackModelIds: string[];
  requiredCapabilities: string[];
  allowedTiers: string[];
  tierScope: TierScope;
  premiumDefaultModelId: string;
  premiumFallbackModelIds: string[];
  premiumAllowedTiers: string[];
  premiumTierScope: Exclude<TierScope, "all">;
  defaultQualityMode: string;
  premiumQualityMode: string;
  active: boolean;
  updatedAt?: string | Date | { toDate?: () => Date; seconds?: number } | null;
};

type Model = { id: string; name: string; type: string; provider: string; tags?: string[] };

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizeConfig(raw: unknown): Config | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const featureKey = typeof value.featureKey === "string" ? value.featureKey : "";
  if (!featureKey) return null;
  return {
    featureKey,
    defaultModelId: typeof value.defaultModelId === "string" ? value.defaultModelId : "",
    fallbackModelIds: normalizeStringArray(value.fallbackModelIds),
    requiredCapabilities: normalizeStringArray(value.requiredCapabilities),
    allowedTiers: (() => {
      const tiers = normalizeStringArray(value.allowedTiers);
      return tiers.length ? tiers : DEFAULT_TIERS;
    })(),
    tierScope: (() => {
      if (typeof value.tierScope === "string" && ["all", "pro_plus", "elite_plus"].includes(value.tierScope)) {
        return value.tierScope as TierScope;
      }
      const tiers = normalizeStringArray(value.allowedTiers);
      if (tiers.join(",") === PREMIUM_TIERS.join(",")) return "pro_plus";
      if (tiers.join(",") === ELITE_TIERS.join(",")) return "elite_plus";
      return "all";
    })(),
    premiumDefaultModelId: typeof value.premiumDefaultModelId === "string" ? value.premiumDefaultModelId : "",
    premiumFallbackModelIds: normalizeStringArray(value.premiumFallbackModelIds),
    premiumAllowedTiers: (() => {
      const tiers = normalizeStringArray(value.premiumAllowedTiers);
      return tiers.length ? tiers : PREMIUM_TIERS;
    })(),
    premiumTierScope: (() => {
      if (typeof value.premiumTierScope === "string" && ["pro_plus", "elite_plus"].includes(value.premiumTierScope)) {
        return value.premiumTierScope as Exclude<TierScope, "all">;
      }
      const tiers = normalizeStringArray(value.premiumAllowedTiers);
      if (tiers.join(",") === ELITE_TIERS.join(",")) return "elite_plus";
      return "pro_plus";
    })(),
    defaultQualityMode: typeof value.defaultQualityMode === "string" ? value.defaultQualityMode : "balanced",
    premiumQualityMode: typeof value.premiumQualityMode === "string" ? value.premiumQualityMode : "premium",
    active: value.active !== false,
    updatedAt: value.updatedAt as Config["updatedAt"],
  };
}

function getTierPreset(allowedTiers: string[] | TierScope) {
  const tiers = Array.isArray(allowedTiers) ? allowedTiers.join(",") : allowedTiers;
  if (tiers === "all") return "all";
  if (tiers === DEFAULT_TIERS.join(",")) return "all";
  if (tiers === PREMIUM_TIERS.join(",")) return "pro_plus";
  if (tiers === ELITE_TIERS.join(",")) return "elite_plus";
  return "custom";
}

function applyTierPreset(preset: TierScope, current: Config) {
  return {
    ...current,
    allowedTiers:
      preset === "all"
        ? DEFAULT_TIERS
        : preset === "pro_plus"
          ? PREMIUM_TIERS
          : ELITE_TIERS,
    tierScope: preset,
  };
}

function getTierScopeLabel(allowedTiers: string[] | TierScope, fallback: string) {
  const preset = getTierPreset(allowedTiers);
  if (preset === "all") return "All tiers";
  if (preset === "pro_plus") return "Pro +";
  if (preset === "elite_plus") return "Elite +";
  return fallback;
}

function applyPremiumTierPreset(preset: "pro_plus" | "elite_plus", current: Config) {
  return {
    ...current,
    premiumAllowedTiers: preset === "pro_plus" ? PREMIUM_TIERS : ELITE_TIERS,
    premiumTierScope: preset,
  };
}

function formatCommaList(value: unknown, fallback: string) {
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return items.length ? items.join(", ") : fallback;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
}

const FEATURE_TYPE_HINTS: Record<string, string[]> = {
  chat: ["language"],
  roadmap_generation: ["language"],
  image_generation: ["image"],
  video_generation: ["video"],
  audio_generation: ["speech", "audio"],
  document_analysis: ["language", "vision"],
  translation: ["language"],
  vision: ["vision"],
  speech_to_text: ["speech", "audio"],
};

const FEATURE_MODEL_HINTS: Record<string, string[]> = {
  image_generation: ["image", "imagen", "flux", "recraft", "vision"],
  video_generation: ["video", "veo", "seedance", "sora", "kling", "luma", "runway"],
  audio_generation: ["tts", "audio", "speech", "voice", "grok-tts", "eleven", "whisper"],
  speech_to_text: ["transcribe", "transcription", "whisper", "speech", "audio"],
  vision: ["vision", "multimodal", "image"],
  document_analysis: ["vision", "multimodal", "document", "pdf", "ocr"],
  translation: ["translate", "translation", "language"],
  chat: ["gpt", "gemini", "claude", "qwen", "llama", "mistral", "grok"],
  roadmap_generation: ["gpt", "gemini", "claude", "qwen", "llama", "mistral", "grok", "nemotron"],
};

function normalizeText(value: string | undefined | null) {
  return (value || "").toLowerCase();
}

function hasStrongCapabilityMatch(featureKey: string, model: Model) {
  const expectedTypes = FEATURE_TYPE_HINTS[featureKey] || [];
  const hints = FEATURE_MODEL_HINTS[featureKey] || [];
  const type = normalizeText(model.type);
  const id = normalizeText(model.id);
  const name = normalizeText(model.name);
  const tags = Array.isArray(model.tags) ? model.tags.map((tag) => normalizeText(tag)) : [];

  if (expectedTypes.includes(type)) return true;
  if (hints.some((hint) => id.includes(hint) || name.includes(hint) || tags.some((tag) => tag.includes(hint)))) return true;
  return false;
}

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

function emptyConfig(featureKey = "chat"): Config {
  return {
    featureKey,
    defaultModelId: "",
    fallbackModelIds: [],
    requiredCapabilities: [],
    allowedTiers: ["explorer", "pro", "elite", "enterprise"],
    tierScope: "all",
    premiumDefaultModelId: "",
    premiumFallbackModelIds: [],
    premiumAllowedTiers: ELITE_TIERS,
    premiumTierScope: "elite_plus",
    defaultQualityMode: "balanced",
    premiumQualityMode: "premium",
    active: true,
  };
}

export default function AdminAIModelRoutingPage() {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedFeature, setSelectedFeature] = useState("chat");
  const [draft, setDraft] = useState<Config>(emptyConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedConfig = useMemo(() => configs.find((config) => config.featureKey === selectedFeature) || null, [configs, selectedFeature]);
  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify({ ...emptyConfig(selectedFeature), ...(selectedConfig || {}) }), [draft, selectedConfig, selectedFeature]);
  const routingRows = useMemo(() => FEATURES.map((feature) => {
    const config = configs.find((item) => item.featureKey === feature) || null;
    return {
      feature,
      config,
      lastSaved: config?.updatedAt || null,
      warnings: getRoutingWarnings(feature, config || undefined, models),
    };
  }), [configs, models]);

  const load = async () => {
    setLoading(true);
    try {
      const [configRes, modelRes] = await Promise.all([
        adminFetch("/api/admin/ai/model-configs"),
        adminFetch("/api/admin/ai/models?limit=500"),
      ]);
      const configData = await configRes.json();
      const modelData = await modelRes.json();
      setConfigs(Array.isArray(configData.configs) ? configData.configs.map(normalizeConfig).filter((item: Config | null): item is Config => Boolean(item)) : []);
      setModels(Array.isArray(modelData.models) ? modelData.models : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Unable to load routing config.");
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setDraft({ ...emptyConfig(selectedFeature), ...(selectedConfig || {}) });
  }, [selectedConfig, selectedFeature]);

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
        <section className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">All routing configs</p>
                <p className="mt-1 text-sm text-white/50">A quick scan of every feature assignment, its saved model, and any rule warnings.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-white/35">
                    <th className="px-4 py-3">Feature</th>
                    <th className="px-4 py-3">Routes</th>
                    <th className="px-4 py-3">Tiers</th>
                    <th className="px-4 py-3">Quality</th>
                    <th className="px-4 py-3">Last saved</th>
                    <th className="px-4 py-3">Warnings</th>
                    <th className="px-4 py-3">Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {routingRows.map((row) => (
                    <tr key={row.feature} className="border-t border-white/10 text-sm text-white/75">
                      <td className="border-t border-white/10 px-4 py-3 capitalize">{row.feature.replace(/_/g, " ")}</td>
                      <td className="border-t border-white/10 px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-white">{row.config?.defaultModelId || "Not set"}</p>
                          <p className="text-xs text-white/40">Premium: {row.config?.premiumDefaultModelId || "Not set"}</p>
                        </div>
                      </td>
                      <td className="border-t border-white/10 px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-white/70">{row.config?.tierScope ? getTierScopeLabel(row.config.tierScope, "All tiers") : getTierScopeLabel(row.config?.allowedTiers || DEFAULT_TIERS, "All tiers")}</p>
                          <p className="text-xs text-white/40">Premium: {row.config?.premiumTierScope ? getTierScopeLabel(row.config.premiumTierScope, "Pro +") : getTierScopeLabel(row.config?.premiumAllowedTiers || PREMIUM_TIERS, "Pro +")}</p>
                        </div>
                      </td>
                      <td className="border-t border-white/10 px-4 py-3">
                        <div className="space-y-1">
                          <p className="text-white/70">{row.config?.defaultQualityMode || "balanced"}</p>
                          <p className="text-xs text-white/40">Premium: {row.config?.premiumQualityMode || "premium"}</p>
                        </div>
                      </td>
                      <td className="border-t border-white/10 px-4 py-3 text-white/50">{formatTimestamp(row.lastSaved)}</td>
                      <td className="border-t border-white/10 px-4 py-3">
                        {row.warnings.length ? (
                          <div className="flex flex-wrap gap-2">
                            {row.warnings.map((warning) => (
                              <span key={warning} className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-100">{warning}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-white/45">None</span>
                        )}
                      </td>
                      <td className="border-t border-white/10 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedFeature(row.feature)}
                          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <section className="grid gap-5 xl:grid-cols-[280px_1fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
            {FEATURES.map((feature) => (
              <button
                key={feature}
                type="button"
                onClick={() => setSelectedFeature(feature)}
                className={`mb-1 block w-full rounded-xl px-3 py-2 text-left text-sm ${selectedFeature === feature ? "bg-cyan-400/10 text-cyan-100" : "text-white/60 hover:bg-white/[0.06]"}`}
              >
                <span className="block">{feature.replace(/_/g, " ")}</span>
                <span className="mt-1 block text-[11px] text-white/40">
                  {configs.find((config) => config.featureKey === feature)?.defaultModelId || "No model set yet"}
                </span>
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Saved config</p>
                  <p className="mt-1 text-sm text-white/80">
                    {selectedConfig ? `Loaded from ${selectedFeature.replace(/_/g, " ")}` : "No saved config yet for this feature"}
                  </p>
                  <p className="mt-1 text-xs text-white/40">Last saved: {formatTimestamp(selectedConfig?.updatedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs ${selectedConfig?.active ? "bg-emerald-500/10 text-emerald-100" : "bg-white/[0.05] text-white/45"}`}>
                    {selectedConfig?.active ? "Active" : "Inactive"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...emptyConfig(selectedFeature), ...(selectedConfig || {}) })}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/65 hover:bg-white/[0.08] hover:text-white"
                  >
                    Reset to saved
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Base route</p>
                  <p className="mt-1 text-sm text-white">{selectedConfig?.defaultModelId || "Not set"}</p>
                  <p className="mt-1 text-xs text-white/40">All-tier route for explorer, pro, elite, and enterprise.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Premium override</p>
                  <p className="mt-1 text-sm text-white">{selectedConfig?.premiumDefaultModelId || "Not set"}</p>
                  <p className="mt-1 text-xs text-white/40">Used for Pro+ or Enterprise+ based on the selected premium tiers.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Base fallbacks</p>
                  <p className="mt-1 text-sm text-white">{selectedConfig?.fallbackModelIds?.length ? selectedConfig.fallbackModelIds.length : 0} selected</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Premium fallbacks</p>
                  <p className="mt-1 text-sm text-white">{selectedConfig?.premiumFallbackModelIds?.length ? selectedConfig.premiumFallbackModelIds.length : 0} selected</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">Tiers</p>
                  <p className="mt-1 text-sm text-white">{formatCommaList(selectedConfig?.allowedTiers, "All tiers")}</p>
                  <p className="mt-1 text-xs text-white/40">Preset: {selectedConfig ? getTierPreset(selectedConfig.allowedTiers) : "all"}</p>
                </div>
              </div>
              {getRoutingWarnings(selectedFeature, selectedConfig || undefined, models).length ? (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-50">
                  <p className="font-medium">Routing warnings</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/90">
                    {getRoutingWarnings(selectedFeature, selectedConfig || undefined, models).map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="text-white/70">Base default model</span>
                <select value={draft.defaultModelId} onChange={(event) => setDraft({ ...draft, defaultModelId: event.target.value })} className="h-11 w-full rounded-xl border border-white/10 bg-[#090B13] px-3 text-white">
                  <option value="">Choose model</option>
                  {models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-white/70">Base default quality</span>
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

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">Premium override</p>
                  <p className="mt-1 text-sm text-white/70">This lane activates for Pro, Elite, or Enterprise depending on the premium tier selection below.</p>
                </div>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                  {draft.premiumDefaultModelId ? "Configured" : "Not configured"}
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="text-white/70">Premium default model</span>
                  <select value={draft.premiumDefaultModelId} onChange={(event) => setDraft({ ...draft, premiumDefaultModelId: event.target.value })} className="h-11 w-full rounded-xl border border-white/10 bg-[#090B13] px-3 text-white">
                    <option value="">Choose model</option>
                    {models.map((model) => <option key={`premium-${model.id}`} value={model.id}>{model.id}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-white/70">Premium quality</span>
                  <select value={draft.premiumQualityMode} onChange={(event) => setDraft({ ...draft, premiumQualityMode: event.target.value })} className="h-11 w-full rounded-xl border border-white/10 bg-[#090B13] px-3 text-white">
                    {QUALITY.map((quality) => <option key={`premium-${quality}`} value={quality}>{quality}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-4 block space-y-2 text-sm">
                <span className="text-white/70">Premium fallback model IDs</span>
                <MultiModelSelect
                  models={models}
                  selectedIds={draft.premiumFallbackModelIds}
                  onChange={(ids) => setDraft({ ...draft, premiumFallbackModelIds: ids })}
                />
              </div>
              <div className="mt-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-white/70">Premium tier scope</p>
                  <p className="text-xs text-white/40">Choose one premium lane: Pro + or Elite +.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "pro_plus", label: "Pro +" },
                    { key: "elite_plus", label: "Elite +" },
                  ].map((preset) => {
                    const activePreset = draft.premiumTierScope;
                    const isSelected = activePreset === preset.key;

                    return (
                      <button
                        key={`premium-${preset.key}`}
                        type="button"
                        onClick={() => setDraft((current) => applyPremiumTierPreset(preset.key as "pro_plus" | "elite_plus", current))}
                        className={`rounded-full px-3 py-1 text-sm transition-colors ${isSelected ? "bg-cyan-400/15 text-cyan-100" : "bg-white/[0.05] text-white/45 hover:bg-white/[0.08] hover:text-white"}`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-white/70">Allowed tiers</p>
                <p className="text-xs text-white/40">Use the preset buttons to switch between all-tier and premium-only configs.</p>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  { key: "all", label: "All tiers" },
                  { key: "pro_plus", label: "Pro +" },
                  { key: "elite_plus", label: "Elite +" },
                ].map((preset) => {
                  const activePreset = selectedConfig ? draft.tierScope : "all";
                  const isSelected = activePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => setDraft((current) => applyTierPreset(preset.key as "all" | "pro_plus" | "elite_plus", current))}
                      className={`rounded-full px-3 py-1 text-sm transition-colors ${isSelected ? "bg-cyan-400/15 text-cyan-100" : "bg-white/[0.05] text-white/45 hover:bg-white/[0.08] hover:text-white"}`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {PLANS.map((plan) => {
                  const safeTiers = Array.isArray(draft.allowedTiers) ? draft.allowedTiers : [];
                  const isAllowed = safeTiers.includes(plan);
                  
                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setDraft((current) => {
                        const currentTiers = Array.isArray(current.allowedTiers) ? current.allowedTiers : [];
                        return {
                          ...current,
                          allowedTiers: currentTiers.includes(plan)
                            ? currentTiers.filter((item) => item !== plan)
                            : [...currentTiers, plan],
                        };
                      })}
                      className={`rounded-full px-3 py-1 text-sm ${isAllowed ? "bg-cyan-400/15 text-cyan-100" : "bg-white/[0.05] text-white/45"}`}
                    >
                      {plan}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={save} disabled={saving || !draft.defaultModelId || !hasChanges} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save routing
              </Button>
            </div>
          </div>
          </section>
        </section>
      )}
    </div>
  );
}

function getRoutingWarnings(featureKey: string, config: Config | undefined, models: Model[]) {
  const warnings: string[] = [];
  const expectedTypes = FEATURE_TYPE_HINTS[featureKey] || [];

  const validateRoute = (label: string, modelId?: string, tiers?: string[]) => {
    if (!modelId) {
      warnings.push(`${label} model not selected`);
      return;
    }
    const model = models.find((item) => item.id === modelId);
    if (!model) {
      warnings.push(`${label} model is not available in the synced catalog`);
      return;
    }
    if (expectedTypes.length && !hasStrongCapabilityMatch(featureKey, model)) {
      warnings.push(`${label} model type ${model.type || "unknown"} may not suit this feature`);
    }
    if (tiers && tiers.length === 0) {
      warnings.push(`${label} has no tiers configured`);
    }
  };

  validateRoute("Base", config?.defaultModelId, config?.allowedTiers);
  if (config?.premiumDefaultModelId || config?.premiumFallbackModelIds?.length) {
    validateRoute("Premium", config.premiumDefaultModelId, config.premiumAllowedTiers);
  }

  return warnings;
}

function formatTimestamp(value: Config["updatedAt"]) {
  if (!value) return "—";
  const date = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : typeof value === "object" && typeof value.toDate === "function"
        ? value.toDate()
        : typeof value === "object" && typeof value.seconds === "number"
          ? new Date(value.seconds * 1000)
          : null;

  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
