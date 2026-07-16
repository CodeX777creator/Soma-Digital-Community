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
  Play,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
  Target,
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
  const idea = state.idea || DEFAULT_IDEA;
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

function formatCredits(mode: OutputMode) {
  return mode === "render" ? "100 Creator Credits" : "20 Creator Credits";
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
    brandName: "Soma Digital Community",
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

  const selectedPreset = useMemo(() => getPreset(state.platform), [state.platform]);
  const draftScenes = useMemo(() => createStarterScenes(state), [state.idea, state.audience, state.platform, state.goal, state.callToAction, state.durationSeconds]);
  const activeScenes = latestVideo?.scenes?.length ? latestVideo.scenes : draftScenes;
  const generatedPrompt = useMemo(() => buildPrompt(state), [state]);
  const recommendedAction = history.length > 0 ? "Repurpose a recent video into platform variants." : "Create your first video draft from one idea.";

  const updateField = <K extends keyof VideoStudioFormState>(key: K, value: VideoStudioFormState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
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
    updateField("idea", `${state.idea || DEFAULT_IDEA}\n\nDirection: ${additions[action]}`);
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
    updateField("idea", `${state.idea || DEFAULT_IDEA}\n\nScene direction: ${additions[action]}`);
    setOutputTab("scenes");
    setMobileStep("script");
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
          scenes: draftScenes,
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
                      <p className="text-2xl font-semibold">{formatCredits(state.outputMode)}</p>
                      <p className="text-sm leading-6 text-[#BFC6D4]">
                        {state.outputMode === "render"
                          ? "Full video render. Use this when you are ready to create the final asset."
                          : "Video draft. Use this for script, scenes, captions, and thumbnail direction."}
                      </p>
                      <div className="grid gap-2">
                        <button
                          type="button"
                          onClick={() => updateField("outputMode", "draft")}
                          className={cn(
                            "rounded-[14px] border px-3 py-2 text-left text-sm transition",
                            state.outputMode === "draft" ? "border-[#4F9DFF]/70 bg-[#2563EB]/20 text-white" : "border-white/[0.08] bg-black/10 text-[#BFC6D4]"
                          )}
                        >
                          Create video draft
                        </button>
                        <button
                          type="button"
                          onClick={() => updateField("outputMode", "render")}
                          className={cn(
                            "rounded-[14px] border px-3 py-2 text-left text-sm transition",
                            state.outputMode === "render" ? "border-[#8B5CF6]/70 bg-[#8B5CF6]/20 text-white" : "border-white/[0.08] bg-black/10 text-[#BFC6D4]"
                          )}
                        >
                          Render full video
                        </button>
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
                        <Input value={state.brandName} onChange={(event) => updateField("brandName", event.target.value)} placeholder="Brand name" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        <Input value={state.templateName} onChange={(event) => updateField("templateName", event.target.value)} placeholder="Campaign or template name" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        <Input value={state.brandColors} onChange={(event) => updateField("brandColors", event.target.value)} placeholder="Brand colors, separated by commas" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        <Input value={state.brandFonts} onChange={(event) => updateField("brandFonts", event.target.value)} placeholder="Brand fonts" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
                        <Input value={state.brandLogoUrl} onChange={(event) => updateField("brandLogoUrl", event.target.value)} placeholder="Logo URL" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white md:col-span-2" />
                        <Textarea value={state.brandVoice} onChange={(event) => updateField("brandVoice", event.target.value)} rows={3} placeholder="Brand voice, tone, and style notes" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white md:col-span-2" />
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
                          placeholder="Duration"
                          className="rounded-[14px] border-white/[0.08] bg-black/20 text-white"
                        />
                        <Input value={state.voiceoverTone} onChange={(event) => updateField("voiceoverTone", event.target.value)} placeholder="Voiceover tone" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white" />
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
                        <Textarea value={state.anythingToAvoid} onChange={(event) => updateField("anythingToAvoid", event.target.value)} rows={3} placeholder="Anything to avoid?" className="rounded-[14px] border-white/[0.08] bg-black/20 text-white md:col-span-2" />
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
                    <StatusRow label="Estimated use" value={formatCredits(state.outputMode)} />
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
                  <h2 className="mt-2 text-2xl font-semibold">{latestVideo ? latestVideo.title : "Your video draft will appear here"}</h2>
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
                  <ScriptPanel video={latestVideo} prompt={generatedPrompt} onCopy={copyText} onAction={applyScriptAction} />
                ) : null}
                {outputTab === "scenes" ? (
                  <ScenesPanel scenes={activeScenes} onAction={applySceneAction} />
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
  onCopy,
  onAction,
}: {
  video: VideoGenerationResult | null;
  prompt: string;
  onCopy: (value: string, label: string) => void;
  onAction: (action: "hook" | "simple" | "premium" | "cta" | "shorten") => void;
}) {
  const script = video?.script || prompt;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#BFC6D4]">Script and voiceover direction</p>
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
      <div className="rounded-[18px] border border-white/[0.08] bg-black/20 p-5 text-sm leading-7 text-[#E5E7EB] whitespace-pre-wrap">
        {script}
      </div>
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
  onAction,
}: {
  scenes: VideoScene[];
  onAction: (action: "add" | "visuals" | "cinematic" | "product") => void;
}) {
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
          <div key={`${scene.sceneNumber}-${index}`} className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">{sceneLabel(index)}</p>
              <span className="rounded-full bg-white/[0.06] px-2 py-1 text-xs text-[#BFC6D4]">{scene.durationSeconds}s</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-white">{scene.onScreenText}</p>
            <p className="mt-3 text-xs leading-5 text-[#BFC6D4]">{scene.visualDescription}</p>
            <p className="mt-3 border-t border-white/[0.08] pt-3 text-xs leading-5 text-[#BFC6D4]">{scene.narration}</p>
          </div>
        ))}
      </div>
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
