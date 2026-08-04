"use client";

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  Download,
  Film,
  Filter,
  ImageIcon,
  Layers,
  Loader2,
  Palette,
  RefreshCcw,
  Save,
  Search,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { parseApiError } from "@/lib/clientApi";
import { showErrorToast } from "@/lib/error-toast";
import { cn } from "@/lib/utils";
import { ModelAccessNotice } from "@/components/ai/ModelAccessNotice";
import { estimateImageCreatorCredits, formatCreatorCreditEstimate } from "@/lib/ai-credit-estimates";
import type {
  BrandTemplate,
  ImageAspectRatio,
  ImageAssetRecord,
  ImageGenerationResult,
  ImageStylePreset,
} from "@/ai/studio/types";
import { IMAGE_ASPECT_RATIOS, IMAGE_STYLE_PRESETS } from "@/ai/studio/types";

type VisualType =
  | "social_post"
  | "story_reel"
  | "youtube_thumbnail"
  | "course_cover"
  | "product_mockup"
  | "ad_creative"
  | "marketplace_image"
  | "brand_graphic"
  | "website_banner";

type UseCase = "instagram" | "tiktok" | "facebook" | "linkedin" | "youtube" | "website" | "marketplace" | "academy" | "email";
type BrandStyle = "saved_brand" | "premium_minimal" | "bold_promotional" | "clean_educational" | "photorealistic" | "product_3d";
type OutputTab = "preview" | "prompt" | "variations" | "brand" | "scheduler" | "download";

type ImageStudioFormState = {
  visualType: VisualType;
  useCase: UseCase;
  idea: string;
  audienceMessage: string;
  brandStyle: BrandStyle;
  title: string;
  brandName: string;
  promptEdits: string;
  negativePrompt: string;
  brandTemplateName: string;
  brandTemplateNotes: string;
  brandLogoUrl: string;
  brandColors: string;
  brandFonts: string;
  visibility: "private" | "team" | "public";
  rawStylePreset: ImageStylePreset;
  rawAspectRatio: ImageAspectRatio;
  tags: string;
};

type ImageStudioResponse = {
  image: ImageGenerationResult;
};

type ImageStudioHistoryResponse = {
  capabilities?: {
    stylePresets: readonly ImageStylePreset[];
    aspectRatios: readonly ImageAspectRatio[];
  };
  assets: ImageAssetRecord[];
};

type VisualTypePreset = {
  id: VisualType;
  label: string;
  helper: string;
  stylePreset: ImageStylePreset;
  aspectRatio: ImageAspectRatio;
  formatLabel: string;
  promptFrame: string;
};

const VISUAL_TYPE_PRESETS: VisualTypePreset[] = [
  {
    id: "social_post",
    label: "Social post",
    helper: "A polished feed visual for everyday content.",
    stylePreset: "brand_campaign",
    aspectRatio: "4:5",
    formatLabel: "Instagram portrait",
    promptFrame: "Create a premium social feed image with a clear focal point, readable headline space, and brand-ready composition.",
  },
  {
    id: "story_reel",
    label: "Story/Reel visual",
    helper: "Vertical visual for stories, reels, and short-form content.",
    stylePreset: "cinematic",
    aspectRatio: "9:16",
    formatLabel: "Story/Reel",
    promptFrame: "Create a vertical visual with strong mobile composition, clear subject, and space for captions or overlays.",
  },
  {
    id: "youtube_thumbnail",
    label: "YouTube thumbnail",
    helper: "High-contrast thumbnail with a clear promise.",
    stylePreset: "brand_campaign",
    aspectRatio: "16:9",
    formatLabel: "YouTube thumbnail",
    promptFrame: "Create a high-contrast YouTube thumbnail with bold readable text space, one clear visual idea, and strong curiosity.",
  },
  {
    id: "course_cover",
    label: "Course cover",
    helper: "Premium learning asset for Academy courses.",
    stylePreset: "editorial",
    aspectRatio: "16:9",
    formatLabel: "Course cover",
    promptFrame: "Create a premium educational course cover with calm authority, clean hierarchy, and professional learning visuals.",
  },
  {
    id: "product_mockup",
    label: "Product mockup",
    helper: "Show a digital product, offer, template, or asset.",
    stylePreset: "photorealistic",
    aspectRatio: "1:1",
    formatLabel: "Square product",
    promptFrame: "Create a realistic product mockup with a clean background, premium lighting, and the offer as the hero.",
  },
  {
    id: "ad_creative",
    label: "Ad creative",
    helper: "Conversion-focused visual for campaigns.",
    stylePreset: "brand_campaign",
    aspectRatio: "4:5",
    formatLabel: "Ad portrait",
    promptFrame: "Create a conversion-focused ad visual with a clear product promise, strong visual hook, and space for a CTA.",
  },
  {
    id: "marketplace_image",
    label: "Marketplace image",
    helper: "Clean product presentation for listings.",
    stylePreset: "minimal",
    aspectRatio: "1:1",
    formatLabel: "Marketplace square",
    promptFrame: "Create a clean marketplace listing image with product clarity, premium spacing, and trustworthy presentation.",
  },
  {
    id: "brand_graphic",
    label: "Brand graphic",
    helper: "Reusable branded visual for posts and pages.",
    stylePreset: "minimal",
    aspectRatio: "1:1",
    formatLabel: "Square brand graphic",
    promptFrame: "Create a clean brand graphic with subtle depth, premium spacing, and a polished SaaS/business feel.",
  },
  {
    id: "website_banner",
    label: "Website banner",
    helper: "Wide visual for landing pages and sections.",
    stylePreset: "editorial",
    aspectRatio: "16:9",
    formatLabel: "Website banner",
    promptFrame: "Create a wide editorial website banner with premium composition, depth, and space for headline text.",
  },
];

