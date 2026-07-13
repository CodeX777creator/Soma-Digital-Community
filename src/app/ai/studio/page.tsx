"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { authFetch } from "@/lib/clientApi";
import { cn } from "@/lib/utils";
import {
  STUDIO_CONTENT_TYPES,
  type StudioArtifactRecord,
  type StudioContentType,
  type StudioGenerationResult,
  type StudioPromptLibraryEntry,
  type StudioTone,
} from "@/ai/studio/types";
import {
  ArrowRight,
  Bot,
  ClipboardCopy,
  ImageIcon,
  History,
  Mail,
  Layers3,
  LibraryBig,
  Megaphone,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  FileText,
  Video,
  Volume2,
  Wand2,
  Workflow,
  CalendarDays,
  BarChart3,
} from "lucide-react";

type StudioOverviewResponse = {
  supportedContentTypes: readonly StudioContentType[];
  promptLibrary: StudioPromptLibraryEntry[];
  artifacts: StudioArtifactRecord[];
  content?: StudioGenerationResult | null;
};

type CreditDashboard = {
  snapshot: {
    remainingCredits: number;
    monthlyCreditsGranted: number;
    monthlyCreditsUsed: number;
    monthlyCreditsReserved: number;
    byokEnabled: boolean;
    providerMode: string;
    nextResetAt: string;
  };
};

function formatContentType(contentType: string): string {
  return contentType.replace(/_/g, " ");
}

const TONE_OPTIONS: StudioTone[] = ["professional", "casual", "encouraging", "direct", "bold", "playful", "premium"];

interface StudioComposerState {
  contentType: StudioContentType;
  businessContext: string;
  targetAudience: string;
  tone: StudioTone;
  platform: string;
  brandName: string;
  brandVoice: string;
  campaignGoal: string;
  callToAction: string;
  keywords: string;
  notes: string;
  language: string;
}

const DEFAULT_COMPOSER_STATE: StudioComposerState = {
  contentType: "script",
  businessContext: "",
  targetAudience: "",
  tone: "professional",
  platform: "",
  brandName: "",
  brandVoice: "",
  campaignGoal: "",
  callToAction: "",
  keywords: "",
  notes: "",
  language: "English",
};

function isStudioContentType(value: string | null): value is StudioContentType {
  return Boolean(value && (STUDIO_CONTENT_TYPES as readonly string[]).includes(value));
}

function getSchedulerActionPrefill(searchParams: URLSearchParams): Partial<StudioComposerState> | null {
  if (searchParams.get("source") !== "scheduler") return null;

  const action = searchParams.get("action") || "write_caption";
  const platform = searchParams.get("platform") || "";
  const caption = searchParams.get("caption") || "";
  const cta = searchParams.get("cta") || "";
  const scheduledDate = searchParams.get("scheduledDate") || "";
  const requestedContentType = searchParams.get("contentType");
  const contentType = isStudioContentType(requestedContentType) ? requestedContentType : "caption";

  const actionPrompts: Record<string, string> = {
    write_caption: "Write a polished social caption for this scheduled post.",
    shorten_caption: "Shorten this caption while keeping the main message clear and persuasive.",
    add_hook: "Create three strong opening hooks for this social post.",
    add_cta: "Add a clear call to action that fits the platform and offer.",
    generate_hashtags: "Generate relevant hashtags for this post without overloading the caption.",
    adapt_for_platform: "Adapt this post for the selected social platform using its best practices.",
    repurpose_content: "Repurpose an existing asset or idea into a platform-ready social post.",
    repurpose_asset: "Repurpose a recent content asset into a fresh social post.",
    repurpose_existing_content: "Repurpose existing content into a platform-ready social post.",
    fill_content_gap: "Create a content idea and caption to fill an empty calendar slot.",
    suggest_best_time: "Recommend the best publishing time and explain the reasoning.",
    generate_todays_content: "Generate today's most useful social content based on my scheduler briefing.",
  };

  return {
    contentType: action === "fill_content_gap" || action === "suggest_best_time" ? "marketing_planner" : contentType,
    platform,
    campaignGoal: actionPrompts[action] || actionPrompts.write_caption,
    callToAction: cta,
    businessContext: [
      actionPrompts[action] || actionPrompts.write_caption,
      platform ? `Platform: ${platform}` : "",
      requestedContentType ? `Post format: ${requestedContentType}` : "",
      scheduledDate ? `Scheduled date: ${scheduledDate}` : "",
      caption ? `Existing draft: ${caption}` : "",
    ].filter(Boolean).join("\n"),
    notes: "Imported from Scheduler. Return to the calendar after generating if you want to attach this to a scheduled post.",
  };
}

