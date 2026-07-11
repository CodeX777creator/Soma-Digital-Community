"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Download, Filter, History, ImageIcon, Loader2, RefreshCcw, Search, Sparkles, Wand2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_STYLE_PRESETS,
  type BrandTemplate,
  type ImageAssetRecord,
  type ImageAspectRatio,
  type ImageStylePreset,
} from "@/ai/studio/types";

type ImageStudioResponse = {
  image: {
    assetId: string;
    title: string;
    prompt: string;
    promptEdits?: string;
    negativePrompt?: string;
    stylePreset: ImageStylePreset;
    aspectRatio: ImageAspectRatio;
    brandTemplate?: BrandTemplate | null;
    brandName?: string;
    storagePath: string;
    thumbnail: string;
    provider: string;
    model: string;
    visibility: "private" | "team" | "public";
    tags: string[];
    checksum: string;
    status: "completed" | "failed";
    downloadUrl?: string;
    durationMs: number;
    mimeType: string;
    promptPreview: string;
  };
};

type ImageStudioHistoryResponse = {
  capabilities: {
    stylePresets: readonly ImageStylePreset[];
    aspectRatios: readonly ImageAspectRatio[];
  };
  assets: ImageAssetRecord[];
};

interface ImageStudioFormState {
  prompt: string;
  promptEdits: string;
  negativePrompt: string;
  stylePreset: ImageStylePreset;
  aspectRatio: ImageAspectRatio;
  title: string;
  brandName: string;
  brandTemplateName: string;
  brandTemplateNotes: string;
  brandLogoUrl: string;
  brandColors: string;
  brandFonts: string;
  visibility: "private" | "team" | "public";
}

type GalleryFilters = {
  search: string;
  stylePreset: "all" | ImageStylePreset;
  aspectRatio: "all" | ImageAspectRatio;
  visibility: "all" | ImageStudioFormState["visibility"];
};

const DEFAULT_PROMPT = "A premium digital business studio scene with a polished laptop, strategy notes, and branded marketing assets on a clean workspace.";

const DEFAULT_FILTERS: GalleryFilters = {
  search: "",
  stylePreset: "all",
  aspectRatio: "all",
  visibility: "all",
};

function buildBrandTemplate(form: ImageStudioFormState): BrandTemplate | null {
  const colors = form.brandColors
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const fonts = form.brandFonts
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const hasBrandData = form.brandTemplateName || form.brandTemplateNotes || form.brandLogoUrl || colors.length > 0 || fonts.length > 0;

  if (!hasBrandData) return null;

  return {
    name: form.brandTemplateName || undefined,
    description: form.brandTemplateNotes || undefined,
    logoUrl: form.brandLogoUrl || undefined,
    colors: colors.length > 0 ? colors : undefined,
    fonts: fonts.length > 0 ? fonts : undefined,
    notes: form.brandTemplateNotes || undefined,
  };
}

function createPromptReuseState(asset: ImageAssetRecord): ImageStudioFormState {
  return {
    prompt: asset.prompt,
    promptEdits: asset.promptEdits || "",
    negativePrompt: asset.negativePrompt || "",
    stylePreset: asset.stylePreset,
    aspectRatio: asset.aspectRatio,
    title: asset.title || "",
    brandName: asset.brandName || "",
    brandTemplateName: asset.brandTemplate?.name || "",
    brandTemplateNotes: asset.brandTemplate?.notes || asset.brandTemplate?.description || "",
    brandLogoUrl: asset.brandTemplate?.logoUrl || "",
    brandColors: asset.brandTemplate?.colors?.join(", ") || "",
    brandFonts: asset.brandTemplate?.fonts?.join(", ") || "",
    visibility: asset.visibility,
  };
}

function createPromptReuseStateFromLatest(image: NonNullable<ImageStudioResponse["image"]>): ImageStudioFormState {
  return {
    prompt: image.prompt,
    promptEdits: image.promptEdits || "",
    negativePrompt: image.negativePrompt || "",
    stylePreset: image.stylePreset,
    aspectRatio: image.aspectRatio,
    title: image.title || "",
    brandName: image.brandName || "",
    brandTemplateName: image.brandTemplate?.name || "",
    brandTemplateNotes: image.brandTemplate?.notes || image.brandTemplate?.description || "",
    brandLogoUrl: image.brandTemplate?.logoUrl || "",
    brandColors: image.brandTemplate?.colors?.join(", ") || "",
    brandFonts: image.brandTemplate?.fonts?.join(", ") || "",
    visibility: image.visibility,
  };
}

