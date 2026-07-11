"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Download, Filter, History, ImageIcon, Loader2, RefreshCcw, Search, Sparkles, Wand2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
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
        <div className="space-y-8">
          <form
            onSubmit={handleGenerate}
            className="relative overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151A2E]/80 p-5 shadow-2xl shadow-black/30 backdrop-blur md:p-8"
          >
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(91,95,255,.34),transparent_34%),radial-gradient(circle_at_top_right,rgba(79,157,255,.22),transparent_38%)]" />
            <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
              <section className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-3xl">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-medium text-[#BFC6D4]">
                      <ImageIcon className="h-3.5 w-3.5 text-[#4F9DFF]" />
                      Brand visuals, campaign assets, thumbnails, mockups
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">AI Image Studio</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#BFC6D4] md:text-base">
                      Create polished visuals for your brand, save every generation, and reuse high-performing prompts without starting over.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={loadHistory}
                    disabled={loadingHistory || loading}
                    className="h-11 rounded-full border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.08]"
                  >
                    {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                    Refresh
                  </Button>
                </div>

                <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-4 shadow-xl shadow-black/20">
                  <Textarea
                    value={state.prompt}
                    onChange={(event) => updateField("prompt", event.target.value)}
                    rows={6}
                    aria-label="Image generation prompt"
                    className="min-h-40 resize-none border-0 bg-transparent p-0 text-base text-white placeholder:text-[#7E8799] focus-visible:ring-0"
                    placeholder="Describe the visual you want to create..."
                  />
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <select
                      aria-label="Style preset"
                      className="h-11 rounded-xl border border-white/[0.08] bg-[#111827] px-3 text-sm text-white outline-none"
                      value={state.stylePreset}
                      onChange={(event) => updateField("stylePreset", event.target.value as ImageStylePreset)}
                    >
                      {IMAGE_STYLE_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Aspect ratio"
                      className="h-11 rounded-xl border border-white/[0.08] bg-[#111827] px-3 text-sm text-white outline-none"
                      value={state.aspectRatio}
                      onChange={(event) => updateField("aspectRatio", event.target.value as ImageAspectRatio)}
                    >
                      {IMAGE_ASPECT_RATIOS.map((ratio) => (
                        <option key={ratio} value={ratio}>
                          {ratio}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Visibility"
                      className="h-11 rounded-xl border border-white/[0.08] bg-[#111827] px-3 text-sm text-white outline-none"
                      value={state.visibility}
                      onChange={(event) => updateField("visibility", event.target.value as ImageStudioFormState["visibility"])}
                    >
                      <option value="private">Private</option>
                      <option value="team">Team</option>
                      <option value="public">Public</option>
                    </select>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.08]"
                      onClick={() => updateField("promptEdits", "Make it premium, minimal, editorial, and conversion-focused.")}
                    >
                      <Wand2 className="h-4 w-4" />
                      Improve prompt
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full border-white/[0.08] bg-white/[0.04] text-white hover:bg-white/[0.08]"
                      onClick={() => updateField("aspectRatio", "4:5")}
                    >
                      <ImageIcon className="h-4 w-4" />
                      Social format
                    </Button>
                    <Button
                      type="submit"
                      disabled={loading}
                      className="ml-auto rounded-full bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-6 text-white shadow-lg shadow-[#5B5FFF]/25 hover:opacity-95"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Generate image
                    </Button>
                  </div>
                </div>
              </section>

              <aside className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#7E8799]">Latest asset</p>
                    <h2 className="mt-1 text-lg font-medium text-white">Generation preview</h2>
                  </div>
                  <Sparkles className="h-5 w-5 text-[#8B5CF6]" />
                </div>
                {latestImage ? (
                  <div className="mt-5 space-y-4">
                    <div className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-black/20">
                      <img src={latestImage.thumbnail} alt={latestImage.title} className="aspect-square w-full object-cover" />
                    </div>
                    <div>
                      <p className="truncate text-sm font-medium text-white">{latestImage.title}</p>
                      <p className="mt-1 text-xs text-[#7E8799]">
                        {latestImage.stylePreset.replace(/_/g, " ")} / {latestImage.aspectRatio} / {latestImage.provider}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl border-white/[0.08] bg-white/[0.04] text-white"
                        onClick={() => {
                          setState(createPromptReuseStateFromLatest(latestImage));
                          toast({
                            title: "Image loaded",
                            description: "We filled the form with the latest generated image settings.",
                          });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Reuse
                      </Button>
                      {latestImage.downloadUrl ? (
                        <Button asChild variant="outline" className="rounded-xl border-white/[0.08] bg-white/[0.04] text-white">
                          <a href={latestImage.downloadUrl} target="_blank" rel="noreferrer">
                            <Download className="h-4 w-4" />
                            Download
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-[16px] border border-dashed border-white/[0.12] bg-white/[0.03] p-6 text-sm leading-6 text-[#BFC6D4]">
                    Generated images appear here with a preview, reusable settings, and a signed download link.
                  </div>
                )}
              </aside>
            </div>
          </form>

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <section className="space-y-6">
              <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur md:p-6">
                <div className="mb-5 flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-[#4F9DFF]" />
                  <h2 className="text-base font-semibold text-white">Brand controls</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input value={state.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Asset title" className="rounded-xl border-white/[0.08] bg-[#090B13]/70" />
                  <Input value={state.brandName} onChange={(event) => updateField("brandName", event.target.value)} placeholder="Brand name" className="rounded-xl border-white/[0.08] bg-[#090B13]/70" />
                  <Input value={state.brandTemplateName} onChange={(event) => updateField("brandTemplateName", event.target.value)} placeholder="Brand template name" className="rounded-xl border-white/[0.08] bg-[#090B13]/70" />
                  <Input value={state.brandLogoUrl} onChange={(event) => updateField("brandLogoUrl", event.target.value)} placeholder="Logo URL" className="rounded-xl border-white/[0.08] bg-[#090B13]/70" />
                  <Input value={state.brandColors} onChange={(event) => updateField("brandColors", event.target.value)} placeholder="#5B5FFF, #8B5CF6, #4F9DFF" className="rounded-xl border-white/[0.08] bg-[#090B13]/70" />
                  <Input value={state.brandFonts} onChange={(event) => updateField("brandFonts", event.target.value)} placeholder="Inter, Sora, Geist" className="rounded-xl border-white/[0.08] bg-[#090B13]/70" />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Textarea value={state.promptEdits} onChange={(event) => updateField("promptEdits", event.target.value)} rows={3} placeholder="Prompt refinements, composition, mood, or visual direction." className="rounded-xl border-white/[0.08] bg-[#090B13]/70" />
                  <Textarea value={state.negativePrompt} onChange={(event) => updateField("negativePrompt", event.target.value)} rows={3} placeholder="Anything to avoid." className="rounded-xl border-white/[0.08] bg-[#090B13]/70" />
                </div>
                <Textarea
                  value={state.brandTemplateNotes}
                  onChange={(event) => updateField("brandTemplateNotes", event.target.value)}
                  rows={3}
                  placeholder="Describe the visual identity, target audience, and campaign direction."
                  className="mt-4 rounded-xl border-white/[0.08] bg-[#090B13]/70"
                />
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur md:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-[#4F9DFF]" />
                      <h2 className="text-base font-semibold text-white">Image gallery</h2>
                    </div>
                    <p className="mt-1 text-sm text-[#BFC6D4]">Browse, filter, reuse, and regenerate saved image assets.</p>
                  </div>
                  <div className="relative w-full lg:w-80">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E8799]" />
                    <Input
                      value={filters.search}
                      onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                      placeholder="Search images"
                      className="rounded-xl border-white/[0.08] bg-[#090B13]/70 pl-9"
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <select
                    aria-label="Filter gallery by style"
                    className="h-11 rounded-xl border border-white/[0.08] bg-[#090B13] px-3 text-sm text-white"
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
                  <select
                    aria-label="Filter gallery by aspect ratio"
                    className="h-11 rounded-xl border border-white/[0.08] bg-[#090B13] px-3 text-sm text-white"
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
                  <select
                    aria-label="Filter gallery by visibility"
                    className="h-11 rounded-xl border border-white/[0.08] bg-[#090B13] px-3 text-sm text-white"
                    value={filters.visibility}
                    onChange={(event) => setFilters((current) => ({ ...current, visibility: event.target.value as GalleryFilters["visibility"] }))}
                  >
                    <option value="all">All visibility</option>
                    <option value="private">Private</option>
                    <option value="team">Team</option>
                    <option value="public">Public</option>
                  </select>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {filteredHistory.length > 0 ? (
                    filteredHistory.map((asset) => (
                      <div
                        key={asset.assetId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedAssetId(asset.assetId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedAssetId(asset.assetId);
                          }
                        }}
                        className={cn(
                          "group rounded-[16px] border bg-[#090B13]/70 p-3 text-left shadow-lg shadow-black/15 outline-none transition duration-200 hover:-translate-y-0.5 hover:border-[#5B5FFF]/60",
                          selectedAsset?.assetId === asset.assetId ? "border-[#5B5FFF]/70" : "border-white/[0.08]"
                        )}
                      >
                        <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-black/20">
                          <img src={asset.thumbnail} alt={asset.title} className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                        </div>
                        <div className="mt-3">
                          <p className="truncate text-sm font-medium text-white">{asset.title}</p>
                          <p className="mt-1 truncate text-xs text-[#7E8799]">
                            {asset.stylePreset.replace(/_/g, " ")} / {asset.aspectRatio}
                          </p>
                          <p className="mt-1 truncate text-xs text-[#7E8799]">{asset.model}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]" onClick={(event) => { event.stopPropagation(); handleReuseAsset(asset); }}>
                            <Copy className="h-4 w-4" />
                            Reuse
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]" onClick={(event) => { event.stopPropagation(); handleRegenerateAsset(asset); }}>
                            <RefreshCcw className="h-4 w-4" />
                          </Button>
                          {asset.downloadUrl ? (
                            <Button asChild size="sm" variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]" onClick={(event) => event.stopPropagation()}>
                              <a href={asset.downloadUrl} target="_blank" rel="noreferrer" aria-label={`Download ${asset.title}`}>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-white/[0.12] bg-white/[0.03] p-6 text-sm text-[#BFC6D4] sm:col-span-2 2xl:col-span-3">
                      {loadingHistory ? "Loading your image gallery..." : "No generated images match the current filters."}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-[#4F9DFF]" />
                  <h2 className="text-base font-semibold text-white">Selected image</h2>
                </div>
                {selectedAsset ? (
                  <div className="mt-4 space-y-4">
                    <div className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-black/20">
                      <img src={selectedAsset.thumbnail} alt={selectedAsset.title} className="w-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{selectedAsset.title}</p>
                      <p className="mt-1 text-xs text-[#7E8799]">
                        {selectedAsset.stylePreset.replace(/_/g, " ")} / {selectedAsset.aspectRatio} / {selectedAsset.provider}
                      </p>
                    </div>
                    <p className="line-clamp-4 text-sm leading-6 text-[#BFC6D4]">{selectedAsset.prompt}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" variant="outline" className="rounded-xl border-white/[0.08] bg-white/[0.04]" onClick={() => handleReuseAsset(selectedAsset)}>
                        <Copy className="h-4 w-4" />
                        Reuse
                      </Button>
                      <Button type="button" variant="outline" className="rounded-xl border-white/[0.08] bg-white/[0.04]" onClick={() => handleRegenerateAsset(selectedAsset)}>
                        <RefreshCcw className="h-4 w-4" />
                        Regenerate
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[16px] border border-dashed border-white/[0.12] bg-white/[0.03] p-6 text-sm text-[#BFC6D4]">
                    Select a saved image to review its prompt and generation settings.
                  </div>
                )}
              </div>

              <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-xl shadow-black/20 backdrop-blur">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-[#4F9DFF]" />
                  <h2 className="text-base font-semibold text-white">Recent history</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {history.length > 0 ? history.slice(0, 5).map((asset) => (
                    <button
                      key={asset.assetId}
                      type="button"
                      onClick={() => setSelectedAssetId(asset.assetId)}
                      className="flex w-full gap-3 rounded-[14px] border border-white/[0.08] bg-[#090B13]/60 p-3 text-left transition hover:border-[#5B5FFF]/60"
                    >
                      <img src={asset.thumbnail} alt={asset.title} className="h-14 w-14 flex-none rounded-xl object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{asset.title}</span>
                        <span className="mt-1 block truncate text-xs text-[#7E8799]">
                          {asset.stylePreset.replace(/_/g, " ")} / {asset.aspectRatio}
                        </span>
                      </span>
                    </button>
                  )) : (
                    <div className="rounded-[16px] border border-dashed border-white/[0.12] bg-white/[0.03] p-6 text-sm text-[#BFC6D4]">
                      {loadingHistory ? "Loading your image library..." : "No generated images yet."}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