const STUDIO_TOOLS = [
  {
    title: "AI Chat",
    description: "Ask, refine, and shape ideas with a fast creative assistant.",
    href: "/mentor",
    icon: Bot,
    label: "Guidance",
  },
  {
    title: "AI Writer",
    description: "Create scripts, captions, blogs, emails, ads, and funnels.",
    href: "/ai/studio",
    icon: Wand2,
    label: "Content",
  },
  {
    title: "Image Generator",
    description: "Create branded images with styles, ratios, and saved history.",
    href: "/ai/image-studio",
    icon: ImageIcon,
    label: "Visuals",
  },
  {
    title: "Video Generator",
    description: "Build scene-based videos with scripts, captions, and timelines.",
    href: "/ai/video-studio",
    icon: Video,
    label: "Video",
  },
  {
    title: "Voice Studio",
    description: "Generate narration, brand voices, multilingual audio, and history.",
    href: "/ai/audio-studio",
    icon: Volume2,
    label: "Audio",
  },
  {
    title: "Social Media",
    description: "Create reusable content for posts, campaigns, and scheduling.",
    href: "/social",
    icon: Megaphone,
    label: "Marketing",
  },
  {
    title: "Email Generator",
    description: "Write campaigns, sequences, subject lines, and offers.",
    href: "/ai/studio",
    icon: Mail,
    label: "Email",
  },
  {
    title: "Automations",
    description: "Connect creation to publishing, calendars, and execution.",
    href: "/social/calendar",
    icon: Workflow,
    label: "Execution",
  },
];

const STUDIO_WORKFLOWS = [
  {
    title: "Launch a content campaign",
    description: "Plan the message, generate copy, create visuals, and move it into the calendar.",
    href: "/social/calendar",
    icon: CalendarDays,
    steps: ["Planner", "Copy", "Visuals", "Schedule"],
  },
  {
    title: "Build a sales asset",
    description: "Turn an offer into ad copy, emails, landing copy, and reusable prompt context.",
    href: "/ai/studio",
    icon: BarChart3,
    steps: ["Offer", "Funnel", "Email", "CTA"],
  },
  {
    title: "Create a multimedia post",
    description: "Generate a caption, image, voiceover, and video package from the same idea.",
    href: "/ai/video-studio",
    icon: Workflow,
    steps: ["Caption", "Image", "Voice", "Video"],
  },
];