export default function ImageStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<ImageStudioFormState>({
    prompt: DEFAULT_PROMPT,
    promptEdits: "",
    negativePrompt: "",
    stylePreset: "photorealistic",
    aspectRatio: "1:1",
    title: "",
    brandName: "",
    brandTemplateName: "",
    brandTemplateNotes: "",
    brandLogoUrl: "",
    brandColors: "",
    brandFonts: "",
    visibility: "private",
  });
  const [history, setHistory] = useState<ImageAssetRecord[]>([]);
  const [latestImage, setLatestImage] = useState<ImageStudioResponse["image"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [filters, setFilters] = useState<GalleryFilters>(DEFAULT_FILTERS);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const brandTemplate = useMemo(() => buildBrandTemplate(state), [state]);

  const selectedAsset = useMemo(
    () => history.find((asset) => asset.assetId === selectedAssetId) || history[0] || null,
    [history, selectedAssetId]
  );

  const filteredHistory = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return history.filter((asset) => {
      const matchesStyle = filters.stylePreset === "all" || asset.stylePreset === filters.stylePreset;
      const matchesAspect = filters.aspectRatio === "all" || asset.aspectRatio === filters.aspectRatio;
      const matchesVisibility = filters.visibility === "all" || asset.visibility === filters.visibility;
      if (!matchesStyle || !matchesAspect || !matchesVisibility) return false;
      if (!query) return true;

      const searchable = [
        asset.title,
        asset.prompt,
        asset.promptEdits,
        asset.negativePrompt,
        asset.brandName,
        asset.provider,
        asset.model,
        asset.tags.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [filters, history]);

  const loadHistory = async () => {
    if (!user) return;
    const idToken = await user.getIdToken();
    const response = await fetch("/api/ai/image-studio?limit=24", {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Could not load image history.");
    }

    const data = (await response.json()) as ImageStudioHistoryResponse;
    setHistory(data.assets || []);
    setSelectedAssetId((current) => current || data.assets?.[0]?.assetId || null);
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user) {
        setLoadingHistory(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/ai/image-studio?limit=24", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!response.ok) {
          throw new Error("Could not load image history.");
        }

        const data = (await response.json()) as ImageStudioHistoryResponse;
        if (mounted) {
          setHistory(data.assets || []);
          setSelectedAssetId(data.assets?.[0]?.assetId || null);
        }
      } catch (error) {
        if (mounted) {
          toast({
            title: "History unavailable",
            description: error instanceof Error ? error.message : "Could not load the image library.",
            variant: "destructive",
          });
        }
      } finally {
        if (mounted) {
          setLoadingHistory(false);
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [toast, user]);

  const updateField = <K extends keyof ImageStudioFormState>(key: K, value: ImageStudioFormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const handleReuseAsset = (asset: ImageAssetRecord) => {
    setState(createPromptReuseState(asset));
    setSelectedAssetId(asset.assetId);
    toast({
      title: "Image loaded",
      description: "We filled the form with the saved image settings.",
    });
  };

  const handleRegenerateAsset = async (asset: ImageAssetRecord) => {
    if (!user || loading) return;

    try {
      setLoading(true);
      setState(createPromptReuseState(asset));
      setSelectedAssetId(asset.assetId);

      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/image-studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt: asset.prompt,
          promptEdits: asset.promptEdits || undefined,
          negativePrompt: asset.negativePrompt || undefined,
          stylePreset: asset.stylePreset,
          aspectRatio: asset.aspectRatio,
          title: asset.title || undefined,
          brandName: asset.brandName || undefined,
          brandTemplate: asset.brandTemplate || undefined,
          visibility: asset.visibility,
          tags: asset.tags,
          conversationSummary: `Regenerated from saved asset ${asset.assetId}`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Image regeneration failed.");
      }

      const data = (await response.json()) as ImageStudioResponse;
      setLatestImage(data.image);
      await loadHistory();
      toast({
        title: "Image regenerated",
        description: "We created a fresh version from the saved history item.",
      });
    } catch (error) {
      toast({
        title: "Regeneration failed",
        description: error instanceof Error ? error.message : "The image studio could not regenerate this asset.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/image-studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt: state.prompt,
          promptEdits: state.promptEdits || undefined,
          negativePrompt: state.negativePrompt || undefined,
          stylePreset: state.stylePreset,
          aspectRatio: state.aspectRatio,
          title: state.title || undefined,
          brandName: state.brandName || undefined,
          brandTemplate: brandTemplate || undefined,
          visibility: state.visibility,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Image generation failed.");
      }

      const data = (await response.json()) as ImageStudioResponse;
      setLatestImage(data.image);
      setSelectedAssetId(data.image.assetId);
      await loadHistory();
      toast({
        title: "Image generated",
        description: "Your asset is ready and saved to the library.",
      });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "The image studio could not complete this request.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">AI Image Studio</h1>
                <p className="text-sm text-muted-foreground">
                  Build branded visuals, save them to your library, and reuse them from history.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={loadHistory} disabled={loadingHistory || loading}>
                {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                Refresh
              </Button>
            </div>

            <GlassCard className="p-5">
              <form className="space-y-4" onSubmit={handleGenerate}>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Prompt</label>
                  <Textarea value={state.prompt} onChange={(event) => updateField("prompt", event.target.value)} rows={5} />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Prompt edits</label>
                    <Textarea
                      value={state.promptEdits}
                      onChange={(event) => updateField("promptEdits", event.target.value)}
                      rows={3}
                      placeholder="Add lighting, composition, mood, or style notes."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Negative prompt</label>
                    <Textarea
                      value={state.negativePrompt}
                      onChange={(event) => updateField("negativePrompt", event.target.value)}
                      rows={3}
                      placeholder="Describe anything to avoid."
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Style preset</label>
                    <select
                      className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                      value={state.stylePreset}
                      onChange={(event) => updateField("stylePreset", event.target.value as ImageStylePreset)}
                    >
                      {IMAGE_STYLE_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Aspect ratio</label>
                    <select
                      className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                      value={state.aspectRatio}
                      onChange={(event) => updateField("aspectRatio", event.target.value as ImageAspectRatio)}
                    >
                      {IMAGE_ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Visibility</label>
                    <select
                      className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                      value={state.visibility}
                      onChange={(event) => updateField("visibility", event.target.value as ImageStudioFormState["visibility"])}
                    >
                      <option value="private">Private</option>
                      <option value="team">Team</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input value={state.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Optional asset title" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand name</label>
                    <Input value={state.brandName} onChange={(event) => updateField("brandName", event.target.value)} placeholder="Optional brand name" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand template name</label>
                    <Input value={state.brandTemplateName} onChange={(event) => updateField("brandTemplateName", event.target.value)} placeholder="Campaign or brand system name" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand logo URL</label>
                    <Input value={state.brandLogoUrl} onChange={(event) => updateField("brandLogoUrl", event.target.value)} placeholder="https://..." />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand colors</label>
                    <Input value={state.brandColors} onChange={(event) => updateField("brandColors", event.target.value)} placeholder="#0f172a, #2563eb, #eab308" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brand fonts</label>
                    <Input value={state.brandFonts} onChange={(event) => updateField("brandFonts", event.target.value)} placeholder="Inter, Sora, Geist" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Brand template notes</label>
                  <Textarea
                    value={state.brandTemplateNotes}
                    onChange={(event) => updateField("brandTemplateNotes", event.target.value)}
                    rows={3}
                    placeholder="Describe the visual identity, audience, or campaign direction."
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate image
                </Button>
              </form>
            </GlassCard>
          </section>

          <aside className="space-y-6">
            <GlassCard className="p-5">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">Latest asset</h2>
              </div>
              {latestImage ? (
                <div className="mt-4 space-y-4">
                  <div className="overflow-hidden rounded-md border border-border bg-black/10">
                    <img src={latestImage.thumbnail} alt={latestImage.title} className="h-auto w-full object-cover" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">{latestImage.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {latestImage.stylePreset.replace(/_/g, " ")} · {latestImage.aspectRatio} · {latestImage.provider}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => {
                      setState(createPromptReuseStateFromLatest(latestImage));
                      toast({
                        title: "Image loaded",
                        description: "We filled the form with the latest generated image settings.",
                      });
                    }}>
                      <Copy className="h-4 w-4" />
                      Reuse
                    </Button>
                    {latestImage.downloadUrl ? (
                      <Button asChild variant="outline">
                        <a href={latestImage.downloadUrl} target="_blank" rel="noreferrer">
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Generated images will appear here with a preview and signed download link.
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">Gallery</h2>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Search</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={filters.search}
                      onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                      placeholder="Search titles, prompts, tags, or providers"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Style</label>
                  <select
                    className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                    value={filters.stylePreset}
                    onChange={(event) => setFilters((current) => ({ ...current, stylePreset: event.target.value as GalleryFilters["stylePreset"] }))}
                  >
                    <option value="all">All styles</option>
                    {IMAGE_STYLE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aspect</label>
                  <select
                    className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                    value={filters.aspectRatio}
                    onChange={(event) => setFilters((current) => ({ ...current, aspectRatio: event.target.value as GalleryFilters["aspectRatio"] }))}
                  >
                    <option value="all">All ratios</option>
                    {IMAGE_ASPECT_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visibility</label>
                  <select
                    className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                    value={filters.visibility}
                    onChange={(event) => setFilters((current) => ({ ...current, visibility: event.target.value as GalleryFilters["visibility"] }))}
                  >
                    <option value="all">All visibility</option>
                    <option value="private">Private</option>
                    <option value="team">Team</option>
                    <option value="public">Public</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {selectedAsset ? (
                  <div className="rounded-md border border-border p-3">
                    <div className="overflow-hidden rounded-sm border border-border bg-black/10">
                      <img src={selectedAsset.thumbnail} alt={selectedAsset.title} className="h-auto w-full object-cover" />
                    </div>
                    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium">{selectedAsset.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedAsset.stylePreset.replace(/_/g, " ")} · {selectedAsset.aspectRatio} · {selectedAsset.provider}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => handleReuseAsset(selectedAsset)}>
                          <Copy className="h-4 w-4" />
                          Reuse
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => handleRegenerateAsset(selectedAsset)}>
                          <RefreshCcw className="h-4 w-4" />
                          Regenerate
                        </Button>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{selectedAsset.prompt}</p>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((asset) => (
                      <button
                        key={asset.assetId}
                        type="button"
                        onClick={() => setSelectedAssetId(asset.assetId)}
                        className={cn(
                          "text-left rounded-md border p-3 transition-colors",
                          selectedAsset?.assetId === asset.assetId ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
                        )}
                      >
                        <div className="overflow-hidden rounded-sm border border-border bg-black/10">
                          <img src={asset.thumbnail} alt={asset.title} className="h-36 w-full object-cover" />
                        </div>
                        <div className="mt-3 space-y-1">
                          <p className="truncate text-sm font-medium">{asset.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {asset.stylePreset.replace(/_/g, " ")} · {asset.aspectRatio}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{asset.model}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); handleReuseAsset(asset); }}>
                            <Copy className="h-4 w-4" />
                            Reuse
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); handleRegenerateAsset(asset); }}>
                            <RefreshCcw className="h-4 w-4" />
                            Regenerate
                          </Button>
                          {asset.downloadUrl ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={asset.downloadUrl} target="_blank" rel="noreferrer">
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                      {loadingHistory ? "Loading your image gallery..." : "No generated images match the current filters."}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">History</h2>
              </div>
              <div className="mt-4 space-y-3">
                {history.length > 0 ? history.map((asset) => (
                  <div key={asset.assetId} className="flex gap-3 rounded-md border border-border p-3">
                    <div className="h-16 w-16 flex-none overflow-hidden rounded-sm border border-border bg-black/10">
                      <img src={asset.thumbnail} alt={asset.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{asset.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {asset.stylePreset} · {asset.aspectRatio} · {asset.model}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => handleReuseAsset(asset)}>
                          <Copy className="h-4 w-4" />
                          Reuse
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => handleRegenerateAsset(asset)}>
                          <RefreshCcw className="h-4 w-4" />
                          Regenerate
                        </Button>
                        {asset.downloadUrl ? (
                          <Button asChild size="sm" variant="outline">
                            <a href={asset.downloadUrl} target="_blank" rel="noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                    {loadingHistory ? "Loading your image library..." : "No generated images yet."}
                  </div>
                )}
              </div>
            </GlassCard>
          </aside>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
