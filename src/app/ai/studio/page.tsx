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
import { authFetch, parseApiError } from "@/lib/clientApi";
import { showErrorToast } from "@/lib/error-toast";
import { cn } from "@/lib/utils";
import { PLATFORM_CAPABILITIES } from "@/social/capabilities";
import { SOCIAL_PLATFORMS, type SocialAccountRecord, type SocialPlatform } from "@/social/types";
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
  CheckCircle2,
  Link2,
  CreditCard,
  Copy,
  Edit3,
  FolderPlus,
  ImagePlus,
  MailPlus,
  Repeat2,
  Save,
  Send,
  ShieldCheck,
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

type SocialAccountsResponse = {
  accounts: SocialAccountRecord[];
};

function formatContentType(contentType: string): string {
  return contentType.replace(/_/g, " ");
}

function formatPlatform(platform: string): string {
  if (platform === "x") return "X";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function formatAccountHandle(account: SocialAccountRecord): string {
  return account.handle || account.accountName || account.providerAccountId || "Connected account";
}

function platformRuleSummary(platform: SocialPlatform): string {
  const capability = PLATFORM_CAPABILITIES[platform];
  const formats = capability.supportedContentTypes.map(formatContentType).join(", ");
  const media = capability.mediaRequired ? "Media required" : "Text-first allowed";
  const limit = capability.maxCaptionLength ? `${capability.maxCaptionLength} chars` : "Platform limit";
  return `${formats} · ${media} · ${limit}`;
}

function estimateStudioCredits(contentType: StudioContentType): number {
  switch (contentType) {
    case "caption":
    case "prompt_library":
      return 5;
    case "ad_copy":
    case "email":
    case "marketing_planner":
      return contentType === "marketing_planner" ? 15 : 10;
    case "carousel":
      return 15;
    case "script":
    case "blog":
    case "sales_funnel":
      return 20;
    case "thumbnail":
      return 10;
    default:
      return 10;
  }
}

function readNumberMetadata(metadata: Record<string, unknown> | undefined, key: string): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toSchedulerContentType(contentType: StudioContentType): string {
  if (contentType === "thumbnail") return "image";
  if (contentType === "script") return "video";
  return "text";
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

function getStudioRoutePrefill(searchParams: URLSearchParams): Partial<StudioComposerState> | null {
  const source = searchParams.get("source");
  if (source !== "library" && source !== "history" && source !== "brand") return null;

  const requestedContentType = searchParams.get("contentType");
  const contentType = isStudioContentType(requestedContentType) ? requestedContentType : undefined;
  const businessContext = searchParams.get("businessContext") || searchParams.get("prompt") || "";
  const campaignGoal = searchParams.get("goal") || "";
  const targetAudience = searchParams.get("targetAudience") || "";
  const brandName = searchParams.get("brandName") || "";
  const brandVoice = searchParams.get("brandVoice") || "";

  return {
    ...(contentType ? { contentType } : {}),
    ...(businessContext ? { businessContext } : {}),
    ...(campaignGoal ? { campaignGoal } : {}),
    ...(targetAudience ? { targetAudience } : {}),
    ...(brandName ? { brandName } : {}),
    ...(brandVoice ? { brandVoice } : {}),
    notes: source === "library"
      ? "Started from a reusable template."
      : source === "history"
        ? "Started from a previous Studio artifact."
        : "Started from saved brand context.",
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

const STUDIO_MODE_LINKS = [
  { label: "Command center", href: "/ai/studio", icon: Sparkles, active: true },
  { label: "Image Studio", href: "/ai/image-studio", icon: ImageIcon },
  { label: "Video Studio", href: "/ai/video-studio", icon: Video },
  { label: "Voice Studio", href: "/ai/audio-studio", icon: Volume2 },
  { label: "Library", href: "/ai/studio/library", icon: LibraryBig },
  { label: "Brand", href: "/ai/studio/brand", icon: ShieldCheck },
  { label: "History", href: "/ai/studio/history", icon: History },
];

type CreationIntent = {
  id: string;
  title: string;
  description: string;
  contentType: StudioContentType;
  icon: typeof Sparkles;
  platform?: string;
  goal: string;
  helper: string;
};

const CREATION_INTENTS: CreationIntent[] = [
  {
    id: "today",
    title: "Generate today's content",
    description: "Get a focused post idea, caption, and next action for today.",
    contentType: "marketing_planner",
    icon: Sparkles,
    goal: "Create today's highest-leverage content idea with a caption and publishing recommendation.",
    helper: "Tell Soma what you are promoting, teaching, or launching today.",
  },
  {
    id: "social",
    title: "Create a social post",
    description: "Write a platform-ready caption with hook, CTA, and hashtags.",
    contentType: "caption",
    icon: Megaphone,
    goal: "Create a social post that earns attention and moves the audience to the next step.",
    helper: "Describe the post idea, offer, lesson, or announcement.",
  },
  {
    id: "email",
    title: "Write an email",
    description: "Draft a campaign email, nurture email, subject line, or offer.",
    contentType: "email",
    icon: Mail,
    goal: "Write a clear email that builds trust and drives the reader to act.",
    helper: "Describe the email purpose and what the reader should do next.",
  },
  {
    id: "blog",
    title: "Write a blog",
    description: "Create a structured article outline or draft for your audience.",
    contentType: "blog",
    icon: FileText,
    goal: "Create a useful long-form article that teaches clearly and supports business growth.",
    helper: "Describe the topic, promise, or question the article should answer.",
  },
  {
    id: "campaign",
    title: "Build a campaign",
    description: "Plan a short campaign with content angles, channels, and CTA flow.",
    contentType: "marketing_planner",
    icon: CalendarDays,
    goal: "Build a simple campaign plan with content, channels, cadence, and outcomes.",
    helper: "Describe the launch, offer, product, course, or community goal.",
  },
  {
    id: "repurpose",
    title: "Repurpose content",
    description: "Turn one idea or draft into new posts, emails, or scripts.",
    contentType: "carousel",
    icon: Workflow,
    goal: "Repurpose existing content into reusable assets for multiple channels.",
    helper: "Paste the original content or summarize what should be reused.",
  },
  {
    id: "improve",
    title: "Improve writing",
    description: "Make existing copy sharper, clearer, shorter, or more premium.",
    contentType: "caption",
    icon: Wand2,
    goal: "Improve the writing while preserving the core message and audience intent.",
    helper: "Paste the draft you want Soma to improve.",
  },
  {
    id: "image",
    title: "Create an image",
    description: "Open Image Studio for branded visuals and saved history.",
    contentType: "thumbnail",
    icon: ImageIcon,
    goal: "Create a branded visual concept for this idea.",
    helper: "Use Image Studio when the output should be visual.",
  },
  {
    id: "video",
    title: "Generate a video",
    description: "Open Video Studio for scripts, scenes, and video generation.",
    contentType: "script",
    icon: Video,
    goal: "Create a video concept, script, and scene direction.",
    helper: "Use Video Studio when the output should become a video.",
  },
  {
    id: "voice",
    title: "Create voice/audio",
    description: "Open Voice Studio for narration, audio, and brand voice work.",
    contentType: "script",
    icon: Volume2,
    goal: "Create an audio-ready script or voiceover direction.",
    helper: "Use Voice Studio when the output should be spoken.",
  },
];

const CONTEXTUAL_ACTIONS = [
  {
    title: "Write caption",
    description: "Turn the idea into a clean platform-ready caption.",
    contentType: "caption" as StudioContentType,
    goal: "Write a caption with a strong hook, useful body, and clear CTA.",
  },
  {
    title: "Add hook",
    description: "Create stronger opening lines.",
    contentType: "caption" as StudioContentType,
    goal: "Create five strong opening hooks for this idea.",
  },
  {
    title: "Generate hashtags",
    description: "Add relevant hashtags without clutter.",
    contentType: "caption" as StudioContentType,
    goal: "Generate relevant hashtags and explain which ones matter most.",
  },
  {
    title: "Create 7-day campaign",
    description: "Build a simple weekly content plan.",
    contentType: "marketing_planner" as StudioContentType,
    goal: "Create a seven-day campaign with topics, formats, platforms, and CTAs.",
  },
  {
    title: "Adapt for platform",
    description: "Rewrite this for the chosen channel.",
    contentType: "caption" as StudioContentType,
    goal: "Adapt this content for the selected platform using platform-specific best practices.",
  },
  {
    title: "Suggest best time",
    description: "Create a scheduling recommendation.",
    contentType: "marketing_planner" as StudioContentType,
    goal: "Suggest the best posting time and explain the reasoning in simple language.",
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
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountRecord[]>([]);
  const [socialAccountsLoading, setSocialAccountsLoading] = useState(true);
  const [selectedSocialAccountIds, setSelectedSocialAccountIds] = useState<string[]>([]);
  const [composer, setComposer] = useState<StudioComposerState>(DEFAULT_COMPOSER_STATE);
  const [activeIntentId, setActiveIntentId] = useState<string>("social");
  const [showAdvancedComposer, setShowAdvancedComposer] = useState(false);
  const [latestGeneration, setLatestGeneration] = useState<StudioGenerationResult | null>(null);
  const [data, setData] = useState<StudioOverviewResponse>({
    supportedContentTypes: STUDIO_CONTENT_TYPES,
    promptLibrary: [],
    artifacts: [],
  });

  useEffect(() => {
    const prefill = getSchedulerActionPrefill(searchParams) || getStudioRoutePrefill(searchParams);
    if (!prefill) return;

    setComposer((current) => ({
      ...current,
      ...prefill,
      brandVoice: prefill.brandVoice || current.brandVoice,
      brandName: prefill.brandName || current.brandName,
      targetAudience: prefill.targetAudience || current.targetAudience,
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
      throw await parseApiError(response, "Could not load the studio library.");
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
          showErrorToast(toast, error, {
            title: "Studio library unavailable",
            fallback: "We could not load the prompt library right now.",
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
        if (!response.ok) throw await parseApiError(response, "Unable to load credits.");
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

  useEffect(() => {
    let mounted = true;

    const loadSocialAccounts = async () => {
      if (!user) {
        setSocialAccountsLoading(false);
        return;
      }

      try {
        setSocialAccountsLoading(true);
        const response = await authFetch("/api/social/accounts?limit=100");
        if (!response.ok) throw await parseApiError(response, "Unable to load social accounts.");
        const payload = (await response.json()) as SocialAccountsResponse;
        if (mounted) {
          const accounts = payload.accounts || [];
          setSocialAccounts(accounts);
          const connected = accounts.filter((account) => account.status === "connected");
          if (connected.length > 0) {
            const first = connected[0];
            setSelectedSocialAccountIds((current) => current.length ? current : [first.socialAccountId]);
            setComposer((current) => ({
              ...current,
              platform: current.platform || formatPlatform(first.providerId),
            }));
          }
        }
      } catch {
        if (mounted) setSocialAccounts([]);
      } finally {
        if (mounted) setSocialAccountsLoading(false);
      }
    };

    void loadSocialAccounts();
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

  const connectedSocialAccounts = useMemo(
    () => socialAccounts.filter((account) => account.status === "connected"),
    [socialAccounts]
  );

  const accountsByPlatform = useMemo(() => {
    return SOCIAL_PLATFORMS.reduce<Record<SocialPlatform, SocialAccountRecord[]>>((acc, platform) => {
      acc[platform] = connectedSocialAccounts.filter((account) => account.providerId === platform);
      return acc;
    }, {} as Record<SocialPlatform, SocialAccountRecord[]>);
  }, [connectedSocialAccounts]);

  const selectedSocialAccounts = useMemo(() => {
    const ids = new Set(selectedSocialAccountIds);
    return connectedSocialAccounts.filter((account) => ids.has(account.socialAccountId));
  }, [connectedSocialAccounts, selectedSocialAccountIds]);

  const selectedPlatforms = useMemo(() => {
    const platforms = selectedSocialAccounts.map((account) => account.providerId);
    if (platforms.length > 0) return Array.from(new Set(platforms));
    const typed = composer.platform.toLowerCase().trim();
    return SOCIAL_PLATFORMS.filter((platform) => typed.includes(platform));
  }, [composer.platform, selectedSocialAccounts]);

  const estimatedCredits = useMemo(() => estimateStudioCredits(composer.contentType), [composer.contentType]);
  const latestGenerationWasCached = Boolean(latestGeneration?.metadata?.cacheHit);
  const creditSnapshot = creditDashboard?.snapshot;
  const availableCredits = creditSnapshot?.remainingCredits ?? 0;
  const byokEnabled = Boolean(creditSnapshot?.byokEnabled);
  const isCreditBlocked = Boolean(
    creditDashboard &&
      !byokEnabled &&
      availableCredits < estimatedCredits &&
      !latestGenerationWasCached
  );

  const latestGenerationCredits = useMemo(() => {
    if (!latestGeneration) return null;
    return readNumberMetadata(latestGeneration.metadata, "creditsCharged");
  }, [latestGeneration]);

  const latestGenerationCostLabel = latestGenerationWasCached
    ? "Reused content · 0 Creator Credits"
    : `${latestGenerationCredits ?? estimateStudioCredits(latestGeneration?.contentType || composer.contentType)} Creator Credits`;
  const selectedDestinationLabel = selectedSocialAccounts.length
    ? selectedSocialAccounts.map((account) => `${formatPlatform(account.providerId)} ${formatAccountHandle(account)}`).join(", ")
    : composer.platform || "No destination selected";

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
        description: "We pulled in the latest reusable templates and generated assets.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Refresh failed",
        fallback: "The studio workspace could not be refreshed.",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleComposerChange = <K extends keyof StudioComposerState>(key: K, value: StudioComposerState[K]) => {
    setComposer((current) => ({ ...current, [key]: value }));
  };

  const buildGenerationNotes = () => {
    const destinationNotes = selectedSocialAccounts.length
      ? `Selected social accounts: ${selectedSocialAccounts.map((account) => `${formatPlatform(account.providerId)} ${formatAccountHandle(account)}`).join("; ")}.`
      : "";
    const ruleNotes = selectedPlatforms.length
      ? `Platform rules: ${selectedPlatforms.map((platform) => `${formatPlatform(platform)} (${platformRuleSummary(platform)})`).join("; ")}.`
      : "";
    return [composer.notes, destinationNotes, ruleNotes].filter(Boolean).join("\n");
  };

  const syncPlatformFromAccounts = (accounts: SocialAccountRecord[]) => {
    const labels = Array.from(new Set(accounts.map((account) => formatPlatform(account.providerId))));
    setComposer((current) => ({
      ...current,
      platform: labels.length ? labels.join(", ") : current.platform,
    }));
  };

  const toggleSocialAccount = (account: SocialAccountRecord) => {
    setSelectedSocialAccountIds((current) => {
      const exists = current.includes(account.socialAccountId);
      const nextIds = exists
        ? current.filter((id) => id !== account.socialAccountId)
        : [...current, account.socialAccountId];
      const nextAccounts = connectedSocialAccounts.filter((item) => nextIds.includes(item.socialAccountId));
      syncPlatformFromAccounts(nextAccounts);
      return nextIds;
    });
  };

  const choosePlatformWithoutConnection = (platform: SocialPlatform) => {
    setComposer((current) => ({
      ...current,
      platform: formatPlatform(platform),
      campaignGoal: current.campaignGoal || `Create platform-aware content for ${formatPlatform(platform)}.`,
      notes: current.notes || `${formatPlatform(platform)} is not connected yet. Generate draft content now, then connect the account before scheduling.`,
    }));
  };

  const applyCreationIntent = (intent: CreationIntent) => {
    setActiveIntentId(intent.id);

    if (intent.id === "image") {
      window.location.href = "/ai/image-studio";
      return;
    }

    if (intent.id === "video") {
      window.location.href = "/ai/video-studio";
      return;
    }

    if (intent.id === "voice") {
      window.location.href = "/ai/audio-studio";
      return;
    }

    setComposer((current) => ({
      ...current,
      contentType: intent.contentType,
      platform: current.platform || intent.platform || "",
      campaignGoal: intent.goal,
      notes: current.notes || intent.helper,
    }));
  };

  const applyContextualAction = (action: (typeof CONTEXTUAL_ACTIONS)[number]) => {
    setComposer((current) => ({
      ...current,
      contentType: action.contentType,
      campaignGoal: action.goal,
      notes: current.notes || action.description,
    }));
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
    if (isCreditBlocked) {
      toast({
        title: "Creator Credits needed",
        description: `This generation uses ${estimatedCredits} Creator Credits. Buy Creator Credits, upgrade for monthly credits, or use your own provider key if BYOK is enabled.`,
        variant: "destructive",
      });
      return;
    }

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
          notes: buildGenerationNotes(),
          language: composer.language,
        }),
      });

      if (!response.ok) {
        throw await parseApiError(response, "Could not generate studio content.");
      }
      const payload = await response.json().catch(() => ({}));

      setLatestGeneration(payload.content || null);
      if (payload.artifacts) {
        setData((current) => ({
          ...current,
          artifacts: payload.artifacts || current.artifacts,
          promptLibrary: payload.promptLibrary || current.promptLibrary,
        }));
      }
      const refreshedCredits = await authFetch("/api/creator-credits").catch(() => null);
      if (refreshedCredits?.ok) {
        const creditPayload = (await refreshedCredits.json()) as CreditDashboard;
        setCreditDashboard(creditPayload);
      }

      toast({
        title: "Content generated",
        description: payload.content?.title || "Your studio draft is ready.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Generation failed",
        fallback: "We could not generate content right now.",
      });
    } finally {
      setGenerating(false);
    }
  };

  const activeIntent = CREATION_INTENTS.find((intent) => intent.id === activeIntentId) || CREATION_INTENTS[1];

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-8">
          <section className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {STUDIO_MODE_LINKS.map((mode) => {
                const Icon = mode.icon;
                return (
                  <Link
                    key={mode.href}
                    href={mode.href}
                    className={cn(
                      "flex min-w-max items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition-all duration-200",
                      mode.active
                        ? "border-[#8B5CF6]/50 bg-[#8B5CF6]/15 text-white shadow-[0_14px_45px_rgba(91,95,255,0.18)]"
                        : "border-white/[0.06] bg-white/[0.03] text-[#BFC6D4] hover:border-[#4F9DFF]/35 hover:bg-white/[0.06] hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {mode.label}
                  </Link>
                );
              })}
            </div>
          </section>

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

                  <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
                    <div className="mb-4">
                      <p className="text-sm font-medium text-white">What do you want to create today?</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        {CREATION_INTENTS.slice(0, 10).map((intent) => {
                          const Icon = intent.icon;
                          const isActive = activeIntentId === intent.id;
                          return (
                            <button
                              key={intent.id}
                              type="button"
                              onClick={() => applyCreationIntent(intent)}
                              className={cn(
                                "group rounded-2xl border p-3 text-left transition-all duration-200",
                                isActive
                                  ? "border-[#8B5CF6]/60 bg-[#151A2E] shadow-[0_16px_50px_rgba(91,95,255,0.18)]"
                                  : "border-white/[0.08] bg-white/[0.03] hover:-translate-y-0.5 hover:border-[#4F9DFF]/35 hover:bg-white/[0.06]"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F9DFF] via-[#5B5FFF] to-[#8B5CF6]">
                                  <Icon className="h-4 w-4 text-white" />
                                </span>
                                <span className="text-sm font-medium text-white">{intent.title}</span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#BFC6D4]">{intent.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <form onSubmit={handleGenerate} className="rounded-2xl border border-white/[0.08] bg-[#111827]/70 p-4">
                      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-full border-[#8B5CF6]/35 bg-[#8B5CF6]/10 text-[#D8CCFF]">
                              {activeIntent.title}
                            </Badge>
                            <span className="text-xs text-[#7E8799]">{formatContentType(composer.contentType)}</span>
                          </div>
                          <Textarea
                            rows={4}
                            value={composer.businessContext}
                            onChange={(event) => handleComposerChange("businessContext", event.target.value)}
                            placeholder={activeIntent.helper}
                            className="min-h-32 resize-none border-white/[0.08] bg-[#090B13]/70 text-base text-white placeholder:text-[#7E8799]"
                          />
                        </div>
                        <div className="space-y-3">
                          <label className="text-sm font-medium text-white">Who is this for?</label>
                          <Textarea
                            rows={4}
                            value={composer.targetAudience}
                            onChange={(event) => handleComposerChange("targetAudience", event.target.value)}
                            placeholder="Example: beginner entrepreneurs who want more customers online."
                            className="min-h-32 resize-none border-white/[0.08] bg-[#090B13]/70 text-white placeholder:text-[#7E8799]"
                          />
                          <p className="text-xs leading-5 text-[#7E8799]">
                            Target audience improves the result. If you leave it empty, Soma uses a safe creator-business default.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#090B13]/60 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">Choose destination</p>
                            <p className="mt-1 text-xs text-[#7E8799]">
                              Select one or more connected accounts. Soma will adapt the content for each platform.
                            </p>
                          </div>
                          <Button asChild type="button" variant="outline" className="rounded-2xl border-white/[0.08] bg-white/[0.04]">
                            <Link href="/social">
                              <Link2 className="h-4 w-4" />
                              Connect accounts
                            </Link>
                          </Button>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {SOCIAL_PLATFORMS.map((platform) => {
                            const accounts = accountsByPlatform[platform] || [];
                            const hasAccounts = accounts.length > 0;
                            return (
                              <div key={platform} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-white">{formatPlatform(platform)}</p>
                                    <p className="mt-1 text-xs text-[#7E8799]">{platformRuleSummary(platform)}</p>
                                  </div>
                                  {!hasAccounts ? (
                                    <button
                                      type="button"
                                      onClick={() => choosePlatformWithoutConnection(platform)}
                                      className="rounded-full border border-white/[0.08] px-2.5 py-1 text-xs text-[#BFC6D4] transition hover:border-[#4F9DFF]/35 hover:text-white"
                                    >
                                      Draft
                                    </button>
                                  ) : null}
                                </div>

                                <div className="mt-3 space-y-2">
                                  {socialAccountsLoading ? (
                                    <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-2 text-xs text-[#7E8799]">Loading accounts...</div>
                                  ) : hasAccounts ? (
                                    accounts.map((account) => {
                                      const selected = selectedSocialAccountIds.includes(account.socialAccountId);
                                      return (
                                        <button
                                          key={account.socialAccountId}
                                          type="button"
                                          onClick={() => toggleSocialAccount(account)}
                                          className={cn(
                                            "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition",
                                            selected
                                              ? "border-[#8B5CF6]/60 bg-[#8B5CF6]/10 text-white"
                                              : "border-white/[0.08] bg-[#090B13]/70 text-[#BFC6D4] hover:border-[#4F9DFF]/35 hover:text-white"
                                          )}
                                        >
                                          <span>
                                            <span className="block text-xs font-medium">{formatAccountHandle(account)}</span>
                                            <span className="mt-0.5 block text-[11px] text-[#7E8799]">{account.accountName}</span>
                                          </span>
                                          {selected ? <CheckCircle2 className="h-4 w-4 text-[#22C55E]" /> : null}
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-2 text-xs text-[#7E8799]">
                                      Not connected. Draft now or connect before scheduling.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <Input
                          value={composer.platform}
                          onChange={(event) => handleComposerChange("platform", event.target.value)}
                          placeholder="Platform or channel"
                          className="h-11 rounded-2xl border-white/[0.08] bg-[#090B13]/70 text-white placeholder:text-[#7E8799]"
                        />
                        <Input
                          value={composer.campaignGoal}
                          onChange={(event) => handleComposerChange("campaignGoal", event.target.value)}
                          placeholder="Goal, e.g. educate, sell, announce"
                          className="h-11 rounded-2xl border-white/[0.08] bg-[#090B13]/70 text-white placeholder:text-[#7E8799]"
                        />
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <Button type="submit" disabled={generating || loading || isCreditBlocked} className="h-11 w-full min-w-max flex-shrink-0 rounded-2xl bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] shadow-[0_18px_45px_rgba(91,95,255,0.35)] sm:w-auto">
                            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            {isCreditBlocked ? "Add credits to generate" : "Generate"}
                          </Button>
                          <Button type="button" variant="outline" onClick={() => setShowAdvancedComposer((value) => !value)} className="h-11 w-full shrink-0 rounded-2xl border-white/[0.08] bg-white/[0.04] sm:w-auto sm:flex-none">
                            Advanced
                          </Button>
                        </div>
                      </div>

                      <div className={cn(
                        "mt-4 flex flex-col gap-3 rounded-2xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between",
                        isCreditBlocked
                          ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#FDE7BD]"
                          : "border-white/[0.08] bg-white/[0.03] text-[#BFC6D4]"
                      )}>
                        <div>
                          <span className="font-medium text-white">This will use {estimatedCredits} Creator Credits.</span>{" "}
                          {isCreditBlocked
                            ? "Buy Creator Credits, upgrade for monthly credits, or use your own provider key if BYOK is enabled."
                            : latestGenerationWasCached
                              ? "Reusing cached work costs 0 credits and still appears in your history."
                              : "Credits are reserved first and refunded automatically if generation fails."}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild type="button" variant="outline" size="sm" className="rounded-xl border-white/[0.08] bg-white/[0.04]">
                            <Link href="/settings/credits">
                              <CreditCard className="h-4 w-4" />
                              Buy Creator Credits
                            </Link>
                          </Button>
                          <Button asChild type="button" variant="outline" size="sm" className="rounded-xl border-white/[0.08] bg-white/[0.04]">
                            <Link href="/settings/billing">Upgrade or Manage</Link>
                          </Button>
                          <Button asChild type="button" variant="outline" size="sm" className="rounded-xl border-white/[0.08] bg-white/[0.04]">
                            <Link href="/settings">Use BYOK</Link>
                          </Button>
                        </div>
                      </div>
                    </form>
                  </div>
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

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[18px] border border-white/[0.08] bg-[#151A2E]/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#4F9DFF]/20 bg-[#4F9DFF]/10 px-3 py-1 text-xs text-[#BFC6D4]">
                    <Sparkles className="h-3.5 w-3.5 text-[#4F9DFF]" />
                    Soma AI briefing
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
                    Want me to create today's content?
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#BFC6D4]">
                    Soma can turn your current idea into a post, campaign, email, or reusable asset. Add the audience when you know it; that is how the AI writes for the right people.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => applyCreationIntent(CREATION_INTENTS[0])}
                  className="w-full rounded-2xl bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] sm:w-auto sm:flex-none sm:shrink-0 sm:min-w-max"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate today's content
                </Button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  "No prompt engineering needed",
                  composer.platform ? `${composer.platform} context ready` : "Choose any platform",
                  composer.targetAudience ? "Audience supplied" : "Audience can be added",
                  creditDashboard ? `${creditDashboard.snapshot.remainingCredits} credits available` : "Credits checked at generation",
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-[#BFC6D4]">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
              <p className="text-sm font-medium text-white">Contextual AI actions</p>
              <div className="mt-4 grid gap-2">
                {CONTEXTUAL_ACTIONS.map((action) => (
                  <button
                    key={action.title}
                    type="button"
                    onClick={() => applyContextualAction(action)}
                    className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left transition hover:border-[#8B5CF6]/35 hover:bg-white/[0.06]"
                  >
                    <span>
                      <span className="block text-sm font-medium text-white">{action.title}</span>
                      <span className="mt-0.5 block text-xs text-[#7E8799]">{action.description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#7E8799]" />
                  </button>
                ))}
              </div>
              <div className="mt-4 border-t border-white/[0.08] pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[#7E8799]">Adapt for platform</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedPlatforms.length ? selectedPlatforms : SOCIAL_PLATFORMS).map((platform) => (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => {
                        handleComposerChange("contentType", "caption");
                        handleComposerChange("platform", formatPlatform(platform));
                        handleComposerChange("campaignGoal", `Adapt this content for ${formatPlatform(platform)} using the platform's rules and audience expectations.`);
                      }}
                      className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-[#BFC6D4] transition hover:border-[#8B5CF6]/35 hover:text-white"
                    >
                      {formatPlatform(platform)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-white">Specialized studios</h2>
                <p className="mt-1 text-sm text-[#BFC6D4]">Use these when the output needs a dedicated image, video, voice, publishing, or automation workspace.</p>
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
              { label: "Reusable templates", value: data.promptLibrary.length, detail: "Starting points for repeatable work." },
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
                      <h2 className="text-base font-semibold">Advanced creation details</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Fine-tune the guided composer when you want more control over format, tone, brand, CTA, and keywords.
                    </p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setShowAdvancedComposer((value) => !value)}>
                    {showAdvancedComposer ? "Hide advanced" : "Show advanced"}
                  </Button>
                </div>

                {showAdvancedComposer ? (
                  <form className="mt-5 space-y-4" onSubmit={handleGenerate}>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Output format</label>
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
                        <label className="text-sm font-medium">Call to action</label>
                        <Input value={composer.callToAction} onChange={(event) => handleComposerChange("callToAction", event.target.value)} placeholder="Book a call, buy now, subscribe..." />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Keywords</label>
                        <Input value={composer.keywords} onChange={(event) => handleComposerChange("keywords", event.target.value)} placeholder="Founder, AI, content, growth" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Language</label>
                        <Input value={composer.language} onChange={(event) => handleComposerChange("language", event.target.value)} placeholder="English" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Extra notes</label>
                        <Input value={composer.notes} onChange={(event) => handleComposerChange("notes", event.target.value)} placeholder="Brand rules, examples, or constraints." />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <Button type="submit" disabled={generating || loading || isCreditBlocked} className="w-full min-w-max flex-shrink-0 sm:w-auto">
                        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {isCreditBlocked ? "Add credits to generate" : "Generate with details"}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setComposer(DEFAULT_COMPOSER_STATE)} disabled={generating} className="w-full shrink-0 sm:w-auto sm:flex-none">
                        Reset details
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-5 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.03] p-5 text-sm leading-6 text-muted-foreground">
                    Advanced details are hidden to keep creation simple. Use the guided composer above for most work, or open this panel when you need exact tone, CTA, brand voice, keywords, or language control.
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <LibraryBig className="h-4 w-4 text-primary" />
                    <h2 className="text-base font-semibold">Reusable templates</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search templates"
                        className="pl-9"
                      />
                    </div>
                    <select
                      aria-label="Reusable templates content type filter"
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
                          <Button type="button" size="sm" onClick={() => handleUsePack(entry)}>
                            Start from this
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
                      No reusable templates match this search yet.
                    </div>
                  ) : null}
                </div>
              </GlassCard>
            </section>

            <aside className="space-y-6">
              <GlassCard className="p-5 lg:sticky lg:top-24">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold uppercase tracking-wide">Output workspace</h2>
                  </div>
                  <Badge variant="outline" className="w-fit rounded-full border-[#4F9DFF]/25 bg-[#4F9DFF]/10 text-[#BFC6D4]">
                    Gateway enforced
                  </Badge>
                </div>
                {latestGeneration ? (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-[18px] border border-white/[0.08] bg-[#090B13]/70 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-[#7E8799]">{formatContentType(latestGeneration.contentType)}</p>
                          <h3 className="mt-1 text-lg font-semibold">{latestGeneration.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-[#BFC6D4]">{latestGeneration.summary}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Badge variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]">
                            {latestGenerationCostLabel}
                          </Badge>
                          <Badge variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]">
                            {latestGeneration.metadata?.saved === false ? "Not saved" : "Saved"}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {[
                          ["Content type", formatContentType(latestGeneration.contentType)],
                          ["Destination", selectedDestinationLabel],
                          ["Prompt version", latestGeneration.promptVersion],
                          ["Provider", `${latestGeneration.providerId} · ${latestGeneration.modelId}`],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-[#7E8799]">{label}</p>
                            <p className="mt-1 truncate text-sm text-white">{value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#111827]/70 p-4">
                        <pre className="whitespace-pre-wrap text-sm leading-6 text-[#DDE4F0]">
                          {latestGeneration.generatedContent}
                        </pre>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start rounded-xl border-white/[0.08] bg-white/[0.04]"
                          onClick={() => {
                            setComposer((current) => ({
                              ...current,
                              contentType: latestGeneration.contentType,
                              businessContext: latestGeneration.generatedContent,
                              campaignGoal: "Edit and improve this generated draft.",
                            }));
                            setShowAdvancedComposer(true);
                          }}
                        >
                          <Edit3 className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="justify-start rounded-xl border-white/[0.08] bg-white/[0.04]" onClick={() => navigator.clipboard.writeText(latestGeneration.generatedContent)}>
                          <Copy className="h-4 w-4" />
                          Copy
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start rounded-xl border-white/[0.08] bg-white/[0.04]"
                          onClick={() => toast({ title: "Saved", description: "This output is stored in your Studio history." })}
                        >
                          <Save className="h-4 w-4" />
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start rounded-xl border-white/[0.08] bg-white/[0.04]"
                          onClick={() => {
                            setComposer((current) => ({
                              ...current,
                              businessContext: latestGeneration.generatedContent,
                              campaignGoal: "Regenerate this with stronger clarity, structure, and audience fit.",
                            }));
                          }}
                        >
                          <Repeat2 className="h-4 w-4" />
                          Regenerate
                        </Button>
                        <Button asChild size="sm" className="justify-start rounded-xl bg-gradient-to-br from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF]">
                          <Link
                            href={`/social/calendar?${new URLSearchParams({
                              mode: "scheduler",
                              source: "ai-studio",
                              platform: selectedPlatforms[0] || composer.platform || "",
                              caption: latestGeneration.generatedContent.slice(0, 900),
                              contentType: toSchedulerContentType(latestGeneration.contentType),
                            }).toString()}`}
                          >
                            <Send className="h-4 w-4" />
                            Send to Scheduler
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="justify-start rounded-xl border-white/[0.08] bg-white/[0.04]">
                          <Link href={`/ai/image-studio?${new URLSearchParams({
                            source: "ai-studio",
                            prompt: latestGeneration.summary || latestGeneration.title,
                            title: latestGeneration.title,
                          }).toString()}`}>
                            <ImagePlus className="h-4 w-4" />
                            Turn into image
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="justify-start rounded-xl border-white/[0.08] bg-white/[0.04]">
                          <Link href={`/ai/video-studio?${new URLSearchParams({
                            source: "ai-studio",
                            prompt: latestGeneration.generatedContent.slice(0, 900),
                            title: latestGeneration.title,
                          }).toString()}`}>
                            <Video className="h-4 w-4" />
                            Turn into video
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start rounded-xl border-white/[0.08] bg-white/[0.04]"
                          onClick={() => {
                            setComposer((current) => ({
                              ...current,
                              contentType: "email",
                              businessContext: latestGeneration.generatedContent,
                              campaignGoal: "Turn this content into a campaign email.",
                            }));
                          }}
                        >
                          <MailPlus className="h-4 w-4" />
                          Create email
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="justify-start rounded-xl border-white/[0.08] bg-white/[0.04]"
                          onClick={() => {
                            setComposer((current) => ({
                              ...current,
                              contentType: "marketing_planner",
                              businessContext: latestGeneration.generatedContent,
                              campaignGoal: "Add this asset to a larger campaign plan.",
                            }));
                          }}
                        >
                          <FolderPlus className="h-4 w-4" />
                          Add to campaign
                        </Button>
                      </div>
                    </div>

                    {(selectedPlatforms.length > 0 || selectedSocialAccounts.length > 0) ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform previews</p>
                        <div className="grid gap-2">
                          {(selectedSocialAccounts.length
                            ? selectedSocialAccounts
                            : selectedPlatforms.map((platform) => ({
                                socialAccountId: platform,
                                providerId: platform,
                                accountName: `${formatPlatform(platform)} draft`,
                                handle: undefined,
                              } as SocialAccountRecord))
                          ).map((account) => (
                            <div key={account.socialAccountId} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-white">
                                    {formatPlatform(account.providerId)} · {formatAccountHandle(account)}
                                  </p>
                                  <p className="mt-1 text-xs text-[#7E8799]">{platformRuleSummary(account.providerId)}</p>
                                </div>
                                <Badge variant="outline" className="rounded-full border-white/[0.08] bg-white/[0.04]">
                                  {account.status === "connected" ? "Connected" : "Draft"}
                                </Badge>
                              </div>
                              <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#BFC6D4]">
                                {latestGeneration.generatedContent}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {latestGeneration.strategicTips?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Strategic tips</p>
                        <div className="grid gap-2">
                          {latestGeneration.strategicTips.map((tip) => (
                            <div key={tip} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-[#BFC6D4]">
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
                            <div key={variant} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-[#BFC6D4]">
                              {variant}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {latestGeneration.sections?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Structured sections</p>
                        <div className="grid gap-2">
                          {latestGeneration.sections.map((section) => (
                            <div key={`${section.heading}-${section.body.slice(0, 20)}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                              <p className="text-sm font-medium text-white">{section.heading}</p>
                              <p className="mt-1 text-sm leading-6 text-[#BFC6D4]">{section.body}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 rounded-[18px] border border-dashed border-white/[0.1] bg-[#090B13]/60 p-6 text-sm leading-6 text-[#BFC6D4]">
                    <p className="font-medium text-white">Your generated asset will appear here.</p>
                    <p className="mt-2">
                      You will see the result, content type, platform context, credit cost, prompt version, saved status, and the next workflow actions.
                    </p>
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
