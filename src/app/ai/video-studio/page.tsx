"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  Download,
  Film,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  Palette,
  Play,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
  Target,
  Type,
  Upload,
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
import { estimateVideoCreatorCredits, formatCreatorCreditEstimate } from "@/lib/ai-credit-estimates";
import type {
  BrandTemplate,
  ProductRules,
  VideoAssetRecord,
  VideoGenerationResult,
  VideoScene,
} from "@/ai/studio/types";

type SocialVideoPlatform = "tiktok" | "instagram" | "youtube" | "facebook" | "linkedin" | "x";
type VideoGoal = "teach" | "promote" | "announce" | "inspire" | "sell" | "explain";
type OutputMode = "draft" | "render";
type OutputTab = "preview" | "script" | "scenes" | "captions" | "thumbnail" | "scheduler";
type MobileStep = "idea" | "audience" | "script" | "render";

type VideoStudioFormState = {
  idea: string;
  audience: string;
  platform: SocialVideoPlatform;
  goal: VideoGoal;
  outputMode: OutputMode;
  title: string;
  callToAction: string;
  brandName: string;
  brandVoice: string;
  brandColors: string;
  brandFonts: string;
  brandLogoUrl: string;
  templateName: string;
  anythingToAvoid: string;
  durationSeconds: number;
  voiceoverTone: string;
  visibility: "private" | "team" | "public";
};

type PlatformPreset = {
  id: SocialVideoPlatform;
  label: string;
  helper: string;
  aspectRatio: "9:16" | "1:1" | "16:9" | "4:5";
  durationSeconds: number;
  stylePreset: "social_reel" | "cinematic" | "documentary" | "product_demo" | "tutorial" | "talking_head";
  captionStyle: string;
  intelligence: string[];
};

const BRAND_COLOR_PALETTES = [
  { label: "Blue", value: "blue, navy, sky blue", swatches: ["#2563EB", "#0F172A", "#4F9DFF"] },
  { label: "Purple blue", value: "purple, blue, electric violet", swatches: ["#5B5FFF", "#8B5CF6", "#4F9DFF"] },
  { label: "Hazy red", value: "hazy red, soft coral, deep burgundy", swatches: ["#EF4444", "#F87171", "#7F1D1D"] },
  { label: "Green", value: "emerald green, deep forest, mint", swatches: ["#10B981", "#064E3B", "#A7F3D0"] },
  { label: "Gold black", value: "black, warm gold, champagne", swatches: ["#090B13", "#D4AF37", "#F8E7B0"] },
  { label: "Clean neutral", value: "charcoal, white, soft gray", swatches: ["#111827", "#F8FAFC", "#94A3B8"] },
];

const BRAND_FONT_OPTIONS = [
  "Modern clean sans",
  "Premium editorial",
  "Bold social headline",
  "Friendly rounded",
  "Elegant serif",
  "Tech startup",
];

const BRAND_VOICE_PRESETS = [
  "Premium, direct, and helpful. Avoid hype.",
  "Warm coach. Encouraging, simple, and practical.",
  "Bold promotional. Energetic, clear, and action-focused.",
  "Calm teacher. Patient, structured, and beginner-friendly.",
  "Founder-led. Human, honest, and confident.",
  "Luxury brand. Minimal, polished, and refined.",
];

const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: "tiktok",
    label: "TikTok",
    helper: "Fast vertical clips with a sharp opening hook.",
    aspectRatio: "9:16",
    durationSeconds: 35,
    stylePreset: "social_reel",
    captionStyle: "short, punchy captions",
    intelligence: ["Vertical 9:16", "Fast opening hook", "Captions on", "15-45 seconds"],
  },
  {
    id: "instagram",
    label: "Instagram Reels",
    helper: "Polished vertical videos for discovery and trust.",
    aspectRatio: "9:16",
    durationSeconds: 40,
    stylePreset: "social_reel",
    captionStyle: "hook, value, CTA",
    intelligence: ["Vertical 9:16", "Polished visual rhythm", "Caption-first", "CTA-friendly"],
  },
  {
    id: "youtube",
    label: "YouTube Shorts",
    helper: "Short educational videos with clear structure.",
    aspectRatio: "9:16",
    durationSeconds: 45,
    stylePreset: "tutorial",
    captionStyle: "search-friendly title and description",
    intelligence: ["Vertical Shorts", "Clear title", "Thumbnail prompt", "Longer explanation"],
  },
  {
    id: "facebook",
    label: "Facebook",
    helper: "Clear business videos for community and page audiences.",
    aspectRatio: "4:5",
    durationSeconds: 45,
    stylePreset: "product_demo",
    captionStyle: "benefit-led caption",
    intelligence: ["Community-friendly", "Benefit-led", "Square/vertical safe", "Shareable CTA"],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    helper: "Professional insight videos for authority building.",
    aspectRatio: "1:1",
    durationSeconds: 60,
    stylePreset: "talking_head",
    captionStyle: "professional founder insight",
    intelligence: ["Professional tone", "Founder insight", "Text-first caption", "Authority building"],
  },
  {
    id: "x",
    label: "X",
    helper: "Short clips with a concise point and caption.",
    aspectRatio: "16:9",
    durationSeconds: 30,
    stylePreset: "documentary",
    captionStyle: "short caption and thread idea",
    intelligence: ["Short clip", "Concise caption", "Thread option", "Direct point"],
  },
];

const VIDEO_GOALS: Array<{ id: VideoGoal; label: string; helper: string }> = [
  { id: "teach", label: "Teach", helper: "Explain a useful idea clearly." },
  { id: "promote", label: "Promote", helper: "Introduce an offer or product." },
  { id: "announce", label: "Announce", helper: "Share news or a launch." },
  { id: "inspire", label: "Inspire", helper: "Motivate your audience to act." },
  { id: "sell", label: "Sell", helper: "Move viewers toward a buying decision." },
  { id: "explain", label: "Explain", helper: "Make a complex idea simple." },
];

const AUDIENCE_CHIPS = [
  "Digital entrepreneurs",
  "Small business owners",
  "Coaches and consultants",
  "Beginners",
  "Existing customers",
  "New followers",
];