const USE_CASES: Array<{ id: UseCase; label: string; helper: string }> = [
  { id: "instagram", label: "Instagram", helper: "Feed, carousel, story, or reel support." },
  { id: "tiktok", label: "TikTok", helper: "Vertical visual for short-form content." },
  { id: "facebook", label: "Facebook", helper: "Page, group, and campaign visuals." },
  { id: "linkedin", label: "LinkedIn", helper: "Professional business visuals." },
  { id: "youtube", label: "YouTube", helper: "Thumbnail or channel asset." },
  { id: "website", label: "Website", helper: "Hero, banner, or section image." },
  { id: "marketplace", label: "Marketplace", helper: "Product listing or offer image." },
  { id: "academy", label: "Academy", helper: "Course, lesson, or certificate visual." },
  { id: "email", label: "Email", helper: "Newsletter or campaign graphic." },
];

const BRAND_STYLES: Array<{ id: BrandStyle; label: string; stylePreset: ImageStylePreset; helper: string }> = [
  { id: "saved_brand", label: "Use my brand style", stylePreset: "brand_campaign", helper: "Use your brand context and colors when available." },
  { id: "premium_minimal", label: "Premium and minimal", stylePreset: "minimal", helper: "Clean, spacious, high-trust visuals." },
  { id: "bold_promotional", label: "Bold and promotional", stylePreset: "brand_campaign", helper: "Campaign-ready, conversion-focused composition." },
  { id: "clean_educational", label: "Clean educational", stylePreset: "editorial", helper: "Course, tutorial, and explainer-friendly." },
  { id: "photorealistic", label: "Photorealistic", stylePreset: "photorealistic", helper: "Realistic product, workspace, or person imagery." },
  { id: "product_3d", label: "3D product style", stylePreset: "3d_render", helper: "Modern 3D product or software visual." },
];

const DEFAULT_IDEA = "A premium digital marketing certification course cover for entrepreneurs";

function getVisualPreset(visualType: VisualType): VisualTypePreset {
  return VISUAL_TYPE_PRESETS.find((preset) => preset.id === visualType) || VISUAL_TYPE_PRESETS[0];
}

function getBrandStyle(style: BrandStyle) {
  return BRAND_STYLES.find((item) => item.id === style) || BRAND_STYLES[0];
}

function buildBrandTemplate(form: ImageStudioFormState): BrandTemplate | null {
  const colors = form.brandColors.split(",").map((value) => value.trim()).filter(Boolean);
  const fonts = form.brandFonts.split(",").map((value) => value.trim()).filter(Boolean);
  const hasBrandData = form.brandTemplateName || form.brandTemplateNotes || form.brandLogoUrl || colors.length > 0 || fonts.length > 0;
  if (!hasBrandData) return null;
  return {
    name: form.brandTemplateName || undefined,
    description: form.brandTemplateNotes || undefined,
    logoUrl: form.brandLogoUrl || undefined,
    colors,
    fonts,
    notes: form.brandTemplateNotes || undefined,
  };
}

function buildPrompt(form: ImageStudioFormState): string {
  const visual = getVisualPreset(form.visualType);
  const useCase = USE_CASES.find((item) => item.id === form.useCase)?.label || form.useCase;
  const brand = getBrandStyle(form.brandStyle);
  return [
    visual.promptFrame,
    `Use case: ${useCase}.`,
    `Image idea: ${form.idea || DEFAULT_IDEA}.`,
    form.audienceMessage ? `Audience/message: ${form.audienceMessage}.` : "",
    `Brand style: ${brand.label}.`,
    form.brandName ? `Brand: ${form.brandName}.` : "",
    "Make it premium, calm, modern, business-ready, and not childish.",
  ].filter(Boolean).join("\n");
}

function buildPromptEdits(form: ImageStudioFormState): string {
  const visual = getVisualPreset(form.visualType);
  const brand = getBrandStyle(form.brandStyle);
  return [
    `Selected visual type: ${visual.label}.`,
    `Selected format: ${visual.formatLabel}.`,
    `Selected style: ${brand.label}.`,
    form.promptEdits || "",
  ].filter(Boolean).join("\n");
}