export default function AIStudioPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<StudioContentType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creditDashboard, setCreditDashboard] = useState<CreditDashboard | null>(null);
  const [creditLoading, setCreditLoading] = useState(true);
  const [composer, setComposer] = useState<StudioComposerState>(DEFAULT_COMPOSER_STATE);
  const [latestGeneration, setLatestGeneration] = useState<StudioGenerationResult | null>(null);
  const [data, setData] = useState<StudioOverviewResponse>({
    supportedContentTypes: STUDIO_CONTENT_TYPES,
    promptLibrary: [],
    artifacts: [],
  });

  useEffect(() => {
    const prefill = getSchedulerActionPrefill(searchParams);
    if (!prefill) return;

    setComposer((current) => ({
      ...current,
      ...prefill,
      brandVoice: current.brandVoice,
      brandName: current.brandName,
      targetAudience: current.targetAudience,
      tone: current.tone,
      language: current.language,
    }));
  }, [searchParams]);

  const loadStudioOverview = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const response = await fetch("/api/ai/studio?limit=24", {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || "Could not load the studio library.");
    }

    return response.json() as Promise<StudioOverviewResponse>;
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const overview = await loadStudioOverview();
        if (mounted && overview) {
          setData({
            supportedContentTypes: overview.supportedContentTypes || STUDIO_CONTENT_TYPES,
            promptLibrary: overview.promptLibrary || [],
            artifacts: overview.artifacts || [],
            content: overview.content || null,
          });
        }
      } catch (error) {
        if (mounted) {
          toast({
            title: "Studio library unavailable",
            description: error instanceof Error ? error.message : "We could not load the prompt library right now.",
            variant: "destructive",
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [toast, user]);

  useEffect(() => {
    let mounted = true;

    const loadCredits = async () => {
      if (!user) {
        setCreditLoading(false);
        return;
      }

      try {
        setCreditLoading(true);
        const response = await authFetch("/api/creator-credits");
        if (!response.ok) throw new Error("Unable to load credits.");
        const payload = await response.json();
        if (mounted) setCreditDashboard(payload);
      } catch {
        if (mounted) setCreditDashboard(null);
      } finally {
        if (mounted) setCreditLoading(false);
      }
    };

    void loadCredits();
    return () => {
      mounted = false;
    };
  }, [user]);

  const creditUsage = useMemo(() => {
    const granted = creditDashboard?.snapshot.monthlyCreditsGranted || 0;
    const used = creditDashboard?.snapshot.monthlyCreditsUsed || 0;
    if (!granted) return null;
    return Math.min(100, Math.round((used / granted) * 100));
  }, [creditDashboard]);

  const filteredPrompts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.promptLibrary.filter((entry) => {
      const matchesType = typeFilter === "all" || entry.id === typeFilter;
      if (!query) return matchesType;

      const searchable = [
        entry.title,
        entry.description,
        entry.recommendedFor.join(" "),
        entry.tags.join(" "),
        entry.id,
      ].join(" ").toLowerCase();

      return matchesType && searchable.includes(query);
    });
  }, [data.promptLibrary, search, typeFilter]);

  const visibleArtifacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.artifacts.filter((artifact) => {
      if (typeFilter !== "all" && artifact.contentType !== typeFilter) return false;
      if (!query) return true;
      const searchable = [
        artifact.title,
        artifact.summary,
        artifact.generatedContent,
        artifact.promptKey,
        artifact.promptVersion,
        artifact.providerId,
        artifact.modelId,
        artifact.contentType,
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [data.artifacts, search, typeFilter]);

  const handleRefresh = async () => {
    if (!user || refreshing) return;
    try {
      setRefreshing(true);
      const overview = await loadStudioOverview();
      if (overview) {
        setData({
          supportedContentTypes: overview.supportedContentTypes || STUDIO_CONTENT_TYPES,
          promptLibrary: overview.promptLibrary || [],
          artifacts: overview.artifacts || [],
          content: overview.content || null,
        });
        if (overview.content) {
          setLatestGeneration(overview.content);
        }
      }
      toast({
        title: "Studio refreshed",
        description: "We pulled in the latest prompt packs and generated artifacts.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "The studio workspace could not be refreshed.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleComposerChange = <K extends keyof StudioComposerState>(key: K, value: StudioComposerState[K]) => {
    setComposer((current) => ({ ...current, [key]: value }));
  };

  const handleUsePack = (pack: StudioPromptLibraryEntry) => {
    setComposer((current) => ({
      ...current,
      contentType: pack.id as StudioContentType,
      campaignGoal: current.campaignGoal || pack.description,
      notes: current.notes || `Working from ${pack.title}.`,
    }));
    toast({
      title: "Pack loaded into studio",
      description: `${pack.title} is ready to use as the starting point.`,
    });
  };

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || generating) return;

    try {
      setGenerating(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/studio", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentType: composer.contentType,
          businessContext: composer.businessContext,
          targetAudience: composer.targetAudience,
          tone: composer.tone,
          platform: composer.platform,
          brandName: composer.brandName,
          brandVoice: composer.brandVoice,
          campaignGoal: composer.campaignGoal,
          callToAction: composer.callToAction,
          keywords: composer.keywords
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          notes: composer.notes,
          language: composer.language,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Could not generate studio content.");
      }

      setLatestGeneration(payload.content || null);
      if (payload.artifacts) {
        setData((current) => ({
          ...current,
          artifacts: payload.artifacts || current.artifacts,
          promptLibrary: payload.promptLibrary || current.promptLibrary,
        }));
      }

      toast({
        title: "Content generated",
        description: payload.content?.title || "Your studio draft is ready.",
      });
    } catch (error) {
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "We could not generate content right now.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 shadow-[0_30px_90px_rgba(0,0,0,0.36)] backdrop-blur-2xl">
            <div className="relative p-6 sm:p-8 lg:p-10">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_12%,rgba(139,92,246,0.38),transparent_34%),radial-gradient(circle_at_12%_10%,rgba(79,157,255,0.24),transparent_36%)]" />
              <div className="relative grid gap-8 xl:grid-cols-[1fr_340px]">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1 text-xs text-[#BFC6D4]">
                      <Sparkles className="h-3.5 w-3.5 text-[#8B5CF6]" />
                      Creative command center
                    </div>
                    <div>
                      <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">AI Studio</h1>
                      <p className="mt-3 max-w-2xl text-base leading-7 text-[#BFC6D4]">
                        Create content, images, videos, voice, campaigns, and business assets from one intelligent workspace.
                      </p>
                    </div>
                  </div>

                  <form className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]" onSubmit={handleGenerate}>
                    <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_160px]">
                      <select
                        aria-label="Studio content type"
                        className="h-11 rounded-2xl border border-white/[0.08] bg-[#111827] px-3 text-sm text-white outline-none"
                        value={composer.contentType}
                        onChange={(event) => handleComposerChange("contentType", event.target.value as StudioContentType)}
                      >
                        {data.supportedContentTypes.map((type) => (
                          <option key={type} value={type}>
                            {formatContentType(type)}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Studio tone"
                        className="h-11 rounded-2xl border border-white/[0.08] bg-[#111827] px-3 text-sm text-white outline-none"
                        value={composer.tone}
                        onChange={(event) => handleComposerChange("tone", event.target.value as StudioTone)}
                      >
                        {TONE_OPTIONS.map((tone) => (
                          <option key={tone} value={tone}>
                            {tone}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={composer.platform}
                        onChange={(event) => handleComposerChange("platform", event.target.value)}
                        placeholder="Platform"
                        className="h-11 rounded-2xl border-white/[0.08] bg-[#111827] text-white placeholder:text-[#7E8799]"
                      />
                    </div>
                    <Textarea
                      rows={3}
                      value={composer.businessContext}
                      onChange={(event) => handleComposerChange("businessContext", event.target.value)}
                      placeholder="What would you like to create today?"
                      className="min-h-28 resize-none border-0 bg-transparent px-1 text-base text-white shadow-none outline-none placeholder:text-[#7E8799] focus-visible:ring-0"
                    />
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button type="button" variant="outline" className="h-10 rounded-2xl border-white/[0.08] bg-white/[0.04]" onClick={() => handleComposerChange("campaignGoal", "Suggest high-potential content ideas")}>
                        <Sparkles className="h-4 w-4" />
                        Suggest ideas
                      </Button>
                      <Button type="button" variant="outline" className="h-10 rounded-2xl border-white/[0.08] bg-white/[0.04]" onClick={() => handleComposerChange("contentType", "caption")}>
                        <Wand2 className="h-4 w-4" />
                        Improve writing
                      </Button>
                      <Button asChild variant="outline" className="h-10 rounded-2xl border-white/[0.08] bg-white/[0.04]">
                        <Link href="/ai/image-studio">
                          <ImageIcon className="h-4 w-4" />
                          Create image
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-10 rounded-2xl border-white/[0.08] bg-white/[0.04]">
                        <Link href="/ai/video-studio">
                          <Video className="h-4 w-4" />
                          Generate video
                        </Link>
                      </Button>
                      <Button asChild variant="outline" className="h-10 rounded-2xl border-white/[0.08] bg-white/[0.04]">
                        <Link href="/ai/audio-studio">
                          <Volume2 className="h-4 w-4" />
                          Create voice
                        </Link>
                      </Button>
                      <Button type="submit" disabled={generating || loading} className="ml-auto h-12 w-12 rounded-full bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] p-0 shadow-[0_18px_45px_rgba(91,95,255,0.35)]">
                        {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                      </Button>
                    </div>
                  </form>
                </div>

                <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">Your Usage</p>
                    <p className="text-xs text-[#7E8799]">
                      {creditDashboard?.snapshot.nextResetAt
                        ? `Resets ${new Date(creditDashboard.snapshot.nextResetAt).toLocaleDateString()}`
                        : "Live usage"}
                    </p>
                  </div>
                  {creditLoading ? (
                    <div className="mt-6 rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-5 text-sm text-[#BFC6D4]">
                      Loading creator credit usage...
                    </div>
                  ) : creditDashboard ? (
                    <div className="mt-6 flex items-center gap-5">
                      <div
                        className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full p-3"
                        style={{
                          background: `conic-gradient(from 180deg,#5B5FFF 0 ${creditUsage ?? 0}%,rgba(255,255,255,0.08) ${creditUsage ?? 0}% 100%)`,
                        }}
                      >
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#111827]">
                          <span className="text-2xl font-semibold">{creditUsage ?? 0}%</span>
                          <span className="text-xs text-[#BFC6D4]">used</span>
                        </div>
                      </div>
                      <div className="grid flex-1 gap-3 text-sm">
                        <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Remaining</span><span className="text-white">{creditDashboard.snapshot.remainingCredits}</span></div>
                        <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Used</span><span className="text-white">{creditDashboard.snapshot.monthlyCreditsUsed}</span></div>
                        <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>Reserved</span><span className="text-white">{creditDashboard.snapshot.monthlyCreditsReserved}</span></div>
                        <div className="flex justify-between gap-3 text-[#BFC6D4]"><span>BYOK</span><span className="text-white">{creditDashboard.snapshot.byokEnabled ? "On" : "Off"}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 rounded-[16px] border border-dashed border-white/[0.08] p-5 text-sm leading-6 text-[#BFC6D4]">
                      Usage appears here after your first AI generation.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-white">Explore AI tools</h2>
                <p className="mt-1 text-sm text-[#BFC6D4]">Move from idea to asset, campaign, and execution without leaving the operating system.</p>
              </div>
              <Button type="button" variant="outline" onClick={handleRefresh} disabled={loading || refreshing || !user} className="rounded-2xl border-white/[0.08] bg-white/[0.04]">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {STUDIO_TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.title}
                    href={tool.href}
                    className="group rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] transition-all duration-200 hover:-translate-y-1 hover:border-[#8B5CF6]/35 hover:bg-[#1A2140]/80 hover:shadow-[0_24px_80px_rgba(91,95,255,0.16)]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6] shadow-[0_14px_35px_rgba(91,95,255,0.25)]">
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="mt-5 text-base font-medium text-white">{tool.title}</h3>
                    <p className="mt-2 min-h-12 text-sm leading-6 text-[#BFC6D4]">{tool.description}</p>
                    <Badge variant="outline" className="mt-4 rounded-full border-white/[0.08] bg-white/[0.04] text-[#BFC6D4]">
                      {tool.label}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-white">Creation workflows</h2>
              <p className="mt-1 text-sm text-[#BFC6D4]">Start with the outcome, then move through the right creation steps without guessing where to go.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {STUDIO_WORKFLOWS.map((workflow) => {
                const Icon = workflow.icon;
                return (
                  <Link
                    key={workflow.title}
                    href={workflow.href}
                    className="group rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)] transition-all duration-200 hover:-translate-y-1 hover:border-[#4F9DFF]/35 hover:bg-[#1A2140]/80"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-white/[0.08] bg-[#090B13]/70">
                        <Icon className="h-5 w-5 text-[#4F9DFF]" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-[#7E8799] transition group-hover:translate-x-1 group-hover:text-white" />
                    </div>
                    <h3 className="mt-5 text-base font-medium text-white">{workflow.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">{workflow.description}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {workflow.steps.map((step) => (
                        <span key={step} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-[#BFC6D4]">
                          {step}
                        </span>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Prompt packs", value: data.promptLibrary.length, detail: "Reusable references for repeatable work." },
              { label: "Saved artifacts", value: data.artifacts.length, detail: "Generated outputs persist for later reuse." },
              { label: "Supported modes", value: data.supportedContentTypes.length, detail: "Content shapes available today." },
              {
                label: "Session output",
                value: latestGeneration?.title || "None yet",
                detail: latestGeneration ? formatContentType(latestGeneration.contentType) : "Generate something to preview it here.",
              },
            ].map((metric) => (
              <div key={metric.label} className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#7E8799]">{metric.label}</p>
                <p className="mt-2 truncate text-2xl font-semibold text-white">{metric.value}</p>
                <p className="mt-1 text-sm text-[#BFC6D4]">{metric.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-6">
              <GlassCard className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <h2 className="text-base font-semibold">Create content</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose a content shape and feed the studio the business context it needs.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Layers3 className="h-4 w-4" />
                    <span>Prompt packs remain read-only references</span>
                  </div>
                </div>

                <form className="mt-5 space-y-4" onSubmit={handleGenerate}>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Content type</label>
                      <select
                        aria-label="Composer content type"
                        className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                        value={composer.contentType}
                        onChange={(event) => handleComposerChange("contentType", event.target.value as StudioContentType)}
                      >
                        {data.supportedContentTypes.map((type) => (
                          <option key={type} value={type}>
                            {formatContentType(type)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tone</label>
                      <select
                        aria-label="Composer tone"
                        className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                        value={composer.tone}
                        onChange={(event) => handleComposerChange("tone", event.target.value as StudioTone)}
                      >
                        {TONE_OPTIONS.map((tone) => (
                          <option key={tone} value={tone}>
                            {tone}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Platform</label>
                      <Input value={composer.platform} onChange={(event) => handleComposerChange("platform", event.target.value)} placeholder="Instagram, YouTube, email..." />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Business context</label>
                      <Textarea
                        rows={4}
                        value={composer.businessContext}
                        onChange={(event) => handleComposerChange("businessContext", event.target.value)}
                        placeholder="Describe the offer, audience, and business goal."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Target audience</label>
                      <Textarea
                        rows={4}
                        value={composer.targetAudience}
                        onChange={(event) => handleComposerChange("targetAudience", event.target.value)}
                        placeholder="Who this is for and what matters to them."
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Brand name</label>
                      <Input value={composer.brandName} onChange={(event) => handleComposerChange("brandName", event.target.value)} placeholder="Soma Digital Community" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Brand voice</label>
                      <Input value={composer.brandVoice} onChange={(event) => handleComposerChange("brandVoice", event.target.value)} placeholder="Premium, direct, helpful..." />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Campaign goal</label>
                      <Input value={composer.campaignGoal} onChange={(event) => handleComposerChange("campaignGoal", event.target.value)} placeholder="Drive signups, teach value, launch a product..." />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Call to action</label>
                      <Input value={composer.callToAction} onChange={(event) => handleComposerChange("callToAction", event.target.value)} placeholder="Book a call, buy now, subscribe..." />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Keywords</label>
                      <Input value={composer.keywords} onChange={(event) => handleComposerChange("keywords", event.target.value)} placeholder="Founder, AI, content, growth" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Language</label>
                      <Input value={composer.language} onChange={(event) => handleComposerChange("language", event.target.value)} placeholder="English" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea
                      rows={3}
                      value={composer.notes}
                      onChange={(event) => handleComposerChange("notes", event.target.value)}
                      placeholder="Any extra instructions, brand rules, or context."
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={generating || loading}>
                      {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Generate content
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setComposer(DEFAULT_COMPOSER_STATE)} disabled={generating}>
                      Reset
                    </Button>
                  </div>
                </form>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <LibraryBig className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold">Prompt library</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search packs"
                        className="pl-9"
                      />
                    </div>
                    <select
                      aria-label="Prompt library content type filter"
                      className={cn("h-10 rounded-md border border-input bg-background px-3 text-sm")}
                      value={typeFilter}
                      onChange={(event) => setTypeFilter(event.target.value as StudioContentType | "all")}
                    >
                      <option value="all">All types</option>
                      {data.supportedContentTypes.map((type) => (
                        <option key={type} value={type}>
                          {formatContentType(type)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 grid gap-4">
                  {filteredPrompts.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-border/70 bg-background/40 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold">{entry.title}</h3>
                          </div>
                          <p className="text-sm text-muted-foreground">{entry.description}</p>
                          <div className="flex flex-wrap gap-2">
                            {entry.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="rounded-md">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(entry.title)}>
                            <ClipboardCopy className="h-4 w-4" />
                            Copy title
                          </Button>
                          <Button type="button" size="sm" onClick={() => handleUsePack(entry)}>
                            Use in studio
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Layers3 className="h-4 w-4" />
                          <span>{entry.id}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {entry.recommendedFor.map((item) => (
                            <span key={item} className="rounded-md border border-border px-2 py-1">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {!loading && filteredPrompts.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                      No prompt packs match this search yet.
                    </div>
                  ) : null}
                </div>
              </GlassCard>
            </section>

            <aside className="space-y-6">
              <GlassCard className="p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">Generation preview</h2>
                </div>
                {latestGeneration ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-md border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{formatContentType(latestGeneration.contentType)}</p>
                          <h3 className="mt-1 text-lg font-semibold">{latestGeneration.title}</h3>
                          <p className="mt-1 text-sm text-muted-foreground">{latestGeneration.summary}</p>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {latestGeneration.promptVersion}
                        </Badge>
                      </div>

                      <div className="mt-4 rounded-md border border-border/70 bg-background/60 p-4">
                        <pre className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {latestGeneration.generatedContent}
                        </pre>
                      </div>
                    </div>

                    {latestGeneration.strategicTips?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strategic tips</p>
                        <div className="grid gap-2">
                          {latestGeneration.strategicTips.map((tip) => (
                            <div key={tip} className="rounded-md border border-border/70 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                              {tip}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {latestGeneration.variants?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variants</p>
                        <div className="grid gap-2">
                          {latestGeneration.variants.map((variant) => (
                            <div key={variant} className="rounded-md border border-border/70 bg-background/40 px-3 py-2 text-sm text-muted-foreground">
                              {variant}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                    Generate something from the studio form and the output will render here.
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">Recent artifacts</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {visibleArtifacts.map((artifact) => (
                    <div key={artifact.artifactId} className="rounded-md border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{artifact.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatContentType(artifact.contentType)} · {artifact.promptVersion} · {artifact.providerId}
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {artifact.source}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                        {artifact.summary || artifact.generatedContent}
                      </p>
                    </div>
                  ))}

                  {!loading && visibleArtifacts.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
                      Saved studio outputs will appear here after generation.
                    </div>
                  ) : null}
                </div>
              </GlassCard>
            </aside>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