const MOBILE_STEPS: Array<{ id: MobileStep; label: string }> = [
  { id: "idea", label: "Idea" },
  { id: "audience", label: "Audience" },
  { id: "script", label: "Preview" },
  { id: "render", label: "Render" },
];

const DEFAULT_IDEA = "Benefits of digital marketing for entrepreneurs";

function getPreset(platform: SocialVideoPlatform): PlatformPreset {
  return PLATFORM_PRESETS.find((item) => item.id === platform) || PLATFORM_PRESETS[0];
}

function buildPrompt(state: VideoStudioFormState): string {
  const preset = getPreset(state.platform);
  const goal = VIDEO_GOALS.find((item) => item.id === state.goal)?.label.toLowerCase() || state.goal;
  return [
    `Create a ${preset.label} video that helps ${state.audience || "digital entrepreneurs"}.`,
    `Goal: ${goal}.`,
    `Idea: ${state.idea || DEFAULT_IDEA}.`,
    state.callToAction ? `Call to action: ${state.callToAction}.` : "",
    `Use ${preset.captionStyle}, a strong opening hook, clear scene flow, and practical business language.`,
  ].filter(Boolean).join("\n");
}

function buildBrandTemplate(state: VideoStudioFormState): BrandTemplate | null {
  const colors = state.brandColors
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const fonts = state.brandFonts
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!state.templateName && !state.brandLogoUrl && colors.length === 0 && fonts.length === 0 && !state.brandVoice) {
    return null;
  }

  return {
    name: state.templateName || "SDC video template",
    logoUrl: state.brandLogoUrl || undefined,
    colors,
    fonts,
    notes: state.brandVoice || undefined,
  };
}

function buildProductRules(state: VideoStudioFormState): ProductRules {
  return {
    productName: state.title || state.brandName || "Soma Digital Community",
    productCategory: "business video",
    productPromise: state.idea || DEFAULT_IDEA,
    targetAudience: state.audience || "Digital entrepreneurs who want practical business growth content.",
    preferredCallToAction: state.callToAction || "Follow for more practical business growth ideas.",
    brandTone: state.brandVoice || "Premium, direct, helpful, and calm.",
  };
}

function createStarterScenes(state: VideoStudioFormState): VideoScene[] {
  const duration = Math.max(18, Math.min(90, state.durationSeconds || getPreset(state.platform).durationSeconds));
  const slice = Math.max(5, Math.round(duration / 4));
  const idea = (state.idea || DEFAULT_IDEA).split("\n")[0].trim();
  return [
    {
      sceneNumber: 1,
      durationSeconds: slice,
      visualDescription: "Creator opens with a confident direct-to-camera hook and premium branded captions.",
      narration: `Most entrepreneurs underestimate this: ${idea}.`,
      onScreenText: "The mistake most entrepreneurs make",
    },
    {
      sceneNumber: 2,
      durationSeconds: slice,
      visualDescription: "Show simple visuals of the problem, audience frustration, and missed opportunity.",
      narration: "The problem is not lack of effort. It is usually lack of a clear system.",
      onScreenText: "Effort without a system is expensive",
    },
    {
      sceneNumber: 3,
      durationSeconds: slice,
      visualDescription: "Show solution steps, dashboard-style visuals, and calm motion graphics.",
      narration: "A better approach is to create, publish, learn, and measure from one operating system.",
      onScreenText: "Create. Publish. Learn. Measure.",
    },
    {
      sceneNumber: 4,
      durationSeconds: Math.max(5, duration - slice * 3),
      visualDescription: "End with a clear CTA, branded closing frame, and platform-ready caption moment.",
      narration: state.callToAction || "Follow for more practical business growth ideas.",
      onScreenText: "Build smarter with Soma",
    },
  ];
}

function sceneLabel(index: number) {
  return ["Hook", "Problem", "Solution", "CTA"][index] || `Scene ${index + 1}`;
}

function formatCredits(mode: OutputMode, durationSeconds?: number) {
  return formatCreatorCreditEstimate(estimateVideoCreatorCredits({ mode, durationSeconds }));
}

function formatCreditExplanation(mode: OutputMode, durationSeconds: number) {
  if (mode === "draft") return "Draft includes script, scenes, captions, thumbnail direction, and scheduler plan.";
  return `${durationSeconds}s × 10 credits/sec. Drafting and scheduling existing assets cost less than rendering.`;
}

function platformScheduleUrl(platform: SocialVideoPlatform) {
  return `/social/calendar?${new URLSearchParams({
    mode: "scheduler",
    platform,
    source: "video-studio",
  }).toString()}`;
}