function schedulerUrl(useCase: UseCase) {
  return `/social/calendar?${new URLSearchParams({
    mode: "scheduler",
    source: "image-studio",
    platform: useCase === "instagram" || useCase === "tiktok" || useCase === "facebook" || useCase === "linkedin" || useCase === "youtube" ? useCase : "instagram",
  }).toString()}`;
}

function videoUrl() {
  return `/ai/video-studio?${new URLSearchParams({ source: "image-studio", action: "turn_image_into_video" }).toString()}`;
}

export default function ImageStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<ImageStudioFormState>({
    visualType: "social_post",
    useCase: "instagram",
    idea: DEFAULT_IDEA,
    audienceMessage: "",
    brandStyle: "premium_minimal",
    title: "",
    brandName: "",
    promptEdits: "",
    negativePrompt: "",
    brandTemplateName: "",
    brandTemplateNotes: "",
    brandLogoUrl: "",
    brandColors: "",
    brandFonts: "",
    visibility: "private",
    rawStylePreset: "brand_campaign",
    rawAspectRatio: "4:5",
    tags: "",
  });
  const [latestImage, setLatestImage] = useState<ImageGenerationResult | null>(null);
  const [history, setHistory] = useState<ImageAssetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [advancedPromptOpen, setAdvancedPromptOpen] = useState(false);
  const [advancedBrandOpen, setAdvancedBrandOpen] = useState(false);
  const [advancedOutputOpen, setAdvancedOutputOpen] = useState(false);
  const [outputTab, setOutputTab] = useState<OutputTab>("preview");
  const [galleryQuery, setGalleryQuery] = useState("");

  const visualPreset = useMemo(() => getVisualPreset(state.visualType), [state.visualType]);
  const brandStyle = useMemo(() => getBrandStyle(state.brandStyle), [state.brandStyle]);
  const stylePreset = advancedOutputOpen ? state.rawStylePreset : brandStyle.stylePreset || visualPreset.stylePreset;
  const aspectRatio = advancedOutputOpen ? state.rawAspectRatio : visualPreset.aspectRatio;
  const estimatedImageCredits = estimateImageCreatorCredits(1, brandStyle.id === "product_3d");
  const prompt = useMemo(() => buildPrompt(state), [state]);
  const promptEdits = useMemo(() => buildPromptEdits(state), [state]);
  const brandTemplate = useMemo(() => buildBrandTemplate(state), [state]);
  const filteredHistory = useMemo(() => {
    const query = galleryQuery.trim().toLowerCase();
    if (!query) return history;
    return history.filter((asset) => [
      asset.title,
      asset.prompt,
      asset.brandName,
      asset.tags?.join(" "),
      asset.stylePreset,
      asset.aspectRatio,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [galleryQuery, history]);

  const updateField = <K extends keyof ImageStudioFormState>(key: K, value: ImageStudioFormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const selectVisualType = (visualType: VisualType) => {
    const preset = getVisualPreset(visualType);
    setState((current) => ({
      ...current,
      visualType,
      rawAspectRatio: preset.aspectRatio,
      rawStylePreset: preset.stylePreset,
    }));
  };

  const selectBrandStyle = (nextStyle: BrandStyle) => {
    const style = getBrandStyle(nextStyle);
    setState((current) => ({
      ...current,
      brandStyle: nextStyle,
      rawStylePreset: style.stylePreset,
    }));
  };

  const loadHistory = async () => {
    if (!user) return;
    try {
      setLoadingHistory(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/image-studio?limit=24", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!response.ok) throw await parseApiError(response, "Image history unavailable.");
      const data = (await response.json()) as ImageStudioHistoryResponse;
      setHistory(data.assets || []);
    } catch (error) {
      showErrorToast(toast, error, { title: "Image history unavailable" });
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const applyIdeaAction = (action: "ideas" | "post" | "campaign" | "repurpose") => {
    if (action === "ideas") {
      updateField("idea", `Generate 5 premium visual ideas for ${visualPreset.label.toLowerCase()} about ${state.idea || "business growth"}, then create the strongest one.`);
      return;
    }
    if (action === "post") {
      updateField("idea", `Turn this post or lesson into a premium ${visualPreset.label.toLowerCase()}:\n\n${state.idea || DEFAULT_IDEA}`);
      return;
    }
    if (action === "campaign") {
      updateField("idea", `Create a campaign visual for this idea with a clear business promise and premium layout: ${state.idea || DEFAULT_IDEA}`);
      return;
    }
    updateField("idea", `Repurpose one of my recent assets into a fresh ${visualPreset.label.toLowerCase()} for ${state.useCase}.`);
  };

  const applyStyleAction = (action: "premium" | "minimal" | "bold" | "realistic" | "brand") => {
    const map = {
      premium: "Make the image feel more premium, calm, spacious, and high-trust.",
      minimal: "Make the composition cleaner and more minimal.",
      bold: "Make the visual bolder and more promotional while staying professional.",
      realistic: "Make the image more realistic with premium lighting and natural depth.",
      brand: "Add stronger brand polish, consistent color accents, and a refined SaaS/business feel.",
    };
    updateField("promptEdits", `${state.promptEdits ? `${state.promptEdits}\n` : ""}${map[action]}`);
  };

  const applyOutputAction = (action: "square" | "portrait" | "thumbnail" | "ad" | "marketplace") => {
    const map: Record<typeof action, { visualType: VisualType; ratio: ImageAspectRatio; edits: string }> = {
      square: { visualType: "social_post", ratio: "1:1", edits: "Create a square version suitable for a clean social post." },
      portrait: { visualType: "social_post", ratio: "4:5", edits: "Create a portrait social version optimized for feed engagement." },
      thumbnail: { visualType: "youtube_thumbnail", ratio: "16:9", edits: "Create a YouTube thumbnail version with strong contrast and readable headline space." },
      ad: { visualType: "ad_creative", ratio: "4:5", edits: "Create a conversion-focused ad version with a clear offer and CTA space." },
      marketplace: { visualType: "marketplace_image", ratio: "1:1", edits: "Create a clean marketplace product image version." },
    };
    const next = map[action];
    const preset = getVisualPreset(next.visualType);
    setState((current) => ({
      ...current,
      visualType: next.visualType,
      rawAspectRatio: next.ratio,
      rawStylePreset: preset.stylePreset,
      promptEdits: `${current.promptEdits ? `${current.promptEdits}\n` : ""}${next.edits}`,
    }));
  };

  const handleGenerate = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!user || loading) return;
    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const tags = Array.from(new Set([
        state.visualType,
        state.useCase,
        state.brandStyle,
        ...state.tags.split(",").map((item) => item.trim()).filter(Boolean),
      ]));
      const response = await fetch("/api/ai/image-studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt,
          promptEdits,
          negativePrompt: state.negativePrompt || undefined,
          stylePreset,
          aspectRatio,
          title: state.title || `${visualPreset.label}: ${state.idea.slice(0, 60)}`,
          brandName: state.brandName || undefined,
          brandTemplate: brandTemplate || undefined,
          visibility: state.visibility,
          tags,
          conversationSummary: `Image Studio visualType=${state.visualType}; useCase=${state.useCase}; brandStyle=${state.brandStyle}`,
        }),
      });
      if (!response.ok) throw await parseApiError(response, "Image generation failed.");
      const data = (await response.json()) as ImageStudioResponse;
      setLatestImage(data.image);
      setOutputTab("preview");
      await loadHistory();
      toast({
        title: "Image generated",
        description: "Your brand-ready visual is saved in Image Studio.",
      });
    } catch (error) {
      showErrorToast(toast, error, { title: "Image generation failed" });
    } finally {
      setLoading(false);
    }
  };

  const regenerateFromAsset = async (asset: ImageAssetRecord) => {
    setState((current) => ({
      ...current,
      idea: asset.prompt,
      promptEdits: asset.promptEdits || "Create a fresh variation while preserving the winning concept.",
      negativePrompt: asset.negativePrompt || current.negativePrompt,
      rawStylePreset: asset.stylePreset,
      rawAspectRatio: asset.aspectRatio,
      title: asset.title,
      brandName: asset.brandName || current.brandName,
      visibility: asset.visibility,
    }));
    await handleGenerate();
  };

  const reuseAsset = (asset: ImageAssetRecord) => {
    setState((current) => ({
      ...current,
      idea: asset.prompt,
      promptEdits: asset.promptEdits || "",
      negativePrompt: asset.negativePrompt || "",
      rawStylePreset: asset.stylePreset,
      rawAspectRatio: asset.aspectRatio,
      title: asset.title,
      brandName: asset.brandName || "",
      visibility: asset.visibility,
    }));
    toast({ title: "Asset loaded", description: "The saved visual settings are ready to reuse." });
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Copy failed", description: "Select the text and copy it manually.", variant: "destructive" });
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <main className="min-h-screen space-y-8 bg-[#090B13] px-4 py-6 text-white md:px-8">
          <form
            onSubmit={handleGenerate}
            className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(91,95,255,0.24),transparent_34%),linear-gradient(135deg,rgba(21,26,46,0.96),rgba(9,11,19,0.98))] p-5 shadow-2xl shadow-black/35 md:p-8"
          >
            <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
              <section className="space-y-6">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-xs font-medium text-[#BFC6D4]">
                    <ImageIcon className="h-3.5 w-3.5 text-[#4F9DFF]" />
                    Create brand-ready visuals for every business workflow
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">AI Image Studio</h1>
                  <p className="max-w-3xl text-base leading-7 text-[#BFC6D4]">
                    Choose the visual you need, tell Soma what it should show, and generate a polished business asset ready for social, Academy, Marketplace, campaigns, or your website.
                  </p>
                </div>

                <div className="rounded-[18px] border border-white/[0.08] bg-[#0D1222]/80 p-4 shadow-xl shadow-black/25 md:p-5">
                  <div className="grid gap-4 lg:grid-cols-[1fr_230px]">
                    <div className="space-y-3">
                      <label className="text-sm font-medium">What visual should Soma create today?</label>
                      <Textarea
                        value={state.idea}
                        onChange={(event) => updateField("idea", event.target.value)}
                        rows={5}
                        placeholder="Example: A course cover for a digital marketing certification for beginner entrepreneurs."
                        className="min-h-[150px] rounded-[16px] border-white/[0.08] bg-black/20 text-base text-white placeholder:text-[#7E8799]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <ContextButton onClick={() => applyIdeaAction("ideas")}>Generate visual ideas</ContextButton>
                        <ContextButton onClick={() => applyIdeaAction("post")}>Turn my post into an image</ContextButton>
                        <ContextButton onClick={() => applyIdeaAction("campaign")}>Create campaign visual</ContextButton>
                        <ContextButton onClick={() => applyIdeaAction("repurpose")}>Repurpose recent asset</ContextButton>
                      </div>
                    </div>
                    <div className="space-y-3 rounded-[16px] border border-white/[0.08] bg-white/[0.04] p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="h-4 w-4 text-[#4F9DFF]" />
                        Credit cost
                      </div>
                      <p className="text-2xl font-semibold">{formatCreatorCreditEstimate(estimatedImageCredits)}</p>
                      <p className="text-sm leading-6 text-[#BFC6D4]">1 image × {estimatedImageCredits} credits/image. Reusing a saved asset costs 0 credits.</p>
                      <div className="rounded-[14px] border border-[#22C55E]/20 bg-[#22C55E]/10 p-3 text-sm text-[#BFF8D1]">
                        Selected: {visualPreset.formatLabel} · {brandStyle.label}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">What are you creating?</p>
                    <p className="text-xs text-[#7E8799]">Soma handles style and format automatically.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {VISUAL_TYPE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => selectVisualType(preset.id)}
                        className={cn(
                          "rounded-[15px] border p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.07]",
                          state.visualType === preset.id
                            ? "border-[#4F9DFF]/70 bg-[#2563EB]/20 shadow-lg shadow-[#2563EB]/10"
                            : "border-white/[0.08] bg-white/[0.035]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{preset.label}</span>
                          {state.visualType === preset.id ? <Check className="h-4 w-4 text-[#4F9DFF]" /> : null}
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#BFC6D4]">{preset.helper}</p>
                        <p className="mt-2 text-xs text-[#7E8799]">{preset.formatLabel}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Where will this be used?</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {USE_CASES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => updateField("useCase", item.id)}
                          className={cn(
                            "rounded-[14px] border p-3 text-left transition hover:bg-white/[0.07]",
                            state.useCase === item.id ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-white/[0.035] text-[#BFC6D4]"
                          )}
                        >
                          <span className="text-sm font-medium">{item.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#7E8799]">{item.helper}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Brand style</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {BRAND_STYLES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectBrandStyle(item.id)}
                          className={cn(
                            "rounded-[14px] border p-3 text-left transition hover:bg-white/[0.07]",
                            state.brandStyle === item.id ? "border-[#4F9DFF]/70 bg-[#2563EB]/20 text-white" : "border-white/[0.08] bg-white/[0.035] text-[#BFC6D4]"
                          )}
                        >
                          <span className="text-sm font-medium">{item.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#7E8799]">{item.helper}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_280px]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Who is this for, and what should they understand?</label>
                    <Textarea
                      value={state.audienceMessage}
                      onChange={(event) => updateField("audienceMessage", event.target.value)}
                      rows={3}
                      placeholder="Example: Beginner entrepreneurs should understand that digital marketing helps them attract customers consistently."
                      className="rounded-[16px] border-white/[0.08] bg-black/20 text-white placeholder:text-[#7E8799]"
                    />
                  </div>
                  <div className="grid gap-3">
                    <Input value={state.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Optional asset title" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                    <Input value={state.brandName} onChange={(event) => updateField("brandName", event.target.value)} placeholder="Brand name" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <AdvancedPanel title="Advanced prompt" description="Refinements and anything to avoid." open={advancedPromptOpen} onToggle={() => setAdvancedPromptOpen((value) => !value)}>
                    <div className="grid gap-3">
                      <Textarea value={state.promptEdits} onChange={(event) => updateField("promptEdits", event.target.value)} rows={3} placeholder="Prompt refinements, composition, mood, or visual direction." className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                      <Textarea value={state.negativePrompt} onChange={(event) => updateField("negativePrompt", event.target.value)} rows={3} placeholder="Anything to avoid?" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                    </div>
                  </AdvancedPanel>
                  <AdvancedPanel title="Advanced brand" description="Template, logo, colors, fonts, visibility." open={advancedBrandOpen} onToggle={() => setAdvancedBrandOpen((value) => !value)}>
                    <div className="grid gap-3">
                      <Input value={state.brandTemplateName} onChange={(event) => updateField("brandTemplateName", event.target.value)} placeholder="Brand template name" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                      <Input value={state.brandLogoUrl} onChange={(event) => updateField("brandLogoUrl", event.target.value)} placeholder="Logo URL" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                      <Input value={state.brandColors} onChange={(event) => updateField("brandColors", event.target.value)} placeholder="Brand colors" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                      <Input value={state.brandFonts} onChange={(event) => updateField("brandFonts", event.target.value)} placeholder="Brand fonts" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                      <Textarea value={state.brandTemplateNotes} onChange={(event) => updateField("brandTemplateNotes", event.target.value)} rows={3} placeholder="Brand notes" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                      <select value={state.visibility} onChange={(event) => updateField("visibility", event.target.value as ImageStudioFormState["visibility"])} className="h-10 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 text-sm text-white">
                        <option value="private">Private</option>
                        <option value="team">Team</option>
                        <option value="public">Public</option>
                      </select>
                    </div>
                  </AdvancedPanel>
                  <AdvancedPanel title="Advanced output" description="Raw style, ratio, and tags." open={advancedOutputOpen} onToggle={() => setAdvancedOutputOpen((value) => !value)}>
                    <div className="grid gap-3">
                      <select value={state.rawStylePreset} onChange={(event) => updateField("rawStylePreset", event.target.value as ImageStylePreset)} className="h-10 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 text-sm text-white">
                        {IMAGE_STYLE_PRESETS.map((preset) => <option key={preset} value={preset}>{preset.replace(/_/g, " ")}</option>)}
                      </select>
                      <select value={state.rawAspectRatio} onChange={(event) => updateField("rawAspectRatio", event.target.value as ImageAspectRatio)} className="h-10 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 text-sm text-white">
                        {IMAGE_ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                      </select>
                      <Input value={state.tags} onChange={(event) => updateField("tags", event.target.value)} placeholder="Tags, separated by commas" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                    </div>
                  </AdvancedPanel>
                </div>

                <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-5 md:flex-row md:items-center md:justify-between">
                  <div className="text-sm text-[#BFC6D4]">
                    <span className="font-medium text-white">Flow:</span> Visual type <ArrowRight className="mx-1 inline h-3 w-3" /> Use case <ArrowRight className="mx-1 inline h-3 w-3" /> Idea <ArrowRight className="mx-1 inline h-3 w-3" /> Brand style <ArrowRight className="mx-1 inline h-3 w-3" /> Generate
                  </div>
                  <Button type="submit" disabled={loading || !state.idea.trim()} className="h-11 rounded-[14px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-6 text-white shadow-lg shadow-[#5B5FFF]/20">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generate Image
                  </Button>
                </div>
              </section>

              <aside className="space-y-4">
                <GlassCard className="border-white/[0.08] bg-[#111827]/85 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Format summary</p>
                    <span className="rounded-full bg-[#22C55E]/10 px-2 py-1 text-xs text-[#22C55E]">Ready</span>
                  </div>
                  <div className="mt-5 space-y-4">
                    <StatusRow label="Visual type" value={visualPreset.label} />
                    <StatusRow label="Use case" value={USE_CASES.find((item) => item.id === state.useCase)?.label || state.useCase} />
                    <StatusRow label="Format" value={visualPreset.formatLabel} />
                    <StatusRow label="Style" value={brandStyle.label} />
                    <StatusRow label="Estimated use" value={`${estimatedImageCredits} credits per image`} />
                    <ModelAccessNotice compact />
                  </div>
                </GlassCard>

                <GlassCard className="border-white/[0.08] bg-[#111827]/85 p-5">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-[#8B5CF6]" />
                    <p className="text-sm font-semibold">Soma suggests</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#BFC6D4]">
                    {latestImage ? "Make one social version and send it to Scheduler." : "Start with a course cover, social post, or marketplace image."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ContextButton onClick={() => applyStyleAction("premium")}>Make premium</ContextButton>
                    <ContextButton onClick={() => applyStyleAction("minimal")}>Make minimal</ContextButton>
                    <ContextButton onClick={() => applyStyleAction("bold")}>Make bold</ContextButton>
                    <ContextButton onClick={() => applyStyleAction("realistic")}>Make realistic</ContextButton>
                    <ContextButton onClick={() => applyStyleAction("brand")}>Add brand polish</ContextButton>
                  </div>
                </GlassCard>

                <GlassCard className="border-white/[0.08] bg-[#111827]/85 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-[#4F9DFF]" />
                      <p className="text-sm font-semibold">Latest image</p>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={loadHistory} disabled={loadingHistory}>
                      {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="mt-4">
                    {latestImage ? (
                      <div className="space-y-3">
                        <img src={latestImage.thumbnail} alt={latestImage.title} className="aspect-square w-full rounded-[16px] border border-white/[0.08] object-cover" />
                        <p className="truncate text-sm font-medium">{latestImage.title}</p>
                        <p className="text-xs text-[#7E8799]">{latestImage.stylePreset.replace(/_/g, " ")} · {latestImage.aspectRatio}</p>
                        {typeof latestImage.credits === "number" ? (
                          <p className="text-xs text-[#BFF8D1]">Charged {latestImage.credits} credits{latestImage.creditsRefunded ? ` · ${latestImage.creditsRefunded} returned` : ""}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-[16px] border border-dashed border-white/[0.12] p-6 text-sm text-[#7E8799]">
                        Your generated image preview will appear here.
                      </div>
                    )}
                  </div>
                </GlassCard>
              </aside>
            </div>
          </form>

          <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <GlassCard className="border-white/[0.08] bg-[#151A2E]/70 p-5">
              <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#7E8799]">Output workspace</p>
                  <h2 className="mt-2 text-2xl font-semibold">{latestImage ? latestImage.title : "Your generated visual will appear here"}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["preview", "prompt", "variations", "brand", "scheduler", "download"] as OutputTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setOutputTab(tab)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs capitalize transition",
                        outputTab === tab ? "border-[#4F9DFF]/70 bg-[#2563EB]/20 text-white" : "border-white/[0.08] bg-white/[0.035] text-[#BFC6D4]"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                {outputTab === "preview" ? <PreviewPanel image={latestImage} /> : null}
                {outputTab === "prompt" ? <PromptPanel prompt={prompt} promptEdits={promptEdits} onCopy={copyText} /> : null}
                {outputTab === "variations" ? <VariationsPanel onAction={applyOutputAction} onGenerate={() => void handleGenerate()} loading={loading} /> : null}
                {outputTab === "brand" ? <BrandPanel state={state} visualPreset={visualPreset} brandStyle={brandStyle} /> : null}
                {outputTab === "scheduler" ? <SchedulerPanel image={latestImage} useCase={state.useCase} onCreateCaption={() => updateField("promptEdits", `${state.promptEdits ? `${state.promptEdits}\n` : ""}Also create a social caption direction for this visual.`)} /> : null}
                {outputTab === "download" ? <DownloadPanel image={latestImage} /> : null}
              </div>
            </GlassCard>

            <GlassCard className="border-white/[0.08] bg-[#151A2E]/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#7E8799]">Asset library</p>
                  <p className="mt-2 text-sm text-[#BFC6D4]">Reuse, regenerate, or send saved visuals into workflows.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={loadHistory} disabled={loadingHistory}>
                  {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                </Button>
              </div>
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E8799]" />
                <Input value={galleryQuery} onChange={(event) => setGalleryQuery(event.target.value)} placeholder="Search assets" className="rounded-[14px] border-white/[0.08] bg-black/20 pl-10 text-white" />
              </div>
              <div className="mt-4 space-y-3">
                {filteredHistory.slice(0, 8).map((asset) => (
                  <div key={asset.assetId} className="rounded-[16px] border border-white/[0.08] bg-white/[0.035] p-3">
                    <div className="flex gap-3">
                      <img src={asset.thumbnail} alt={asset.title} className="h-16 w-16 rounded-[14px] object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{asset.title}</p>
                        <p className="mt-1 truncate text-xs text-[#7E8799]">{asset.stylePreset.replace(/_/g, " ")} · {asset.aspectRatio}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => reuseAsset(asset)}>Use</Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-full" onClick={() => void regenerateFromAsset(asset)}>Variation</Button>
                          {asset.downloadUrl ? (
                            <Button asChild size="sm" variant="outline" className="h-8 rounded-full">
                              <a href={asset.downloadUrl} target="_blank" rel="noreferrer">Download</a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {!loadingHistory && filteredHistory.length === 0 ? (
                  <div className="rounded-[16px] border border-dashed border-white/[0.12] p-6 text-sm text-[#7E8799]">
                    No images yet. Generate your first brand-ready visual above.
                  </div>
                ) : null}
              </div>
            </GlassCard>
          </section>
        </main>
      </AppLayout>
    </ProtectedRoute>
  );
}

function AdvancedPanel({ title, description, open, onToggle, children }: { title: string; description: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.035]">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span>
          <span className="block text-sm font-medium text-white">{title}</span>
          <span className="mt-1 block text-xs text-[#7E8799]">{description}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-[#BFC6D4] transition", open && "rotate-180")} />
      </button>
      {open ? <div className="border-t border-white/[0.08] p-4">{children}</div> : null}
    </div>
  );
}

function ContextButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-[#BFC6D4] transition hover:border-[#4F9DFF]/50 hover:bg-[#4F9DFF]/10 hover:text-white">
      {children}
    </button>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[#BFC6D4]">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

function PreviewPanel({ image }: { image: ImageGenerationResult | null }) {
  if (!image) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-[18px] border border-dashed border-white/[0.12] bg-black/20 p-8 text-center">
        <div className="max-w-md space-y-3">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#5B5FFF]/15 text-[#4F9DFF]">
            <ImageIcon className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">Generate a visual to preview it here</h3>
          <p className="text-sm leading-6 text-[#BFC6D4]">Soma will save the image, prompt, format, brand metadata, and workflow actions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-black/30">
        <img src={image.thumbnail || image.downloadUrl} alt={image.title} className="max-h-[640px] w-full object-contain" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="Style" value={image.stylePreset.replace(/_/g, " ")} />
        <MiniMetric label="Format" value={image.aspectRatio} />
        <MiniMetric label="Provider" value={image.provider || "Soma"} />
      </div>
    </div>
  );
}

function PromptPanel({ prompt, promptEdits, onCopy }: { prompt: string; promptEdits: string; onCopy: (value: string, label: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#BFC6D4]">Prompt and creative direction</p>
        <Button type="button" size="sm" variant="outline" onClick={() => onCopy(`${prompt}\n\n${promptEdits}`, "Prompt")}>
          <Copy className="h-4 w-4" />
          Copy prompt
        </Button>
      </div>
      <div className="rounded-[18px] border border-white/[0.08] bg-black/20 p-5 text-sm leading-7 text-[#E5E7EB] whitespace-pre-wrap">{prompt}</div>
      <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5 text-sm leading-7 text-[#BFC6D4] whitespace-pre-wrap">{promptEdits}</div>
    </div>
  );
}

function VariationsPanel({ onAction, onGenerate, loading }: { onAction: (action: "square" | "portrait" | "thumbnail" | "ad" | "marketplace") => void; onGenerate: () => void; loading: boolean }) {
  const actions: Array<{ id: "square" | "portrait" | "thumbnail" | "ad" | "marketplace"; label: string }> = [
    { id: "square", label: "Make square version" },
    { id: "portrait", label: "Make portrait version" },
    { id: "thumbnail", label: "Make YouTube thumbnail" },
    { id: "ad", label: "Create ad version" },
    { id: "marketplace", label: "Create marketplace version" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {actions.map((action) => (
          <button key={action.id} type="button" onClick={() => onAction(action.id)} className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4 text-left text-sm font-medium transition hover:border-[#4F9DFF]/50 hover:bg-[#4F9DFF]/10">
            {action.label}
          </button>
        ))}
      </div>
      <Button type="button" onClick={onGenerate} disabled={loading} className="rounded-[14px] bg-gradient-to-r from-[#4F9DFF] to-[#8B5CF6] text-white">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
        Generate selected variation
      </Button>
    </div>
  );
}

function BrandPanel({ state, visualPreset, brandStyle }: { state: ImageStudioFormState; visualPreset: VisualTypePreset; brandStyle: ReturnType<typeof getBrandStyle> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <MiniMetric label="Brand" value={state.brandName || "Not set"} />
      <MiniMetric label="Style" value={brandStyle.label} />
      <MiniMetric label="Visual type" value={visualPreset.label} />
      <MiniMetric label="Format" value={visualPreset.formatLabel} />
      <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4 md:col-span-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[#7E8799]">Brand notes</p>
        <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">{state.brandTemplateNotes || state.promptEdits || "No extra brand notes yet."}</p>
      </div>
    </div>
  );
}

function SchedulerPanel({ image, useCase, onCreateCaption }: { image: ImageGenerationResult | null; useCase: UseCase; onCreateCaption: () => void }) {
  return (
    <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#5B5FFF]/15 text-[#4F9DFF]">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Use this image in a workflow</h3>
          <p className="text-sm leading-6 text-[#BFC6D4]">Create a caption, schedule it as a social post, or turn the visual into a video asset.</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-[14px]" onClick={onCreateCaption}>Create caption for this</Button>
            <Button asChild className="rounded-[14px] bg-gradient-to-r from-[#4F9DFF] to-[#8B5CF6] text-white">
              <Link href={schedulerUrl(useCase)}>
                <Send className="h-4 w-4" />
                Send to Scheduler
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-[14px]">
              <Link href={videoUrl()}>
                <Film className="h-4 w-4" />
                Turn into video
              </Link>
            </Button>
            <Button type="button" variant="outline" className="rounded-[14px]" disabled={!image}>
              <Save className="h-4 w-4" />
              Save to campaign
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadPanel({ image }: { image: ImageGenerationResult | null }) {
  return (
    <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5">
      <p className="text-sm leading-6 text-[#BFC6D4]">Download the generated image or reuse it in another SDC workflow.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {image?.downloadUrl ? (
          <Button asChild className="rounded-[14px] bg-gradient-to-r from-[#4F9DFF] to-[#8B5CF6] text-white">
            <a href={image.downloadUrl} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" />
              Download image
            </a>
          </Button>
        ) : (
          <Button type="button" disabled className="rounded-[14px]">Generate an image first</Button>
        )}
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.035] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-[#7E8799]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