export default function VideoStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<VideoStudioFormState>({
    idea: DEFAULT_IDEA,
    audience: "",
    platform: "tiktok",
    goal: "teach",
    outputMode: "draft",
    title: "",
    callToAction: "",
    brandName: "",
    brandVoice: "",
    brandColors: "",
    brandFonts: "",
    brandLogoUrl: "",
    templateName: "",
    anythingToAvoid: "",
    durationSeconds: 35,
    voiceoverTone: "Confident, clear, and practical",
    visibility: "private",
  });
  const [latestVideo, setLatestVideo] = useState<VideoGenerationResult | null>(null);
  const [history, setHistory] = useState<VideoAssetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [advancedBrandOpen, setAdvancedBrandOpen] = useState(false);
  const [advancedProductionOpen, setAdvancedProductionOpen] = useState(false);
  const [outputTab, setOutputTab] = useState<OutputTab>("preview");
  const [mobileStep, setMobileStep] = useState<MobileStep>("idea");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoFileName, setLogoFileName] = useState("");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [editableScript, setEditableScript] = useState("");
  const [editableScenes, setEditableScenes] = useState<VideoScene[] | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);

  const selectedPreset = useMemo(() => getPreset(state.platform), [state.platform]);
  const draftScenes = useMemo(() => createStarterScenes(state), [state.idea, state.audience, state.platform, state.goal, state.callToAction, state.durationSeconds]);
  const activeScenes = editableScenes?.length ? editableScenes : latestVideo?.scenes?.length ? latestVideo.scenes : draftScenes;
  const generatedPrompt = useMemo(() => {
    const base = buildPrompt(state);
    return draftInstructions ? `${base}\n\nAdditional draft directions:\n${draftInstructions}` : base;
  }, [state, draftInstructions]);
  const recommendedAction = history.length > 0 ? "Repurpose a recent video into platform variants." : "Create your first video draft from one idea.";

  const updateField = <K extends keyof VideoStudioFormState>(key: K, value: VideoStudioFormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const handleLogoFile = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Unsupported logo file", description: "Please upload a PNG, JPG, or SVG image.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Logo is too large", description: "Use a logo smaller than 2MB.", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(file);
    setLogoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    setLogoFileName(file.name);
    updateField("brandLogoUrl", file.name);
  };

  const selectPlatform = (platform: SocialVideoPlatform) => {
    const preset = getPreset(platform);
    setState((current) => ({
      ...current,
      platform,
      durationSeconds: preset.durationSeconds,
      voiceoverTone: platform === "linkedin" ? "Professional, concise, and authoritative" : platform === "youtube" ? "Clear, educational, and energetic" : "Confident, clear, and practical",
    }));
  };

  const applyIdeaAction = (action: "ideas" | "post" | "repurpose") => {
    const platform = getPreset(state.platform).label;
    if (action === "ideas") {
      updateField("idea", `Give me 5 ${platform} video ideas for ${state.audience || "digital entrepreneurs"} about ${state.idea || "business growth"}. Then turn the strongest idea into a video draft.`);
      return;
    }
    if (action === "post") {
      updateField("idea", `Turn this written post or lesson into a ${platform} video with a strong hook, simple scenes, captions, and a clear CTA:\n\n${state.idea || DEFAULT_IDEA}`);
      return;
    }
    updateField("idea", `Repurpose one of my recent ideas into a fresh ${platform} video for ${state.audience || "entrepreneurs"}. Keep it practical, premium, and easy to understand.`);
  };

  const applyScriptAction = (action: "hook" | "simple" | "premium" | "cta" | "shorten") => {
    const additions = {
      hook: "Add a stronger first 3-second hook that creates curiosity without clickbait.",
      simple: "Make the script simpler for a beginner audience.",
      premium: "Make the language more premium, calm, and professional.",
      cta: "Add a clear call to action that feels natural.",
      shorten: "Shorten this for a fast vertical social video.",
    } satisfies Record<string, string>;
    setDraftInstructions((current) => [current, `Script direction: ${additions[action]}`].filter(Boolean).join("\n"));
    setOutputTab("script");
    setMobileStep("script");
  };

  const applySceneAction = (action: "add" | "visuals" | "cinematic" | "product") => {
    const additions = {
      add: "Add one extra scene that makes the lesson easier to understand.",
      visuals: "Improve the visual direction with clearer examples and less generic footage.",
      cinematic: "Make the scene direction more cinematic while staying professional.",
      product: "Make the scene flow more product-focused and conversion-focused.",
    } satisfies Record<string, string>;
    setDraftInstructions((current) => [current, `Scene direction: ${additions[action]}`].filter(Boolean).join("\n"));
    setOutputTab("scenes");
    setMobileStep("script");
  };

  const updateScene = (index: number, updates: Partial<VideoScene>) => {
    const source = activeScenes.length ? activeScenes : draftScenes;
    setEditableScenes(source.map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, ...updates } : scene)));
  };

  const loadHistory = async () => {
    if (!user) return;
    try {
      setLoadingHistory(true);
      const token = await user.getIdToken();
      const response = await fetch("/api/ai/video-studio?limit=12", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const parsed = await parseApiError(response);
        throw parsed;
      }
      const data = await response.json() as { assets?: VideoAssetRecord[] };
      setHistory(Array.isArray(data.assets) ? data.assets : []);
    } catch (error) {
      showErrorToast(toast, error, { title: "Video history unavailable" });
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    };
  }, [logoPreviewUrl]);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || loading) return;

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const response = await fetch("/api/ai/video-studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: generatedPrompt,
          promptEdits: state.outputMode === "render"
            ? "Render this as a production-ready video with matching visuals, voiceover, captions, and platform pacing."
            : "Create a polished video draft with script, scenes, captions, thumbnail prompt, and render-ready direction.",
          negativePrompt: state.anythingToAvoid || undefined,
          scenes: editableScenes?.length ? editableScenes : draftScenes,
          stylePreset: selectedPreset.stylePreset,
          aspectRatio: selectedPreset.aspectRatio,
          durationSeconds: state.durationSeconds,
          captionsEnabled: true,
          voiceoverTone: state.voiceoverTone,
          brandTemplate: buildBrandTemplate(state),
          productRules: buildProductRules(state),
          brandName: state.brandName || undefined,
          title: state.title || undefined,
          visibility: state.visibility,
          generationMode: state.outputMode,
          tags: [state.platform, state.goal, state.outputMode],
        }),
      });

      if (!response.ok) {
        const parsed = await parseApiError(response);
        throw parsed;
      }

      const data = await response.json() as { video: VideoGenerationResult };
      setLatestVideo(data.video);
      setEditableScript(data.video.script || generatedPrompt);
      setEditableScenes(data.video.scenes?.length ? data.video.scenes : draftScenes);
      setSelectedSceneIndex(0);
      setOutputTab("preview");
      await loadHistory();
      toast({
        title: state.outputMode === "render" ? "Video render started" : "Video draft created",
        description: state.outputMode === "render"
          ? "Soma prepared the render package and will show the playable result when available."
          : "Soma created your script, scene plan, captions, and thumbnail direction.",
      });
    } catch (error) {
      showErrorToast(toast, error, { title: "Video generation failed" });
    } finally {
      setLoading(false);
    }
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
          <section className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,rgba(91,95,255,0.24),transparent_36%),linear-gradient(135deg,rgba(21,26,46,0.96),rgba(9,11,19,0.98))] p-5 shadow-2xl shadow-black/35 md:p-8">
            <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-1 text-xs font-medium text-[#BFC6D4]">
                  <Film className="h-3.5 w-3.5 text-[#4F9DFF]" />
                  Create platform-ready videos from one idea
                </div>
                <div className="max-w-3xl space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">AI Video Studio</h1>
                  <p className="text-base leading-7 text-[#BFC6D4] md:text-lg">
                    Tell Soma what you want to say, who it is for, and where it will be posted. Soma turns it into a script, scene plan, captions, thumbnail direction, and a render-ready video package.
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-2 md:hidden">
                  {MOBILE_STEPS.map((step) => (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setMobileStep(step.id)}
                      className={cn(
                        "rounded-full border px-3 py-2 text-xs font-medium transition",
                        mobileStep === step.id
                          ? "border-[#4F9DFF]/70 bg-[#2563EB]/20 text-white"
                          : "border-white/[0.08] bg-white/[0.04] text-[#BFC6D4]"
                      )}
                    >
                      {step.label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleGenerate} className="rounded-[18px] border border-white/[0.08] bg-[#0D1222]/80 p-4 shadow-xl shadow-black/25 md:p-5">
                  <div className={cn("grid gap-4 lg:grid-cols-[1fr_260px]", mobileStep !== "idea" && "hidden md:grid")}>
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-white">What video should Soma create today?</label>
                      <Textarea
                        value={state.idea}
                        onChange={(event) => updateField("idea", event.target.value)}
                        rows={5}
                        placeholder="Example: Create a short video explaining why digital marketing matters for small business owners."
                        className="min-h-[150px] rounded-[16px] border-white/[0.08] bg-black/20 text-base text-white placeholder:text-[#7E8799]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <ContextButton onClick={() => applyIdeaAction("ideas")}>Generate video ideas</ContextButton>
                        <ContextButton onClick={() => applyIdeaAction("post")}>Turn my post into a video</ContextButton>
                        <ContextButton onClick={() => applyIdeaAction("repurpose")}>Repurpose recent content</ContextButton>
                      </div>
                    </div>
                    <div className="space-y-3 rounded-[16px] border border-white/[0.08] bg-white/[0.04] p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Target className="h-4 w-4 text-[#4F9DFF]" />
                        Draft cost
                      </div>
                      <p className="text-2xl font-semibold">{formatCredits(state.outputMode, state.durationSeconds)}</p>
                      <p className="text-sm leading-6 text-[#BFC6D4]">
                        {formatCreditExplanation(state.outputMode, state.durationSeconds)}
                      </p>
                      <ModelAccessNotice />
              <div className="grid gap-2">
                <button
                          type="button"
                          onClick={() => updateField("outputMode", "draft")}
                          className={cn(
                            "rounded-[14px] border px-3 py-2 text-left text-sm transition",
                            state.outputMode === "draft" ? "border-[#4F9DFF]/70 bg-[#2563EB]/20 text-white" : "border-white/[0.08] bg-black/10 text-[#BFC6D4]"
                          )}
                        >
                  Create draft - planning only
                </button>
                        <button
                          type="button"
                          onClick={() => updateField("outputMode", "render")}
                          className={cn(
                            "rounded-[14px] border px-3 py-2 text-left text-sm transition",
                            state.outputMode === "render" ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-black/10 text-[#BFC6D4]"
                          )}
                        >
                  Render full video - final file
                </button>
              </div>
              <div className="rounded-[14px] border border-white/[0.08] bg-black/20 p-3 text-xs leading-5 text-[#BFC6D4]">
                Draft creates an editable script, scenes, captions, thumbnail direction, and scheduler plan. Full video submits an actual render for a playable video file.
              </div>
                    </div>
                  </div>

                  <div className={cn("mt-5 grid gap-5 xl:grid-cols-2", mobileStep !== "audience" && "hidden md:grid")}>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Where will you post it?</p>
                        <p className="text-xs text-[#7E8799]">{selectedPreset.aspectRatio} · {selectedPreset.durationSeconds}s suggested</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {PLATFORM_PRESETS.map((platform) => (
                          <button
                            key={platform.id}
                            type="button"
                            onClick={() => selectPlatform(platform.id)}
                            className={cn(
                              "rounded-[15px] border p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.07]",
                              state.platform === platform.id
                                ? "border-[#4F9DFF]/70 bg-[#2563EB]/20 shadow-lg shadow-[#2563EB]/10"
                                : "border-white/[0.08] bg-white/[0.035]"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{platform.label}</span>
                              {state.platform === platform.id ? <Check className="h-4 w-4 text-[#4F9DFF]" /> : null}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[#BFC6D4]">{platform.helper}</p>
                          </button>
                        ))}
                      </div>
                      <div className="rounded-[16px] border border-[#4F9DFF]/20 bg-[#4F9DFF]/10 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9CCBFF]">Soma auto-configures</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedPreset.intelligence.map((item) => (
                            <span key={item} className="rounded-full bg-black/20 px-2.5 py-1 text-xs text-[#DCEBFF]">{item}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-medium">What should this video do?</p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {VIDEO_GOALS.map((goal) => (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() => updateField("goal", goal.id)}
                            className={cn(
                              "rounded-[15px] border p-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.07]",
                              state.goal === goal.id
                                ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/20 shadow-lg shadow-[#8B5CF6]/10"
                                : "border-white/[0.08] bg-white/[0.035]"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{goal.label}</span>
                              {state.goal === goal.id ? <Check className="h-4 w-4 text-[#8B5CF6]" /> : null}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[#BFC6D4]">{goal.helper}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={cn("mt-5 grid gap-4 md:grid-cols-[1fr_280px]", mobileStep !== "audience" && "hidden md:grid")}>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-white">Who is this video for?</label>
                      <Textarea
                        value={state.audience}
                        onChange={(event) => updateField("audience", event.target.value)}
                        rows={3}
                        placeholder="Example: Beginner entrepreneurs who want to attract customers online."
                        className="rounded-[16px] border-white/[0.08] bg-black/20 text-white placeholder:text-[#7E8799]"
                      />
                      <div className="flex flex-wrap gap-2 pt-1">
                        {AUDIENCE_CHIPS.map((audience) => (
                          <button
                            key={audience}
                            type="button"
                            onClick={() => updateField("audience", audience)}
                            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-[#BFC6D4] transition hover:border-[#4F9DFF]/50 hover:text-white"
                          >
                            {audience}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">What should viewers do next?</label>
                        <Input
                          value={state.callToAction}
                          onChange={(event) => updateField("callToAction", event.target.value)}
                          placeholder="Follow, book a call, buy, subscribe..."
                          className="rounded-[14px] border-white/[0.08] bg-black/20 text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white">Video title</label>
                        <Input
                          value={state.title}
                          onChange={(event) => updateField("title", event.target.value)}
                          placeholder="Optional title"
                          className="rounded-[14px] border-white/[0.08] bg-black/20 text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className={cn("mt-5 grid gap-3 md:grid-cols-2", mobileStep !== "render" && "hidden md:grid")}>
                    <AdvancedPanel
                      title="Advanced brand"
                      description="Optional brand details for a more consistent video."
                      open={advancedBrandOpen}
                      onToggle={() => setAdvancedBrandOpen((value) => !value)}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Your brand or business name</label>
                          <Input value={state.brandName} onChange={(event) => updateField("brandName", event.target.value)} placeholder="Example: Soma Digital Community" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Campaign or template name</label>
                          <Input value={state.templateName} onChange={(event) => updateField("templateName", event.target.value)} placeholder="Example: Founder launch, course promo" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        </div>
                        <div className="space-y-3 md:col-span-2">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">
                            <Palette className="h-3.5 w-3.5 text-[#4F9DFF]" />
                            Brand colours
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {BRAND_COLOR_PALETTES.map((palette) => (
                              <button
                                key={palette.label}
                                type="button"
                                onClick={() => updateField("brandColors", palette.value)}
                                className={cn(
                                  "rounded-[14px] border p-3 text-left transition hover:bg-white/[0.07]",
                                  state.brandColors === palette.value ? "border-[#4F9DFF]/70 bg-[#2563EB]/20" : "border-white/[0.08] bg-black/20",
                                )}
                              >
                                <span className="text-sm font-medium text-white">{palette.label}</span>
                                <span className="mt-2 flex gap-1">
                                  {palette.swatches.map((color) => (
                                    <span key={color} className="h-4 w-4 rounded-full border border-white/20" style={{ backgroundColor: color }} />
                                  ))}
                                </span>
                              </button>
                            ))}
                          </div>
                          <Input value={state.brandColors} onChange={(event) => updateField("brandColors", event.target.value)} placeholder="Or type your own colours, e.g. blue, gold, white" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">
                            <Type className="h-3.5 w-3.5 text-[#8B5CF6]" />
                            Brand font style
                          </label>
                          <select
                            value={state.brandFonts}
                            onChange={(event) => updateField("brandFonts", event.target.value)}
                            className="h-10 w-full rounded-[14px] border border-white/[0.08] bg-black/20 px-3 text-sm text-white"
                          >
                            <option value="">Choose a font style</option>
                            {BRAND_FONT_OPTIONS.map((font) => (
                              <option key={font} value={font}>
                                {font}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Logo</label>
                          <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 text-sm text-[#BFC6D4] transition hover:bg-white/[0.07] hover:text-white">
                            <Upload className="h-4 w-4" />
                            Upload logo
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              className="sr-only"
                              onChange={(event) => handleLogoFile(event.target.files?.[0])}
                            />
                          </label>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Logo URL or uploaded logo</label>
                          <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                            <Input value={state.brandLogoUrl} onChange={(event) => updateField("brandLogoUrl", event.target.value)} placeholder="Paste logo URL, or upload a file above" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                            <div className="flex min-h-10 items-center justify-center rounded-[14px] border border-white/[0.08] bg-black/20 p-2 text-xs text-[#8E98AA]">
                              {logoPreviewUrl ? <img src={logoPreviewUrl} alt="Uploaded logo preview" className="max-h-10 max-w-full object-contain" /> : logoFileName || "No logo"}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 md:col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Brand voice</label>
                          <div className="flex flex-wrap gap-2">
                            {BRAND_VOICE_PRESETS.map((voice) => (
                              <button
                                key={voice}
                                type="button"
                                onClick={() => updateField("brandVoice", voice)}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-xs transition hover:bg-white/[0.07]",
                                  state.brandVoice === voice ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-black/20 text-[#BFC6D4]",
                                )}
                              >
                                {voice.split(".")[0]}
                              </button>
                            ))}
                          </div>
                          <Textarea value={state.brandVoice} onChange={(event) => updateField("brandVoice", event.target.value)} rows={3} placeholder="Example: Warm coach. Simple, encouraging, and practical. Avoid hype or unrealistic claims." className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        </div>
                      </div>
                    </AdvancedPanel>

                    <AdvancedPanel
                      title="Advanced production"
                      description="Optional controls for creators who want more precision."
                      open={advancedProductionOpen}
                      onToggle={() => setAdvancedProductionOpen((value) => !value)}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          type="number"
                          min={6}
                          max={180}
                          value={state.durationSeconds}
                          onChange={(event) => updateField("durationSeconds", Number(event.target.value) || selectedPreset.durationSeconds)}
                          placeholder="Duration in seconds"
                          className="rounded-[14px] border-white/[0.08] bg-black/20 text-white"
                        />
                        <select
                          value={state.voiceoverTone}
                          onChange={(event) => updateField("voiceoverTone", event.target.value)}
                          className="h-10 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 text-sm text-white"
                        >
                          <option value="Confident, clear, and practical">Confident, clear, and practical</option>
                          <option value="Warm, friendly, and encouraging">Warm, friendly, and encouraging</option>
                          <option value="Professional, concise, and authoritative">Professional, concise, and authoritative</option>
                          <option value="Energetic, direct, and promotional">Energetic, direct, and promotional</option>
                          <option value="Calm, educational, and beginner-friendly">Calm, educational, and beginner-friendly</option>
                        </select>
                        <select
                          aria-label="Video visibility"
                          value={state.visibility}
                          onChange={(event) => updateField("visibility", event.target.value as VideoStudioFormState["visibility"])}
                          className="h-10 rounded-[14px] border border-white/[0.08] bg-black/20 px-3 text-sm text-white"
                        >
                          <option value="private">Private</option>
                          <option value="team">Team</option>
                          <option value="public">Public</option>
                        </select>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Anything Soma should avoid?</label>
                          <Textarea value={state.anythingToAvoid} onChange={(event) => updateField("anythingToAvoid", event.target.value)} rows={3} placeholder="Example: avoid fake income claims, childish visuals, cluttered text, or aggressive sales language." className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        </div>
                      </div>
                    </AdvancedPanel>
                  </div>

                  <div className={cn("mt-5 flex flex-col gap-3 border-t border-white/[0.08] pt-5 md:flex-row md:items-center md:justify-between", mobileStep !== "render" && "hidden md:flex")}>
                    <div className="text-sm text-[#BFC6D4]">
                      <span className="font-medium text-white">Flow:</span> Idea <ArrowRight className="mx-1 inline h-3 w-3" /> Audience <ArrowRight className="mx-1 inline h-3 w-3" /> Platform <ArrowRight className="mx-1 inline h-3 w-3" /> Script <ArrowRight className="mx-1 inline h-3 w-3" /> Scene preview <ArrowRight className="mx-1 inline h-3 w-3" /> Render
                    </div>
                    <Button type="submit" disabled={loading || !state.idea.trim()} className="h-11 rounded-[14px] bg-gradient-to-r from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] px-6 text-white shadow-lg shadow-[#5B5FFF]/20">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {state.outputMode === "render" ? "Render full video" : "Create video draft"}
                    </Button>
                  </div>
                </form>
              </div>

              <aside className="space-y-4">
                <GlassCard className="border-white/[0.08] bg-[#111827]/85 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Creation status</p>
                    <span className="rounded-full bg-[#22C55E]/10 px-2 py-1 text-xs text-[#22C55E]">Ready</span>
                  </div>
                  <div className="mt-5 space-y-4">
                    <StatusRow label="Selected platform" value={selectedPreset.label} />
                    <StatusRow label="Estimated use" value={formatCredits(state.outputMode, state.durationSeconds)} />
                    <StatusRow label="Suggested format" value={`${selectedPreset.aspectRatio}, ${state.durationSeconds}s`} />
                    <StatusRow label="Recent videos" value={String(history.length)} />
                  </div>
                </GlassCard>

                <GlassCard className="border-white/[0.08] bg-[#111827]/85 p-5">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4 text-[#8B5CF6]" />
                    <p className="text-sm font-semibold">Soma recommends</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#BFC6D4]">{recommendedAction}</p>
                  <div className="mt-4 grid gap-2">
                    <Button type="button" variant="outline" className="justify-start rounded-[14px]" onClick={() => updateField("idea", "Create a short video from my latest business lesson with a strong hook and practical CTA.")}>
                      Generate today's video idea
                    </Button>
                    <Button type="button" variant="outline" className="justify-start rounded-[14px]" onClick={() => updateField("goal", "promote")}>
                      Build a campaign video
                    </Button>
                  </div>
                </GlassCard>

                <GlassCard className="border-white/[0.08] bg-[#111827]/85 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-[#4F9DFF]" />
                      <p className="text-sm font-semibold">Recent assets</p>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={loadHistory} disabled={loadingHistory}>
                      {loadingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    </Button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {history.slice(0, 3).map((asset) => (
                      <button
                        key={asset.assetId}
                        type="button"
                        onClick={() => {
                          setState((current) => ({ ...current, idea: asset.title || current.idea }));
                        }}
                        className="w-full rounded-[14px] border border-white/[0.08] bg-white/[0.035] p-3 text-left transition hover:bg-white/[0.07]"
                      >
                        <p className="truncate text-sm font-medium">{asset.title}</p>
                        <p className="mt-1 text-xs text-[#7E8799]">{asset.status} · {asset.aspectRatio}</p>
                      </button>
                    ))}
                    {!loadingHistory && history.length === 0 ? (
                      <div className="rounded-[14px] border border-dashed border-white/[0.1] p-4 text-sm text-[#7E8799]">
                        Your generated videos will appear here.
                      </div>
                    ) : null}
                  </div>
                </GlassCard>
              </aside>
            </div>
          </section>

          <section className={cn("grid gap-6 xl:grid-cols-[1fr_360px]", !["script", "render"].includes(mobileStep) && "hidden md:grid")}>
            <GlassCard className="border-white/[0.08] bg-[#151A2E]/70 p-5">
              <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#7E8799]">Output workspace</p>
                  <h2 className="mt-2 text-2xl font-semibold">{latestVideo ? latestVideo.title : state.outputMode === "render" ? "Your rendered video will appear here" : "Your editable video draft will appear here"}</h2>
                  <p className="mt-2 text-sm text-[#BFC6D4]">
                    {state.outputMode === "render"
                      ? "Full Video creates a playable asset. Draft mode creates editable planning pieces first."
                      : "Video Draft is editable: refine the script, select scenes, adjust captions, then schedule or render."}
                  </p>
                  {typeof latestVideo?.credits === "number" ? (
                    <p className="mt-2 text-xs font-medium text-[#BFF8D1]">
                      Charged {latestVideo.credits} credits{latestVideo.creditsRefunded ? ` · ${latestVideo.creditsRefunded} returned` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["preview", "script", "scenes", "captions", "thumbnail", "scheduler"] as OutputTab[]).map((tab) => (
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
                {outputTab === "preview" ? (
                  <PreviewPanel video={latestVideo} preset={selectedPreset} />
                ) : null}
                {outputTab === "script" ? (
                  <ScriptPanel
                    video={latestVideo}
                    prompt={generatedPrompt}
                    value={editableScript || latestVideo?.script || generatedPrompt}
                    onChange={setEditableScript}
                    onCopy={copyText}
                    onAction={applyScriptAction}
                    instructions={draftInstructions}
                  />
                ) : null}
                {outputTab === "scenes" ? (
                  <ScenesPanel
                    scenes={activeScenes}
                    selectedIndex={selectedSceneIndex}
                    onSelect={setSelectedSceneIndex}
                    onSceneChange={updateScene}
                    onAction={applySceneAction}
                  />
                ) : null}
                {outputTab === "captions" ? (
                  <CaptionsPanel video={latestVideo} onCopy={copyText} />
                ) : null}
                {outputTab === "thumbnail" ? (
                  <ThumbnailPanel video={latestVideo} />
                ) : null}
                {outputTab === "scheduler" ? (
                  <SchedulerPanel platform={state.platform} video={latestVideo} onSuggestBestTime={() => {
                    updateField("idea", `${state.idea || DEFAULT_IDEA}\n\nScheduling direction: suggest the best posting time and explain why.`);
                    setOutputTab("scheduler");
                  }} onCreateCampaign={() => {
                    updateField("idea", `${state.idea || DEFAULT_IDEA}\n\nCampaign direction: turn this into a 7-day video campaign with daily angles.`);
                    setOutputTab("scheduler");
                  }} />
                ) : null}
              </div>
            </GlassCard>

            <GlassCard className="border-white/[0.08] bg-[#151A2E]/70 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#7E8799]">Next actions</p>
              <div className="mt-4 grid gap-3">
                <Button type="button" variant="outline" className="justify-start rounded-[14px]" onClick={() => updateField("idea", `${state.idea}\nMake the hook stronger and the final CTA clearer.`)}>
                  <Wand2 className="h-4 w-4" />
                  Improve the hook
                </Button>
                <Button type="button" variant="outline" className="justify-start rounded-[14px]" onClick={() => updateField("durationSeconds", Math.min(30, state.durationSeconds))}>
                  <Film className="h-4 w-4" />
                  Shorten for vertical social
                </Button>
                <Button type="button" variant="outline" className="justify-start rounded-[14px]" onClick={() => updateField("outputMode", "render")}>
                  <Play className="h-4 w-4" />
                  Prepare full render
                </Button>
                <Button asChild variant="outline" className="justify-start rounded-[14px]">
                  <Link href={platformScheduleUrl(state.platform)}>
                    <CalendarClock className="h-4 w-4" />
                    Send to Scheduler
                  </Link>
                </Button>
                {latestVideo?.downloadUrl ? (
                  <Button asChild className="justify-start rounded-[14px] bg-gradient-to-r from-[#4F9DFF] to-[#8B5CF6] text-white">
                    <a href={latestVideo.downloadUrl} target="_blank" rel="noreferrer">
                      <Download className="h-4 w-4" />
                      Download asset
                    </a>
                  </Button>
                ) : null}
              </div>
            </GlassCard>
          </section>
        </main>
      </AppLayout>
    </ProtectedRoute>
  );
}

function AdvancedPanel({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-[#BFC6D4]">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

function ContextButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-[#BFC6D4] transition hover:border-[#4F9DFF]/50 hover:bg-[#4F9DFF]/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function PreviewPanel({ video, preset }: { video: VideoGenerationResult | null; preset: PlatformPreset }) {
  if (!video) {
    return (
      <div className="grid min-h-[340px] place-items-center rounded-[18px] border border-dashed border-white/[0.12] bg-black/20 p-8 text-center">
        <div className="max-w-md space-y-3">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#5B5FFF]/15 text-[#4F9DFF]">
            <Play className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold">Create a draft to preview your video</h3>
          <p className="text-sm leading-6 text-[#BFC6D4]">
            Soma will prepare the script, scene plan, captions, and thumbnail direction before you render or schedule.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-black/30">
        {video.downloadUrl && video.mimeType?.startsWith("video/") ? (
          <video controls className="aspect-video w-full object-cover" src={video.downloadUrl} />
        ) : video.posterFrameUrl ? (
          <div className="relative">
            <img src={video.posterFrameUrl} alt={video.title} className="aspect-video w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Poster preview</p>
              <p className="mt-1 text-lg font-semibold">{video.title}</p>
            </div>
          </div>
        ) : (
          <div className="grid aspect-video place-items-center p-8 text-center text-[#BFC6D4]">
            <div>
              <Film className="mx-auto h-10 w-10 text-[#4F9DFF]" />
              <p className="mt-3 text-sm">{video.status === "completed" ? "Video package saved" : "Render queued"}</p>
            </div>
          </div>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="Format" value={video.aspectRatio || preset.aspectRatio} />
        <MiniMetric label="Provider" value={video.provider || "Soma"} />
        <MiniMetric label="Status" value={video.status || "saved"} />
      </div>
    </div>
  );
}

function ScriptPanel({
  video,
  prompt,
  value,
  onChange,
  onCopy,
  onAction,
  instructions,
}: {
  video: VideoGenerationResult | null;
  prompt: string;
  value: string;
  onChange: (value: string) => void;
  onCopy: (value: string, label: string) => void;
  onAction: (action: "hook" | "simple" | "premium" | "cta" | "shorten") => void;
  instructions: string;
}) {
  const script = value || video?.script || prompt;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#BFC6D4]">Editable script and voiceover direction</p>
        <Button type="button" size="sm" variant="outline" onClick={() => onCopy(script, "Script")}>
          <Copy className="h-4 w-4" />
          Copy
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <ContextButton onClick={() => onAction("hook")}>Add stronger hook</ContextButton>
        <ContextButton onClick={() => onAction("simple")}>Make it simpler</ContextButton>
        <ContextButton onClick={() => onAction("premium")}>Make it more premium</ContextButton>
        <ContextButton onClick={() => onAction("cta")}>Add CTA</ContextButton>
        <ContextButton onClick={() => onAction("shorten")}>Shorten for social</ContextButton>
      </div>
      {instructions ? (
        <div className="rounded-[18px] border border-[#4F9DFF]/20 bg-[#4F9DFF]/10 p-4 text-xs leading-5 text-[#CFE3FF]">
          <p className="font-semibold uppercase tracking-[0.16em]">Pending Soma directions</p>
          <p className="mt-2 whitespace-pre-wrap">{instructions}</p>
        </div>
      ) : null}
      <Textarea
        value={script}
        onChange={(event) => onChange(event.target.value)}
        rows={14}
        className="rounded-[18px] border-white/[0.08] bg-black/20 text-sm leading-7 text-[#E5E7EB]"
        placeholder="Your editable video script will appear here."
      />
      {video?.voiceoverScript ? (
        <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5">
          <p className="text-sm font-semibold">Voiceover</p>
          <p className="mt-2 text-sm leading-7 text-[#BFC6D4] whitespace-pre-wrap">{video.voiceoverScript}</p>
        </div>
      ) : null}
    </div>
  );
}

function ScenesPanel({
  scenes,
  selectedIndex,
  onSelect,
  onSceneChange,
  onAction,
}: {
  scenes: VideoScene[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onSceneChange: (index: number, updates: Partial<VideoScene>) => void;
  onAction: (action: "add" | "visuals" | "cinematic" | "product") => void;
}) {
  const selectedScene = scenes[selectedIndex] || scenes[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <ContextButton onClick={() => onAction("add")}>Add scene</ContextButton>
        <ContextButton onClick={() => onAction("visuals")}>Improve visuals</ContextButton>
        <ContextButton onClick={() => onAction("cinematic")}>Make it cinematic</ContextButton>
        <ContextButton onClick={() => onAction("product")}>Make it product-focused</ContextButton>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {scenes.map((scene, index) => (
          <button
            key={`${scene.sceneNumber}-${index}`}
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              "rounded-[18px] border p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.06]",
              selectedIndex === index ? "border-[#4F9DFF]/70 bg-[#2563EB]/15 shadow-lg shadow-[#2563EB]/10" : "border-white/[0.08] bg-white/[0.035]",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{sceneLabel(index)}</p>
              <span className="rounded-full bg-white/[0.06] px-2 py-1 text-xs text-[#BFC6D4]">{scene.durationSeconds}s</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white">{scene.onScreenText}</p>
            <p className="mt-3 text-xs leading-5 text-[#BFC6D4]">{scene.visualDescription}</p>
            <p className="mt-3 border-t border-white/[0.08] pt-3 text-xs leading-5 text-[#BFC6D4]">{scene.narration}</p>
          </button>
        ))}
      </div>
      {selectedScene ? (
        <div className="rounded-[18px] border border-[#4F9DFF]/25 bg-[#0D1222] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4F9DFF]">Scene editor</p>
              <h3 className="mt-1 text-lg font-semibold">{sceneLabel(selectedIndex)}</h3>
            </div>
            <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-[#BFC6D4]">Selected</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_120px]">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">On-screen text</label>
              <Input
                value={selectedScene.onScreenText}
                onChange={(event) => onSceneChange(selectedIndex, { onScreenText: event.target.value })}
                className="rounded-[14px] border-white/[0.08] bg-black/20 text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Seconds</label>
              <Input
                type="number"
                min={3}
                max={60}
                value={selectedScene.durationSeconds}
                onChange={(event) => onSceneChange(selectedIndex, { durationSeconds: Number(event.target.value) || selectedScene.durationSeconds })}
                className="rounded-[14px] border-white/[0.08] bg-black/20 text-white"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Visual direction</label>
              <Textarea
                value={selectedScene.visualDescription}
                onChange={(event) => onSceneChange(selectedIndex, { visualDescription: event.target.value })}
                rows={3}
                className="rounded-[14px] border-white/[0.08] bg-black/20 text-white"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8E98AA]">Voiceover / narration</label>
              <Textarea
                value={selectedScene.narration}
                onChange={(event) => onSceneChange(selectedIndex, { narration: event.target.value })}
                rows={4}
                className="rounded-[14px] border-white/[0.08] bg-black/20 text-white"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CaptionsPanel({ video, onCopy }: { video: VideoGenerationResult | null; onCopy: (value: string, label: string) => void }) {
  const captions = video?.captions?.length ? video.captions : [
    "Use this video to teach one clear idea, then invite viewers to take the next step.",
    "Strong hook. Practical lesson. Clear CTA.",
  ];
  return (
    <div className="space-y-3">
      {captions.map((caption, index) => (
        <div key={`${caption}-${index}`} className="flex items-start justify-between gap-3 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4">
          <p className="text-sm leading-6 text-[#E5E7EB]">{caption}</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => onCopy(caption, "Caption")}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function ThumbnailPanel({ video }: { video: VideoGenerationResult | null }) {
  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-black/20">
        {video?.posterFrameUrl ? (
          <img src={video.posterFrameUrl} alt={video.title} className="aspect-video w-full object-cover" />
        ) : (
          <div className="grid aspect-video place-items-center text-[#7E8799]">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5">
        <p className="text-sm font-semibold">Thumbnail direction</p>
        <p className="mt-3 text-sm leading-7 text-[#BFC6D4]">
          {video?.thumbnailPrompt || "A premium business thumbnail with a clear face or focal point, bold readable text, high contrast, and a visual cue that communicates the video promise."}
        </p>
      </div>
    </div>
  );
}

function SchedulerPanel({
  platform,
  video,
  onSuggestBestTime,
  onCreateCampaign,
}: {
  platform: SocialVideoPlatform;
  video: VideoGenerationResult | null;
  onSuggestBestTime: () => void;
  onCreateCampaign: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#5B5FFF]/15 text-[#4F9DFF]">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Schedule this video</h3>
          <p className="text-sm leading-6 text-[#BFC6D4]">
            Send the video draft to Scheduler, choose the connected account, add final caption, and pick a publish time.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" variant="outline" className="rounded-[14px]" onClick={onSuggestBestTime}>
              Suggest best time
            </Button>
            <Button type="button" variant="outline" className="rounded-[14px]" onClick={onCreateCampaign}>
              Create 7-day video campaign
            </Button>
            <Button asChild className="rounded-[14px] bg-gradient-to-r from-[#4F9DFF] to-[#8B5CF6] text-white">
              <Link href={platformScheduleUrl(platform)}>
                <Send className="h-4 w-4" />
                Send to Scheduler
              </Link>
            </Button>
            <Button type="button" variant="outline" className="rounded-[14px]" disabled={!video}>
              <Save className="h-4 w-4" />
              Save draft
            </Button>
          </div>
        </div>
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
