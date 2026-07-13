"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowDown,
  ArrowUp,
  Clock3,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  GripVertical,
  SquareArrowOutUpRight,
  ImageIcon,
  Video,
  FileText,
  Hash,
  Megaphone,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { cn } from "@/lib/utils";
import { SOCIAL_PROVIDER_REGISTRY } from "@/lib/social-data";
import {
  SCHEDULED_POST_STATUSES,
  SOCIAL_CAMPAIGN_STATUSES,
  type ScheduledPostRecord,
  type ScheduledPostStatus,
  type SocialPlatform,
  type SocialCampaignRecord,
  type SocialCampaignStatus,
  type SocialAccountRecord,
  type SocialPublishAttemptRecord,
  type NormalizedSocialPublishPayload,
} from "@/social/types";
import {
  PLATFORM_CAPABILITIES,
  getDefaultContentType,
  getPlatformCapability,
  requiresMedia,
  type ScheduledPostContentType,
} from "@/social/capabilities";

type CalendarResponse = {
  month: string;
  summary: {
    totalPosts: number;
    byStatus: Record<ScheduledPostStatus, number>;
    byPlatform: Record<SocialPlatform, number>;
    upcomingPosts: number;
  };
  posts: ScheduledPostRecord[];
};

type CalendarPostResponse = {
  post: ScheduledPostRecord;
};

type CalendarCampaignResponse = {
  campaign: SocialCampaignRecord;
};

type CalendarCampaignListResponse = {
  summary: {
    totalCampaigns: number;
    activeCampaigns: number;
    byStatus: Record<SocialCampaignStatus, number>;
    campaigns: SocialCampaignRecord[];
  };
  campaigns: SocialCampaignRecord[];
};

type SocialAccountsResponse = {
  accounts: SocialAccountRecord[];
};

type StudioAssetSummary = {
  assetId: string;
  title: string;
  type: string;
  status: string;
  thumbnail?: string;
  downloadUrl?: string;
  mimeType?: string;
};

type StudioAssetsResponse = {
  assets: StudioAssetSummary[];
};

type StudioAssetUploadResponse = {
  asset: StudioAssetSummary;
};

type PublishAttemptsResponse = {
  attempts: SocialPublishAttemptRecord[];
};

type PublishPayloadResponse = {
  payload: NormalizedSocialPublishPayload;
};

const IMAGE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

interface CalendarFormState {
  title: string;
  caption: string;
  platform: SocialPlatform;
  connectedAccountId: string;
  destinationAccountIds: string[];
  publicationGroupId: string;
  contentType: ScheduledPostContentType;
  status: ScheduledPostStatus;
  scheduledDate: string;
  scheduledTime: string;
  assetIds: string;
  hashtags: string;
  cta: string;
  destinationCaptions: Record<string, string>;
  tiktokPrivacy: "public" | "friends" | "private";
  instagramPublishAs: "feed" | "reel" | "story";
  youtubeTitle: string;
  youtubeVisibility: "public" | "unlisted" | "private";
  linkedinDestinationType: "profile" | "organization";
  campaignId: string;
  notes: string;
  timezone: string;
}

interface CampaignFormState {
  campaignName: string;
  platform: SocialPlatform | "";
  status: SocialCampaignStatus;
  goal: string;
  startDate: string;
  endDate: string;
  notes: string;
  color: string;
}

type CalendarViewMode = "month" | "week" | "agenda";

const STATUS_LABELS: Record<ScheduledPostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  editing: "Editing",
  cancelled: "Cancelled",
};

function getTodayDateString(): string {
  return format(new Date(), "yyyy-MM-dd");
}

function splitIsoToFormValues(value: string): { scheduledDate: string; scheduledTime: string } {
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) {
    return { scheduledDate: getTodayDateString(), scheduledTime: "09:00" };
  }
  return {
    scheduledDate: format(parsed, "yyyy-MM-dd"),
    scheduledTime: format(parsed, "HH:mm"),
  };
}

function combineDateAndTime(date: string, time: string): string {
  const parsedDate = parseISO(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return new Date().toISOString();
  }

  const [hours, minutes] = time.split(":").map((part) => Number(part));
  const next = new Date(parsedDate);
  next.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return next.toISOString();
}

function buildFormFromPost(post: ScheduledPostRecord): CalendarFormState {
  const scheduled = splitIsoToFormValues(post.scheduledTime);
  return {
    title: post.title || "",
    caption: post.caption || "",
    platform: post.platform,
    connectedAccountId: post.connectedAccountId || post.socialAccountId || "",
    destinationAccountIds: [post.connectedAccountId || post.socialAccountId || ""].filter(Boolean),
    publicationGroupId: post.publicationGroupId || "",
    contentType: post.contentType || getDefaultContentType(post.platform),
    status: post.status,
    scheduledDate: scheduled.scheduledDate,
    scheduledTime: scheduled.scheduledTime,
    assetIds: (post.assetIds || []).join(", "),
    hashtags: (post.hashtags || []).map((tag) => `#${tag}`).join(" "),
    cta: post.cta || "",
    destinationCaptions: {},
    tiktokPrivacy: (post.platformSettings?.privacyLevel as CalendarFormState["tiktokPrivacy"]) || "public",
    instagramPublishAs: (post.platformSettings?.publishAs as CalendarFormState["instagramPublishAs"]) || "feed",
    youtubeTitle: (post.platformSettings?.title as string) || post.title || "",
    youtubeVisibility: (post.platformSettings?.visibility as CalendarFormState["youtubeVisibility"]) || "private",
    linkedinDestinationType: (post.platformSettings?.destinationType as CalendarFormState["linkedinDestinationType"]) || "profile",
    campaignId: post.campaignId || "",
    notes: post.notes || "",
    timezone: post.timezone || "",
  };
}

function buildEmptyForm(date: string): CalendarFormState {
  return {
    title: "",
    caption: "",
    platform: "instagram",
    connectedAccountId: "",
    destinationAccountIds: [],
    publicationGroupId: "",
    contentType: "image",
    status: "draft",
    scheduledDate: date,
    scheduledTime: "09:00",
    assetIds: "",
    hashtags: "",
    cta: "",
    destinationCaptions: {},
    tiktokPrivacy: "public",
    instagramPublishAs: "feed",
    youtubeTitle: "",
    youtubeVisibility: "private",
    linkedinDestinationType: "profile",
    campaignId: "",
    notes: "",
    timezone: "",
  };
}

function splitAssetIds(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function splitHashtags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((entry) => entry.replace(/^#/, "").trim())
        .filter(Boolean)
    )
  );
}

function createPublicationGroupId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getAccountDisplayLabel(account?: SocialAccountRecord): string {
  if (!account) return "No destination selected";
  return account.handle || account.accountName || account.providerAccountId || account.providerLabel;
}

function getAssetPreviewLabel(asset?: StudioAssetSummary, assetId?: string): string {
  if (asset?.title) return asset.title;
  return assetId || "Selected asset";
}

function canDragScheduledPost(post: ScheduledPostRecord): boolean {
  return !["published", "cancelled", "publishing"].includes(post.status);
}

function getPostPreviewAsset(post: ScheduledPostRecord, assetMap: Record<string, StudioAssetSummary>): StudioAssetSummary | undefined {
  const firstAssetId = post.assetIds?.[0];
  return firstAssetId ? assetMap[firstAssetId] : undefined;
}

function buildPlatformSettings(platform: SocialPlatform, form: CalendarFormState): Record<string, unknown> {
  switch (platform) {
    case "tiktok":
      return {
        privacyLevel: form.tiktokPrivacy,
        allowComments: true,
        allowDuet: true,
        allowStitch: true,
      };
    case "instagram":
      return {
        publishAs: form.instagramPublishAs,
        shareToFeed: form.instagramPublishAs !== "story",
      };
    case "youtube":
      return {
        title: form.youtubeTitle || form.title || form.caption.slice(0, 90),
        visibility: form.youtubeVisibility,
      };
    case "linkedin":
      return {
        destinationType: form.linkedinDestinationType,
      };
    default:
      return {};
  }
}

function buildCampaignFormFromCampaign(campaign: SocialCampaignRecord): CampaignFormState {
  return {
    campaignName: campaign.campaignName || "",
    platform: campaign.platform || "",
    status: campaign.status,
    goal: campaign.goal || "",
    startDate: campaign.startDate ? format(parseISO(campaign.startDate), "yyyy-MM-dd") : "",
    endDate: campaign.endDate ? format(parseISO(campaign.endDate), "yyyy-MM-dd") : "",
    notes: campaign.notes || "",
    color: campaign.color || "",
  };
}

function buildEmptyCampaignForm(): CampaignFormState {
  return {
    campaignName: "",
    platform: "",
    status: "draft",
    goal: "",
    startDate: "",
    endDate: "",
    notes: "",
    color: "",
  };
}

function getPostBadgeClass(status: ScheduledPostStatus): string {
  switch (status) {
    case "published":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
    case "scheduled":
      return "bg-sky-500/15 text-sky-300 border-sky-500/25";
    case "failed":
      return "bg-red-500/15 text-red-300 border-red-500/25";
    case "editing":
      return "bg-violet-500/15 text-violet-300 border-violet-500/25";
    case "draft":
    default:
      return "bg-white/5 text-white/70 border-white/10";
  }
}

function getCampaignBadgeClass(status: SocialCampaignStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
    case "paused":
      return "bg-amber-500/15 text-amber-300 border-amber-500/25";
    case "completed":
      return "bg-sky-500/15 text-sky-300 border-sky-500/25";
    case "archived":
      return "bg-white/5 text-white/45 border-white/10";
    case "draft":
    default:
      return "bg-white/5 text-white/70 border-white/10";
  }
}

function getCampaignLabel(campaignMap: Record<string, SocialCampaignRecord>, campaignId?: string): string {
  if (!campaignId) return "No campaign";
  return campaignMap[campaignId]?.campaignName || campaignId;
}

function getContentTypeIcon(contentType?: ScheduledPostContentType) {
  switch (contentType) {
    case "video":
      return Video;
    case "image":
    case "carousel":
      return ImageIcon;
    case "document":
      return FileText;
    case "text":
    default:
      return FileText;
  }
}

export default function SocialCalendarPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const calendarMode = searchParams.get("mode") === "events" ? "events" : "scheduler";
  const isEventsMode = calendarMode === "events";
  const pageLabel = isEventsMode ? "Events" : "Scheduler";
  const pageTitle = isEventsMode ? "Manage live events across the month" : "Schedule content across the month";
  const pageDescription = isEventsMode
    ? "Plan and move live classes, workshops, and sessions in one visual calendar."
    : "Plan, edit, and move social content in one visual calendar. Drag a post to a new day when a reschedule makes more sense.";
  const createEntryLabel = isEventsMode ? "Create event" : "Create post";
  const emptyStateLabel = isEventsMode
    ? "Create your first scheduled event, generate a session outline in AI Studio, or connect another platform."
    : "Create your first scheduled post, generate content in AI Studio, or connect another platform.";
  const createCardHeading = isEventsMode ? "Create event" : "Create post";
  const createCardDescription = isEventsMode
    ? "Update the event details or move it to a better time."
    : "Update the content or move it to a better time.";
  const postHeadingLabel = isEventsMode ? "Event details" : "Post copy";
  const campaignSectionLabel = isEventsMode ? "Series" : "Campaigns";
  const campaignSectionHelper = isEventsMode
    ? "A quick list of this month&apos;s live event series."
    : "A quick list of the month&apos;s scheduled entries.";
  const campaignEmptyLabel = isEventsMode ? "No event series yet." : "No scheduled content for this month yet.";
  const campaignOptionalLabel = isEventsMode
    ? "Series are optional. You can organize events later."
    : "Campaigns are optional. You can organize posts later.";
  const campaignEditorLabel = isEventsMode ? "Create series" : "Create campaign";
  const campaignEditorDescription = isEventsMode
    ? "Group related live sessions under a shared series."
    : "Group related posts under a shared campaign.";
  const saveDraftLabel = isEventsMode ? "Save draft" : "Save draft";
  const scheduleLabel = isEventsMode ? "Schedule event" : "Schedule post";
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [posts, setPosts] = useState<ScheduledPostRecord[]>([]);
  const [campaigns, setCampaigns] = useState<SocialCampaignRecord[]>([]);
  const [summary, setSummary] = useState<CalendarResponse["summary"]>({
    totalPosts: 0,
    byStatus: {
      draft: 0,
      scheduled: 0,
      publishing: 0,
      published: 0,
      failed: 0,
      editing: 0,
      cancelled: 0,
    },
    byPlatform: {
      tiktok: 0,
      instagram: 0,
      facebook: 0,
      linkedin: 0,
      x: 0,
      youtube: 0,
    },
    upcomingPosts: 0,
  });
  const [campaignSummary, setCampaignSummary] = useState<CalendarCampaignListResponse["summary"]>({
    totalCampaigns: 0,
    activeCampaigns: 0,
    byStatus: {
      draft: 0,
      active: 0,
      paused: 0,
      completed: 0,
      archived: 0,
    },
    campaigns: [],
  });
  const [loading, setLoading] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignLoadingState, setCampaignLoadingState] = useState(true);
  const [studioAssets, setStudioAssets] = useState<StudioAssetSummary[]>([]);
  const [studioAssetsLoading, setStudioAssetsLoading] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [publishAttempts, setPublishAttempts] = useState<SocialPublishAttemptRecord[]>([]);
  const [publishPayload, setPublishPayload] = useState<NormalizedSocialPublishPayload | null>(null);
  const [publishReadinessLoading, setPublishReadinessLoading] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<SocialAccountRecord[]>([]);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [form, setForm] = useState<CalendarFormState>(() => buildEmptyForm(getTodayDateString()));
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(() => buildEmptyCampaignForm());

  const selectedPost = useMemo(
    () => posts.find((post) => post.scheduledPostId === selectedPostId) || null,
    [posts, selectedPostId]
  );

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.socialCampaignId === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const campaignMap = useMemo(() => {
    return campaigns.reduce<Record<string, SocialCampaignRecord>>((acc, campaign) => {
      acc[campaign.socialCampaignId] = campaign;
      return acc;
    }, {});
  }, [campaigns]);

  const filteredPosts = useMemo(() => {
    if (campaignFilter === "all") {
      return posts;
    }

    return posts.filter((post) => post.campaignId === campaignFilter);
  }, [campaignFilter, posts]);

  const postsByDay = useMemo(() => {
    return filteredPosts.reduce<Record<string, ScheduledPostRecord[]>>((acc, post) => {
      const key = format(parseISO(post.scheduledTime), "yyyy-MM-dd");
      acc[key] ||= [];
      acc[key].push(post);
      return acc;
    }, {});
  }, [filteredPosts]);

  const visibleSummary = useMemo(() => {
    const summaryByStatus: Record<ScheduledPostStatus, number> = {
      draft: 0,
      scheduled: 0,
      publishing: 0,
      published: 0,
      failed: 0,
      editing: 0,
      cancelled: 0,
    };
    const summaryByPlatform: Record<SocialPlatform, number> = {
      tiktok: 0,
      instagram: 0,
      facebook: 0,
      linkedin: 0,
      x: 0,
      youtube: 0,
    };
    filteredPosts.forEach((post) => {
      summaryByStatus[post.status] += 1;
      summaryByPlatform[post.platform] += 1;
    });
    return {
      totalPosts: filteredPosts.length,
      byStatus: summaryByStatus,
      byPlatform: summaryByPlatform,
      upcomingPosts: filteredPosts.filter((post) => post.status !== "published" && new Date(post.scheduledTime).getTime() >= Date.now()).length,
    };
  }, [filteredPosts]);

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentMonth, { weekStartsOn: 1 });
    const end = endOfWeek(currentMonth, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const agendaPosts = useMemo(() => {
    return [...filteredPosts].sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  }, [filteredPosts]);

  const upcomingAgendaPosts = useMemo(() => {
    const now = Date.now();
    return agendaPosts.filter((post) => new Date(post.scheduledTime).getTime() >= now && post.status !== "published" && post.status !== "cancelled");
  }, [agendaPosts]);

  const todaysPosts = useMemo(() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    return agendaPosts.filter((post) => format(parseISO(post.scheduledTime), "yyyy-MM-dd") === todayKey);
  }, [agendaPosts]);

  const nextScheduledPost = upcomingAgendaPosts[0] || null;

  const connectedPlatforms = useMemo(() => {
    return new Set(connectedAccounts.filter((account) => account.status === "connected").map((account) => account.providerId));
  }, [connectedAccounts]);

  const accountWarnings = useMemo(() => {
    return connectedAccounts
      .filter((account) => account.status !== "connected" || Boolean(account.lastError))
      .slice(0, 4);
  }, [connectedAccounts]);

  const contentGapDays = useMemo(() => {
    return calendarDays
      .filter((day) => isSameMonth(day, currentMonth))
      .filter((day) => {
        const key = format(day, "yyyy-MM-dd");
        return (postsByDay[key] || []).length === 0;
      })
      .slice(0, 5);
  }, [calendarDays, currentMonth, postsByDay]);

  const selectedProvider = useMemo(() => {
    return SOCIAL_PROVIDER_REGISTRY.find((provider) => provider.id === form.platform);
  }, [form.platform]);
  const selectedCapability = useMemo(() => getPlatformCapability(form.platform), [form.platform]);
  const selectedAccount = useMemo(() => {
    return connectedAccounts.find((account) => account.socialAccountId === form.connectedAccountId) || null;
  }, [connectedAccounts, form.connectedAccountId]);
  const connectedDestinations = useMemo(() => {
    return connectedAccounts.filter((account) => account.status === "connected");
  }, [connectedAccounts]);
  const selectedDestinationAccounts = useMemo(() => {
    const ids = new Set(form.destinationAccountIds.length > 0 ? form.destinationAccountIds : [form.connectedAccountId].filter(Boolean));
    return connectedDestinations.filter((account) => ids.has(account.socialAccountId));
  }, [connectedDestinations, form.connectedAccountId, form.destinationAccountIds]);
  const publishTargetAccounts = selectedPostId
    ? (selectedAccount ? [selectedAccount] : [])
    : selectedDestinationAccounts;
  const targetPlatforms = useMemo(() => {
    return Array.from(new Set(publishTargetAccounts.map((account) => account.providerId)));
  }, [publishTargetAccounts]);
  const selectedAssetIds = useMemo(() => splitAssetIds(form.assetIds), [form.assetIds]);
  const selectedAssetIdSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const studioAssetMap = useMemo(() => {
    return studioAssets.reduce<Record<string, StudioAssetSummary>>((acc, asset) => {
      acc[asset.assetId] = asset;
      return acc;
    }, {});
  }, [studioAssets]);
  const selectedAssets = useMemo(() => {
    return selectedAssetIds.map((assetId) => ({
      assetId,
      asset: studioAssetMap[assetId],
    }));
  }, [selectedAssetIds, studioAssetMap]);
  const compatibleStudioAssets = useMemo(() => {
    return studioAssets.filter((asset) => {
      if (asset.status !== "completed") return false;
      if (form.contentType === "text") return true;
      if (form.contentType === "carousel") return asset.type === "image" || asset.type === "video";
      return asset.type === form.contentType;
    });
  }, [form.contentType, studioAssets]);
  const mediaIsRequired = !isEventsMode && requiresMedia(form.platform, form.contentType);
  const allTargetsSupportFormat = publishTargetAccounts.length > 0
    ? publishTargetAccounts.every((account) => PLATFORM_CAPABILITIES[account.providerId].supportedContentTypes.includes(form.contentType))
    : selectedCapability.supportedContentTypes.includes(form.contentType);
  const anyTargetRequiresMedia = publishTargetAccounts.length > 0
    ? publishTargetAccounts.some((account) => requiresMedia(account.providerId, form.contentType))
    : mediaIsRequired;
  const canPublishToSelectedPlatform = isEventsMode
    ? connectedPlatforms.has(form.platform)
    : publishTargetAccounts.length > 0;
  const canSaveDraft = isEventsMode ? canPublishToSelectedPlatform && Boolean(form.caption.trim()) : publishTargetAccounts.length > 0;
  const canSchedulePost = isEventsMode
    ? canPublishToSelectedPlatform && Boolean(form.caption.trim())
    : canPublishToSelectedPlatform
      && allTargetsSupportFormat
      && (!anyTargetRequiresMedia || selectedAssetIds.length > 0)
      && (form.contentType !== "text" || Boolean(form.caption.trim()))
      && Boolean(form.scheduledDate && form.scheduledTime);
  const postPlaceholderLabel = isEventsMode
    ? `Describe the ${selectedProvider?.label || "event"} here...`
    : form.contentType === "text"
      ? `Write the ${selectedProvider?.label || "social"} post here...`
      : "Write the caption, hook, and supporting context here...";

  useEffect(() => {
    setSelectedPostId(null);
    setForm(buildEmptyForm(format(currentMonth, "yyyy-MM-dd")));
  }, [currentMonth]);

  const loadMonth = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const monthKey = format(currentMonth, "yyyy-MM");
    const response = await fetch(`/api/social/scheduled-posts?month=${monthKey}&limit=200`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw new Error("Could not load calendar data.");
    }

    const data = (await response.json()) as CalendarResponse;
    setPosts(data.posts || []);
    setSummary(data.summary);
  };

  const loadCampaigns = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const response = await fetch("/api/social/campaigns?limit=24", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw new Error("Could not load campaigns.");
    }

    const data = (await response.json()) as CalendarCampaignListResponse;
    setCampaigns(data.campaigns || []);
    setCampaignSummary(data.summary);
  };

  const loadConnectedAccounts = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const response = await fetch("/api/social/accounts?limit=24", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) return;
    const data = (await response.json()) as SocialAccountsResponse;
    setConnectedAccounts(data.accounts || []);
  };

  const loadStudioAssets = async () => {
    if (!user) return;

    setStudioAssetsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/studio/assets?limit=48", {
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!response.ok) return;
      const data = (await response.json()) as StudioAssetsResponse;
      setStudioAssets(data.assets || []);
    } finally {
      setStudioAssetsLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user) {
        setLoadingMonth(false);
        setCampaignLoadingState(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const monthKey = format(currentMonth, "yyyy-MM");
        const response = await fetch(`/api/social/scheduled-posts?month=${monthKey}&limit=200`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!response.ok) {
          throw new Error("Could not load calendar data.");
        }

        const data = (await response.json()) as CalendarResponse;
        if (mounted) {
          setPosts(data.posts || []);
          setSummary(data.summary);
        }
        const campaignResponse = await fetch("/api/social/campaigns?limit=24", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (campaignResponse.ok) {
          const campaignData = (await campaignResponse.json()) as CalendarCampaignListResponse;
          if (mounted) {
            setCampaigns(campaignData.campaigns || []);
            setCampaignSummary(campaignData.summary);
          }
        }
        const accountsResponse = await fetch("/api/social/accounts?limit=24", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (accountsResponse.ok) {
          const accountsData = (await accountsResponse.json()) as SocialAccountsResponse;
          if (mounted) {
            setConnectedAccounts(accountsData.accounts || []);
          }
        }
        const assetsResponse = await fetch("/api/ai/studio/assets?limit=48", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (assetsResponse.ok) {
          const assetsData = (await assetsResponse.json()) as StudioAssetsResponse;
          if (mounted) {
            setStudioAssets(assetsData.assets || []);
          }
        }
      } catch (error) {
        if (mounted) {
          toast({
            title: "Calendar unavailable",
            description: error instanceof Error ? error.message : "Could not load scheduled posts.",
            variant: "destructive",
          });
        }
      } finally {
        if (mounted) {
          setLoadingMonth(false);
          setCampaignLoadingState(false);
          setStudioAssetsLoading(false);
        }
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [currentMonth, toast, user]);

  useEffect(() => {
    if (!selectedPost) return;
    setForm(buildFormFromPost(selectedPost));
  }, [selectedPost]);

  useEffect(() => {
    if (!selectedCampaign) return;
    setCampaignForm(buildCampaignFormFromCampaign(selectedCampaign));
  }, [selectedCampaign]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!user || !selectedPostId) {
        setPublishAttempts([]);
        setPublishPayload(null);
        return;
      }

      try {
        setPublishReadinessLoading(true);
        const idToken = await user.getIdToken();
        const [attemptsResponse, payloadResponse] = await Promise.all([
          fetch(`/api/social/publish-attempts?scheduledPostId=${encodeURIComponent(selectedPostId)}&limit=8`, {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch(`/api/social/scheduled-posts/${selectedPostId}/publish-payload`, {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
        ]);

        if (attemptsResponse.ok) {
          const data = (await attemptsResponse.json()) as PublishAttemptsResponse;
          if (mounted) setPublishAttempts(data.attempts || []);
        }
        if (payloadResponse.ok) {
          const data = (await payloadResponse.json()) as PublishPayloadResponse;
          if (mounted) setPublishPayload(data.payload);
        } else if (mounted) {
          setPublishPayload(null);
        }
      } finally {
        if (mounted) setPublishReadinessLoading(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [selectedPostId, user]);

  useEffect(() => {
    if (connectedAccounts.length === 0) return;
    if (isEventsMode && connectedPlatforms.has(form.platform)) return;
    if (!isEventsMode && form.connectedAccountId && selectedAccount?.status === "connected") return;
    const firstConnected = connectedAccounts.find((account) => account.status === "connected");
    if (firstConnected) {
      setForm((current) => ({
        ...current,
        platform: firstConnected.providerId,
        connectedAccountId: firstConnected.socialAccountId,
        destinationAccountIds: [firstConnected.socialAccountId],
        contentType: getDefaultContentType(firstConnected.providerId),
      }));
    }
  }, [connectedAccounts, connectedPlatforms, form.connectedAccountId, form.platform, isEventsMode, selectedAccount?.status]);

  const updateField = <K extends keyof CalendarFormState>(key: K, value: CalendarFormState[K]) => {
    setForm((current) => {
      if (key === "platform") {
        const nextPlatform = value as SocialPlatform;
        const nextAccount = connectedAccounts.find((account) => account.status === "connected" && account.providerId === nextPlatform);
        return {
          ...current,
          platform: nextPlatform,
          connectedAccountId: nextAccount?.socialAccountId || "",
          destinationAccountIds: nextAccount ? [nextAccount.socialAccountId] : [],
          contentType: getDefaultContentType(nextPlatform),
        };
      }
      return { ...current, [key]: value };
    });
  };

  const updateCampaignField = <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) => {
    setCampaignForm((current) => ({ ...current, [key]: value }));
  };

  const updateSelectedAssetIds = (assetIds: string[]) => {
    updateField("assetIds", assetIds.join(", "));
  };

  const moveSelectedAsset = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= selectedAssetIds.length) return;
    const nextIds = [...selectedAssetIds];
    const [moved] = nextIds.splice(index, 1);
    nextIds.splice(nextIndex, 0, moved);
    updateSelectedAssetIds(nextIds);
  };

  const removeSelectedAsset = (assetId: string) => {
    updateSelectedAssetIds(selectedAssetIds.filter((currentAssetId) => currentAssetId !== assetId));
  };

  const updateDestinationCaption = (accountId: string, value: string) => {
    setForm((current) => ({
      ...current,
      destinationCaptions: {
        ...current.destinationCaptions,
        [accountId]: value,
      },
    }));
  };

  const clearForm = () => {
    setSelectedPostId(null);
    setForm(buildEmptyForm(format(currentMonth, "yyyy-MM-dd")));
  };

  const clearCampaignForm = () => {
    setSelectedCampaignId(null);
    setCampaignForm(buildEmptyCampaignForm());
  };

  const handleMediaUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast({
        title: "Unsupported file",
        description: "Upload an image or video file.",
        variant: "destructive",
      });
      return;
    }

    const maxBytes = isImage ? IMAGE_UPLOAD_MAX_BYTES : VIDEO_UPLOAD_MAX_BYTES;
    if (file.size > maxBytes) {
      toast({
        title: "File too large",
        description: `${isImage ? "Images" : "Videos"} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`,
        variant: "destructive",
      });
      return;
    }

    if (isVideo && form.contentType !== "video") {
      updateField("contentType", "video");
    }
    if (isImage && form.contentType === "video") {
      updateField("contentType", "image");
    }

    try {
      setMediaUploading(true);
      const idToken = await user.getIdToken();
      const payload = new FormData();
      payload.append("file", file);
      payload.append("title", file.name.replace(/\.[^.]+$/, ""));

      const response = await fetch("/api/ai/studio/assets/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: payload,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(errorData.error || "Upload failed.");
      }

      const data = (await response.json()) as StudioAssetUploadResponse;
      setStudioAssets((current) => [data.asset, ...current.filter((asset) => asset.assetId !== data.asset.assetId)]);
      setForm((current) => {
        const assetIds = splitAssetIds(current.assetIds);
        const nextIds = assetIds.includes(data.asset.assetId) ? assetIds : [...assetIds, data.asset.assetId];
        return {
          ...current,
          assetIds: nextIds.join(", "),
        };
      });

      toast({
        title: "Media uploaded",
        description: "The asset has been attached to this scheduled post.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not upload media.",
        variant: "destructive",
      });
    } finally {
      setMediaUploading(false);
    }
  };

  const refreshCalendar = async () => {
    try {
      setLoading(true);
      await Promise.all([loadMonth(), loadConnectedAccounts(), loadStudioAssets()]);
      toast({
        title: "Calendar refreshed",
        description: "The latest scheduled content is loaded.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Could not refresh the calendar.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshCampaigns = async () => {
    try {
      setCampaignLoading(true);
      await loadCampaigns();
      toast({
        title: "Campaigns refreshed",
        description: "The latest campaign list is loaded.",
      });
    } catch (error) {
      toast({
        title: "Campaign refresh failed",
        description: error instanceof Error ? error.message : "Could not refresh campaigns.",
        variant: "destructive",
      });
    } finally {
      setCampaignLoading(false);
    }
  };

  const savePost = async (nextStatus: ScheduledPostStatus = form.status) => {
    if (!user || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const groupId = form.publicationGroupId || createPublicationGroupId();
      const targetAccounts = selectedPostId
        ? (selectedAccount ? [selectedAccount] : [])
        : publishTargetAccounts;

      if (!isEventsMode && targetAccounts.length === 0) {
        throw new Error("Choose at least one connected destination account.");
      }

      const basePayload = {
        title: form.title || undefined,
        status: nextStatus,
        scheduledTime: combineDateAndTime(form.scheduledDate, form.scheduledTime),
        assetIds: selectedAssetIds,
        hashtags: splitHashtags(form.hashtags),
        cta: form.cta || undefined,
        publicationGroupId: groupId,
        contentType: form.contentType,
        campaignId: form.campaignId || undefined,
        notes: form.notes || undefined,
        timezone: form.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
        metadata: { calendarMode },
      };

      const requests = (isEventsMode ? [{ providerId: form.platform, socialAccountId: form.connectedAccountId || undefined }] : targetAccounts).map((account) => {
        const platform = account.providerId as SocialPlatform;
        const accountId = account.socialAccountId || "";
        const contentType = PLATFORM_CAPABILITIES[platform].supportedContentTypes.includes(form.contentType)
          ? form.contentType
          : getDefaultContentType(platform);
        const payload = {
          ...basePayload,
          platform,
          socialAccountId: accountId || undefined,
          connectedAccountId: accountId || undefined,
          caption: (accountId && form.destinationCaptions[accountId]) || form.caption,
          contentType,
          platformSettings: buildPlatformSettings(platform, form),
        };

        return fetch(selectedPostId ? `/api/social/scheduled-posts/${selectedPostId}` : "/api/social/scheduled-posts", {
          method: selectedPostId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(payload),
        });
      });

      const responses = await Promise.all(requests);
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        const errorData = await failedResponse.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Could not save scheduled post.");
      }

      const data = (await responses[0].json()) as CalendarPostResponse;
      setSelectedPostId(data.post.scheduledPostId);
      setForm((current) => ({ ...current, status: data.post.status, publicationGroupId: groupId }));
      await loadMonth();
      toast({
        title: nextStatus === "scheduled" ? "Post scheduled" : "Draft saved",
        description: nextStatus === "scheduled"
          ? `${responses.length} destination${responses.length === 1 ? "" : "s"} added to the calendar.`
          : "Your draft is saved in the calendar.",
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save the calendar entry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await savePost(form.status);
  };

  const handleCampaignSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || campaignLoading) return;

    try {
      setCampaignLoading(true);
      const idToken = await user.getIdToken();
      const payload = {
        campaignName: campaignForm.campaignName,
        platform: campaignForm.platform || undefined,
        status: campaignForm.status,
        goal: campaignForm.goal || undefined,
        startDate: campaignForm.startDate || undefined,
        endDate: campaignForm.endDate || undefined,
        notes: campaignForm.notes || undefined,
        color: campaignForm.color || undefined,
      };

      const response = await fetch(selectedCampaignId ? `/api/social/campaigns/${selectedCampaignId}` : "/api/social/campaigns", {
        method: selectedCampaignId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Could not save campaign.");
      }

      const data = (await response.json()) as CalendarCampaignResponse;
      setSelectedCampaignId(data.campaign.socialCampaignId);
      await loadCampaigns();
      toast({
        title: "Campaign saved",
        description: "The campaign editor has been updated.",
      });
    } catch (error) {
      toast({
        title: "Campaign save failed",
        description: error instanceof Error ? error.message : "Could not save the campaign.",
        variant: "destructive",
      });
    } finally {
      setCampaignLoading(false);
    }
  };

  const deleteCampaign = async () => {
    if (!user || !selectedCampaignId || campaignLoading) return;

    try {
      setCampaignLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/campaigns/${selectedCampaignId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Could not delete campaign.");
      }

      clearCampaignForm();
      await loadCampaigns();
      toast({
        title: "Campaign removed",
        description: "The campaign has been deleted.",
      });
    } catch (error) {
      toast({
        title: "Campaign delete failed",
        description: error instanceof Error ? error.message : "Could not remove the campaign.",
        variant: "destructive",
      });
    } finally {
      setCampaignLoading(false);
    }
  };

  const deletePost = async () => {
    if (!user || !selectedPostId || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/scheduled-posts/${selectedPostId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Could not delete scheduled post.");
      }

      clearForm();
      await loadMonth();
      toast({
        title: "Scheduled post removed",
        description: "The calendar entry has been deleted.",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Could not remove the calendar entry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const movePostToDay = async (postId: string, day: string) => {
    if (!user || loading) return;
    const post = posts.find((item) => item.scheduledPostId === postId);
    if (!post || !canDragScheduledPost(post)) return;
    const previousPosts = posts;
    const nextScheduledTime = combineDateAndTime(day, format(parseISO(post.scheduledTime), "HH:mm"));

    try {
      setLoading(true);
      setPosts((current) => current.map((item) => (
        item.scheduledPostId === postId
          ? { ...item, scheduledTime: nextScheduledTime }
          : item
      )));
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/scheduled-posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          moveOnly: true,
          scheduledTime: nextScheduledTime,
        }),
      });

      if (!response.ok) {
        setPosts(previousPosts);
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Could not move scheduled post.");
      }

      await loadMonth();
      toast({
        title: "Post moved",
        description: "The scheduled time has been updated.",
      });
    } catch (error) {
      setPosts(previousPosts);
      toast({
        title: "Move failed",
        description: error instanceof Error ? error.message : "Could not move the post.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDropOnDay = async (postId: string, day: string) => {
    setDragOverDay(null);
    await movePostToDay(postId, day);
  };

  const dayPosts = (day: Date): ScheduledPostRecord[] => {
    const key = format(day, "yyyy-MM-dd");
    return postsByDay[key] || [];
  };

  const renderPostCard = (post: ScheduledPostRecord, compact = false) => {
    const ContentIcon = getContentTypeIcon(post.contentType);
    const captionSnippet = post.title || post.caption || `${post.contentType || "Content"} post`;
    const canDrag = canDragScheduledPost(post);
    const previewAsset = getPostPreviewAsset(post, studioAssetMap);
    const previewUrl = previewAsset?.thumbnail || previewAsset?.downloadUrl;

    return (
      <div
        key={post.scheduledPostId}
        draggable={canDrag}
        onDragStart={(event) => {
          if (!canDrag) return;
          event.stopPropagation();
          event.dataTransfer.setData("text/plain", post.scheduledPostId);
        }}
        onClick={(event) => {
          event.stopPropagation();
          setSelectedPostId(post.scheduledPostId);
        }}
        className={cn(
          "group overflow-hidden rounded-[14px] border text-xs shadow-sm transition-transform hover:-translate-y-0.5",
          post.status === "published"
            ? "border-emerald-500/20 bg-emerald-500/10"
            : post.status === "failed"
              ? "border-red-500/20 bg-red-500/10"
              : "border-white/10 bg-black/25",
          compact ? "p-3" : "p-2"
        )}
      >
        <div className="flex items-start gap-2">
          <div className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-white/10 bg-white/[0.05] text-primary",
            compact ? "h-16 w-20" : "h-10 w-12"
          )}>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ContentIcon className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>{format(parseISO(post.scheduledTime), "HH:mm")}</span>
              <span>·</span>
              <span>{post.platform}</span>
              <span>·</span>
              <span>{post.contentType || "text"}</span>
            </div>
            <div className="mt-1 truncate font-medium text-white">{captionSnippet}</div>
            <div className="mt-1 truncate text-[10px] text-muted-foreground">
              {getCampaignLabel(campaignMap, post.campaignId)}
            </div>
            {compact && post.caption ? (
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/70">{post.caption}</div>
            ) : null}
            {compact ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn("border px-1.5 py-0 text-[10px]", getPostBadgeClass(post.status))}>
                  {STATUS_LABELS[post.status]}
                </Badge>
                {post.assetIds.length > 0 ? (
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {post.assetIds.length} asset{post.assetIds.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          {canDrag ? <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /> : null}
        </div>
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <CalendarDays className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-[0.24em]">{pageLabel}</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">{pageTitle}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {pageDescription}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-md border border-white/10 bg-white/5 p-1">
                {(["month", "week", "agenda"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    variant={viewMode === mode ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode(mode)}
                    className="h-8 px-3"
                  >
                    {mode === "month" ? "Month" : mode === "week" ? "Week" : "Agenda"}
                  </Button>
                ))}
              </div>
              <select
                className={cn("h-9 rounded-md border border-input bg-background px-3 text-sm")}
                value={campaignFilter}
                onChange={(event) => setCampaignFilter(event.target.value)}
                aria-label="Filter calendar by campaign"
              >
                <option value="all">All campaigns</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.socialCampaignId} value={campaign.socialCampaignId}>
                    {campaign.campaignName}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(startOfMonth(new Date()))}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={refreshCalendar} disabled={loading || loadingMonth}>
                {loadingMonth ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <GlassCard className="p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Posts</div>
              <div className="mt-2 text-2xl font-semibold">{visibleSummary.totalPosts}</div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Upcoming</div>
              <div className="mt-2 text-2xl font-semibold">{visibleSummary.upcomingPosts}</div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Scheduled</div>
              <div className="mt-2 text-2xl font-semibold">{visibleSummary.byStatus.scheduled}</div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Needs review</div>
              <div className="mt-2 text-2xl font-semibold">{visibleSummary.byStatus.failed + visibleSummary.byStatus.editing}</div>
            </GlassCard>
          </div>

          {!loadingMonth && connectedAccounts.length > 0 && posts.length === 0 ? (
            <GlassCard className="p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Your calendar is ready</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {emptyStateLabel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => clearForm()} className="rounded-[16px]">
                    <Plus className="h-4 w-4" />
                    {createEntryLabel}
                  </Button>
                  <Button asChild variant="outline" className="rounded-[16px]">
                    <Link href="/ai/studio">Generate with AI</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-[16px]">
                    <Link href="/social">Connect platform</Link>
                  </Button>
                </div>
              </div>
            </GlassCard>
          ) : null}

          {!isEventsMode ? (
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <GlassCard className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Publishing plan</div>
                    <h2 className="mt-2 text-lg font-semibold text-white">Today&apos;s content workspace</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Review what is due today, spot empty days, and jump into AI-assisted creation without leaving the scheduler.
                    </p>
                  </div>
                  <div className="grid min-w-[220px] grid-cols-2 gap-2 text-center">
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xl font-semibold text-white">{todaysPosts.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Today</div>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xl font-semibold text-white">{contentGapDays.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Open days</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-[18px] border border-white/10 bg-white/[0.025] p-4">
                    <div className="text-sm font-medium text-white">Next scheduled post</div>
                    {nextScheduledPost ? (
                      <button
                        type="button"
                        onClick={() => setSelectedPostId(nextScheduledPost.scheduledPostId)}
                        className="mt-3 w-full rounded-[14px] border border-white/10 bg-black/20 p-3 text-left transition hover:border-primary/40"
                      >
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {format(parseISO(nextScheduledPost.scheduledTime), "EEE, MMM d · HH:mm")}
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm font-medium text-white">
                          {nextScheduledPost.title || nextScheduledPost.caption || "Scheduled content"}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {nextScheduledPost.platform} · {nextScheduledPost.contentType || "text"}
                        </div>
                      </button>
                    ) : (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">No upcoming scheduled posts yet.</p>
                    )}
                  </div>

                  <div className="rounded-[18px] border border-white/10 bg-white/[0.025] p-4">
                    <div className="text-sm font-medium text-white">Content gaps</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {contentGapDays.length > 0 ? contentGapDays.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setSelectedPostId(null);
                              setForm(buildEmptyForm(key));
                            }}
                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-white"
                          >
                            {format(day, "MMM d")}
                          </button>
                        );
                      }) : (
                        <p className="text-sm leading-6 text-muted-foreground">This month has coverage on every day in view.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-white/10 bg-white/[0.025] p-4">
                    <div className="text-sm font-medium text-white">Soma AI actions</div>
                    <div className="mt-3 grid gap-2">
                      <Button asChild size="sm" variant="outline" className="justify-start rounded-[14px]">
                        <Link href="/ai-studio">Write caption</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="justify-start rounded-[14px]">
                        <Link href="/ai-studio">Repurpose recent asset</Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="justify-start rounded-[14px]">
                        <Link href="/ai-studio">Fill content gap</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Workspace signals</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Assets and account issues that may affect scheduling.</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent assets</div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {studioAssets.slice(0, 6).map((asset) => (
                        <button
                          key={asset.assetId}
                          type="button"
                          onClick={() => {
                            const assetIds = splitAssetIds(form.assetIds);
                            if (!assetIds.includes(asset.assetId)) {
                              updateSelectedAssetIds([...assetIds, asset.assetId]);
                            }
                          }}
                          className="group aspect-video overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.04] transition hover:border-primary/40"
                          title={asset.title}
                        >
                          {asset.thumbnail || asset.downloadUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={asset.thumbnail || asset.downloadUrl} alt="" className="h-full w-full object-cover opacity-85 transition group-hover:opacity-100" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    {studioAssets.length === 0 ? (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">No generated or uploaded assets yet.</p>
                    ) : null}
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Account warnings</div>
                    <div className="mt-3 space-y-2">
                      {accountWarnings.length > 0 ? accountWarnings.map((account) => (
                        <div key={account.socialAccountId} className="rounded-[14px] border border-amber-500/20 bg-amber-500/10 p-3">
                          <div className="text-sm font-medium text-amber-100">{account.providerLabel} · {getAccountDisplayLabel(account)}</div>
                          <div className="mt-1 text-xs text-amber-200/80">
                            {account.lastError || `Status: ${account.status}`}
                          </div>
                        </div>
                      )) : (
                        <p className="text-sm leading-6 text-muted-foreground">Connected accounts look healthy.</p>
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="space-y-4">
              <GlassCard className="p-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {viewMode === "month" ? format(currentMonth, "MMMM yyyy") : viewMode === "week" ? "Week view" : "Agenda"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {viewMode === "month"
                        ? "Drag posts onto a different day to reschedule them."
                        : viewMode === "week"
                          ? "A denser seven-day view for team coordination."
                          : "A linear agenda for fast scanning and same-day planning."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <GripVertical className="h-3.5 w-3.5" />
                      Drag
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                      Move
                    </span>
                  </div>
                </div>

                {viewMode === "month" ? (
                  <>
                    <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                        <div key={day} className="py-2">{day}</div>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-2">
                      {calendarDays.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const items = dayPosts(day);
                        const selected = isToday(day);
                        const inMonth = isSameMonth(day, currentMonth);

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              setSelectedPostId(null);
                              setForm(buildEmptyForm(key));
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setDragOverDay(key);
                            }}
                            onDragLeave={() => {
                              if (dragOverDay === key) {
                                setDragOverDay(null);
                              }
                            }}
                            onDrop={async (event) => {
                              event.preventDefault();
                              const postId = event.dataTransfer.getData("text/plain");
                              if (postId) {
                                await handleDropOnDay(postId, key);
                              }
                            }}
                            className={cn(
                              "min-h-[190px] rounded-[16px] border p-2 text-left transition-colors",
                              inMonth ? "border-white/10 bg-white/5" : "border-white/5 bg-white/2 text-white/35",
                              selected && "ring-1 ring-primary/40",
                              dragOverDay === key && "border-primary/40 bg-primary/10"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className={cn("text-sm font-medium", selected && "text-primary")}>
                                {format(day, "d")}
                              </span>
                              {items.length > 0 ? (
                                <span className="rounded-full border border-white/10 bg-black/20 px-1.5 py-0.5 text-[10px] text-white/70">
                                  {items.length}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 space-y-1">
                              {items.slice(0, 2).map((post) => renderPostCard(post))}
                              {items.length > 2 ? (
                                <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                  +{items.length - 2} more
                                </div>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : viewMode === "week" ? (
                  <div className="grid gap-2 xl:grid-cols-7">
                    {weekDays.map((day) => {
                      const key = format(day, "yyyy-MM-dd");
                      const items = dayPosts(day);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setSelectedPostId(null);
                            setForm(buildEmptyForm(key));
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverDay(key);
                          }}
                          onDrop={async (event) => {
                            event.preventDefault();
                            const postId = event.dataTransfer.getData("text/plain");
                            if (postId) {
                              await handleDropOnDay(postId, key);
                            }
                          }}
                          className={cn(
                            "min-h-[320px] rounded-[18px] border border-white/10 bg-white/5 p-3 text-left transition-colors",
                            dragOverDay === key && "border-primary/40 bg-primary/10"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{format(day, "EEE")}</div>
                              <div className={cn("text-base font-medium", isToday(day) && "text-primary")}>{format(day, "d")}</div>
                            </div>
                            <Badge variant="outline" className="border-white/10 bg-black/20 text-[10px] uppercase tracking-[0.16em]">
                              {items.length}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-2">
                            {items.length > 0 ? items.map((post) => renderPostCard(post, true)) : (
                              <div className="rounded-[14px] border border-dashed border-white/10 px-3 py-8 text-center text-xs text-muted-foreground">
                                Drop a post here
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {agendaPosts.length > 0 ? agendaPosts.map((post) => {
                      const dateLabel = format(parseISO(post.scheduledTime), "EEE, MMM d");
                      const previewAsset = getPostPreviewAsset(post, studioAssetMap);
                      const previewUrl = previewAsset?.thumbnail || previewAsset?.downloadUrl;
                      const ContentIcon = getContentTypeIcon(post.contentType);
                      const canDrag = canDragScheduledPost(post);
                      return (
                        <button
                          key={post.scheduledPostId}
                          type="button"
                          onClick={() => setSelectedPostId(post.scheduledPostId)}
                          draggable={canDrag}
                          onDragStart={(event) => {
                            if (!canDrag) return;
                            event.dataTransfer.setData("text/plain", post.scheduledPostId);
                          }}
                          className={cn(
                            "grid w-full gap-4 rounded-[18px] border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-primary/30 md:grid-cols-[140px_1fr]",
                            post.status === "published" && "bg-emerald-500/5",
                            post.status === "failed" && "bg-red-500/5"
                          )}
                        >
                          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-[16px] border border-white/10 bg-black/30">
                            {previewUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <ContentIcon className="h-6 w-6 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{post.title || post.caption.slice(0, 72) || "Untitled post"}</span>
                              <Badge variant="outline" className={cn("border px-1.5 py-0 text-[10px] uppercase tracking-[0.16em]", getPostBadgeClass(post.status))}>
                                {STATUS_LABELS[post.status]}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {dateLabel} · {format(parseISO(post.scheduledTime), "HH:mm")} · {post.platform} · {post.contentType || "text"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getCampaignLabel(campaignMap, post.campaignId)}
                            </div>
                            <div className="line-clamp-2 text-sm text-white/80">{post.caption}</div>
                            {post.assetIds.length > 0 ? (
                              <div className="text-xs text-muted-foreground">{post.assetIds.length} attached asset{post.assetIds.length === 1 ? "" : "s"}</div>
                            ) : null}
                          </div>
                        </button>
                      );
                    }) : (
                      <div className="rounded-md border border-dashed border-white/10 p-6 text-sm text-muted-foreground">
                        No posts match the current filters.
                      </div>
                    )}
                  </div>
                )}
              </GlassCard>

              <GlassCard className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Status breakdown</h3>
                    <p className="text-sm text-muted-foreground">Month totals by lifecycle state.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-5">
                  {SCHEDULED_POST_STATUSES.map((status) => (
                    <div key={status} className={cn("rounded-md border p-3", getPostBadgeClass(status))}>
                      <div className="text-xs uppercase tracking-[0.16em]">{STATUS_LABELS[status]}</div>
                      <div className="mt-1 text-xl font-semibold text-white">{summary.byStatus[status]}</div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </section>

            <aside className="space-y-6">
              <GlassCard className="overflow-hidden p-0">
                <div className="border-b border-white/10 bg-gradient-to-br from-[#151A2E] to-[#090B13] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{selectedPost ? (isEventsMode ? "Edit event" : "Edit post") : createCardHeading}</h2>
                      <p className="text-sm text-muted-foreground">
                        {selectedPost
                          ? createCardDescription
                          : isEventsMode
                            ? "Write once, choose a platform, and schedule the session."
                            : "Write once, choose a platform, and schedule it."}
                      </p>
                    </div>
                    <PencilLine className="h-5 w-5 text-primary" />
                  </div>
                </div>

                {connectedAccounts.length === 0 ? (
                  <div className="m-5 rounded-[18px] border border-dashed border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-sm font-semibold text-white">Connect an account first</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Connect Instagram, TikTok, YouTube, Facebook, LinkedIn, or X before scheduling live posts.
                    </p>
                    <Button asChild className="mt-4 rounded-[16px]">
                      <Link href="/social">Connect social account</Link>
                    </Button>
                  </div>
                ) : null}

                <form className="space-y-5 p-5" onSubmit={handleSubmit}>
                  {isEventsMode ? (
                    <div className="space-y-3">
                      <label className="text-sm font-medium">Choose platform</label>
                      <div className="grid grid-cols-2 gap-2">
                        {SOCIAL_PROVIDER_REGISTRY.map((provider) => {
                          const connected = connectedPlatforms.has(provider.id);
                          const active = form.platform === provider.id;
                          return (
                            <button
                              key={provider.id}
                              type="button"
                              onClick={() => updateField("platform", provider.id)}
                              disabled={!connected}
                              className={cn(
                                "rounded-[16px] border p-3 text-left text-sm transition",
                                active ? "border-primary/60 bg-primary/15 text-white" : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]",
                                !connected && "cursor-not-allowed opacity-45"
                              )}
                            >
                              <span className="block font-medium">{provider.label}</span>
                              <span className="mt-1 block text-[11px]">{connected ? "Connected" : "Not connected"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <>
                      <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-medium">1. Destination</label>
                          {selectedPost ? <span className="text-xs text-muted-foreground">Editing one destination</span> : null}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {connectedDestinations.map((account) => {
                            const provider = SOCIAL_PROVIDER_REGISTRY.find((item) => item.id === account.providerId);
                            const active = selectedPost
                              ? form.connectedAccountId === account.socialAccountId
                              : form.destinationAccountIds.includes(account.socialAccountId);
                            return (
                              <button
                                key={account.socialAccountId}
                                type="button"
                                onClick={() => {
                                  if (selectedPost) {
                                    setForm((current) => ({
                                      ...current,
                                      platform: account.providerId,
                                      connectedAccountId: account.socialAccountId,
                                      destinationAccountIds: [account.socialAccountId],
                                      contentType: PLATFORM_CAPABILITIES[account.providerId].supportedContentTypes.includes(current.contentType)
                                        ? current.contentType
                                        : getDefaultContentType(account.providerId),
                                    }));
                                    return;
                                  }

                                  setForm((current) => {
                                    const exists = current.destinationAccountIds.includes(account.socialAccountId);
                                    const nextIds = exists
                                      ? current.destinationAccountIds.filter((id) => id !== account.socialAccountId)
                                      : [...current.destinationAccountIds, account.socialAccountId];
                                    const primaryAccount = nextIds.length > 0
                                      ? connectedDestinations.find((item) => item.socialAccountId === nextIds[0])
                                      : account;
                                    return {
                                      ...current,
                                      destinationAccountIds: nextIds,
                                      connectedAccountId: primaryAccount?.socialAccountId || "",
                                      platform: primaryAccount?.providerId || account.providerId,
                                      contentType: primaryAccount && PLATFORM_CAPABILITIES[primaryAccount.providerId].supportedContentTypes.includes(current.contentType)
                                        ? current.contentType
                                        : getDefaultContentType(primaryAccount?.providerId || account.providerId),
                                    };
                                  });
                                }}
                                className={cn(
                                  "rounded-[16px] border p-3 text-left transition",
                                  active ? "border-primary/60 bg-primary/15 text-white" : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]"
                                )}
                              >
                                <span className="block text-sm font-medium">{provider?.label || account.providerLabel}</span>
                                <span className="mt-1 block truncate text-sm text-white">{getAccountDisplayLabel(account)}</span>
                                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{account.accountName}</span>
                                <span className="mt-2 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">Connected</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>

                      <section className="space-y-3">
                        <label className="text-sm font-medium">2. Format</label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {selectedCapability.supportedContentTypes.map((contentType) => {
                            const FormatIcon = getContentTypeIcon(contentType);
                            const active = form.contentType === contentType;
                            return (
                              <button
                                key={contentType}
                                type="button"
                                onClick={() => updateField("contentType", contentType)}
                                className={cn(
                                  "flex items-center gap-2 rounded-[16px] border px-3 py-3 text-left text-sm capitalize transition",
                                  active ? "border-primary/60 bg-primary/15 text-white" : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]"
                                )}
                              >
                                <FormatIcon className="h-4 w-4" />
                                {contentType}
                              </button>
                            );
                          })}
                        </div>
                        {!allTargetsSupportFormat ? (
                          <p className="text-xs leading-5 text-amber-300">One selected destination does not support this format. Choose a compatible format or destination.</p>
                        ) : null}
                      </section>

                      <section className="space-y-3 rounded-[18px] border border-white/10 bg-white/[0.025] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-medium">3. Media</label>
                          {anyTargetRequiresMedia ? <span className="text-xs text-amber-300">Required</span> : <span className="text-xs text-muted-foreground">Optional</span>}
                        </div>
                        <div className="rounded-[18px] border border-dashed border-white/10 bg-black/20 p-4">
                          {selectedAssets.length > 0 ? (
                            <div className="space-y-3">
                              {selectedAssets.map(({ assetId, asset }, index) => {
                                const isVideoAsset = asset?.type === "video" || asset?.mimeType?.startsWith("video/");
                                const previewUrl = asset?.thumbnail || asset?.downloadUrl;
                                return (
                                  <div key={`${assetId}-${index}`} className="grid gap-3 rounded-[16px] border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[120px_1fr]">
                                    <div className="flex aspect-video items-center justify-center overflow-hidden rounded-[14px] border border-white/10 bg-black/30">
                                      {isVideoAsset && asset?.downloadUrl ? (
                                        <video src={asset.downloadUrl} className="h-full w-full object-cover" muted controls preload="metadata" />
                                      ) : previewUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-medium text-white">{getAssetPreviewLabel(asset, assetId)}</div>
                                          <div className="mt-1 truncate text-xs text-muted-foreground">
                                            {asset?.type || "asset"} · {assetId}
                                          </div>
                                        </div>
                                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                          {index + 1}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => moveSelectedAsset(index, -1)} className="h-8 rounded-[12px]">
                                          <ArrowUp className="h-3.5 w-3.5" />
                                          Move up
                                        </Button>
                                        <Button type="button" size="sm" variant="outline" disabled={index === selectedAssets.length - 1} onClick={() => moveSelectedAsset(index, 1)} className="h-8 rounded-[12px]">
                                          <ArrowDown className="h-3.5 w-3.5" />
                                          Move down
                                        </Button>
                                        <Button type="button" size="sm" variant="ghost" onClick={() => removeSelectedAsset(assetId)} className="h-8 rounded-[12px] text-red-300 hover:text-red-200">
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-2 text-sm text-muted-foreground">
                              <p>{anyTargetRequiresMedia ? "Attach a completed AI Studio asset before scheduling this format." : "Attach media from AI Studio when this post needs visuals or video."}</p>
                              <div className="flex flex-wrap gap-2">
                                <Button asChild size="sm" variant="outline" className="rounded-[14px]">
                                  <Link href="/ai/image-studio">Generate image</Link>
                                </Button>
                                <Button asChild size="sm" variant="outline" className="rounded-[14px]">
                                  <Link href="/ai/video-studio">Generate video</Link>
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => loadStudioAssets()} className="rounded-[14px]">
                                  Find recent asset
                                </Button>
                                <Button asChild size="sm" variant="ghost" className="rounded-[14px]">
                                  <Link href="/ai-studio">Repurpose existing content</Link>
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.025] p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-sm font-medium text-white">Upload media</div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                Images up to 10 MB. Videos up to 100 MB. Supported: JPG, PNG, WebP, GIF, MP4, WebM, MOV.
                              </p>
                            </div>
                            <label className={cn(
                              "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-4 text-sm font-medium transition hover:bg-white/[0.08]",
                              mediaUploading && "pointer-events-none opacity-60"
                            )}>
                              {mediaUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                              {mediaUploading ? "Uploading" : "Choose file"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                                className="sr-only"
                                disabled={mediaUploading}
                                onChange={handleMediaUpload}
                              />
                            </label>
                          </div>
                        </div>
                        <Input
                          value={form.assetIds}
                          onChange={(event) => updateField("assetIds", event.target.value)}
                          placeholder="Paste generated asset IDs, comma-separated. Order is used for carousels."
                          className="rounded-[16px] border-white/10 bg-white/[0.03]"
                        />
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Recent AI Studio assets</span>
                            {studioAssetsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
                          </div>
                          {compatibleStudioAssets.length > 0 ? (
                            <div className="grid gap-2">
                              {compatibleStudioAssets.slice(0, 6).map((asset) => {
                                const active = selectedAssetIdSet.has(asset.assetId);
                                return (
                                  <button
                                    key={asset.assetId}
                                    type="button"
                                    onClick={() => {
                                      const nextIds = active
                                        ? selectedAssetIds.filter((assetId) => assetId !== asset.assetId)
                                        : [...selectedAssetIds, asset.assetId];
                                      updateField("assetIds", nextIds.join(", "));
                                    }}
                                    className={cn(
                                      "flex items-center gap-3 rounded-[14px] border p-2 text-left transition",
                                      active ? "border-primary/60 bg-primary/15" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                                    )}
                                  >
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-white/10 bg-white/[0.04]">
                                      {asset.thumbnail ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-sm font-medium text-white">{asset.title}</div>
                                      <div className="truncate text-xs text-muted-foreground">{asset.type} · {asset.assetId}</div>
                                    </div>
                                    <span className={cn("rounded-full px-2 py-0.5 text-[10px]", active ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground")}>
                                      {active ? "Selected" : "Add"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs leading-5 text-muted-foreground">
                              No completed {form.contentType === "carousel" ? "image or video" : form.contentType} assets found yet.
                            </p>
                          )}
                        </div>
                      </section>
                    </>
                  )}

                  <section className="space-y-3">
                    <label className="text-sm font-medium">{isEventsMode ? postHeadingLabel : "4. Caption"}</label>
                    <Textarea
                      value={form.caption}
                      onChange={(event) => updateField("caption", event.target.value)}
                      rows={isEventsMode ? 7 : 6}
                      placeholder={postPlaceholderLabel}
                      className="rounded-[16px] border-white/10 bg-white/[0.03]"
                    />
                    {!isEventsMode ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Hash className="h-3.5 w-3.5" /> Hashtags</label>
                            <Input value={form.hashtags} onChange={(event) => updateField("hashtags", event.target.value)} placeholder="#marketing #launch" className="rounded-[16px] border-white/10 bg-white/[0.03]" />
                          </div>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Megaphone className="h-3.5 w-3.5" /> Call to action</label>
                            <Input value={form.cta} onChange={(event) => updateField("cta", event.target.value)} placeholder="Follow for more, book a call, join the waitlist..." className="rounded-[16px] border-white/10 bg-white/[0.03]" />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild type="button" size="sm" variant="outline" className="rounded-[14px]">
                            <Link href="/ai-studio">Write caption</Link>
                          </Button>
                          <Button asChild type="button" size="sm" variant="ghost" className="rounded-[14px]">
                            <Link href="/ai-studio">Shorten</Link>
                          </Button>
                          <Button asChild type="button" size="sm" variant="ghost" className="rounded-[14px]">
                            <Link href="/ai-studio">Add hook</Link>
                          </Button>
                          <Button asChild type="button" size="sm" variant="ghost" className="rounded-[14px]">
                            <Link href="/ai-studio">Add CTA</Link>
                          </Button>
                          <Button asChild type="button" size="sm" variant="ghost" className="rounded-[14px]">
                            <Link href="/ai-studio">Generate hashtags</Link>
                          </Button>
                          <Button asChild type="button" size="sm" variant="ghost" className="rounded-[14px]">
                            <Link href="/ai-studio">Adapt for platform</Link>
                          </Button>
                        </div>
                        {publishTargetAccounts.length > 1 ? (
                          <div className="space-y-3 rounded-[18px] border border-white/10 bg-white/[0.025] p-4">
                            <div>
                              <div className="text-sm font-medium text-white">Destination captions</div>
                              <p className="mt-1 text-xs text-muted-foreground">Leave a field empty to use the main caption for that account.</p>
                            </div>
                            {publishTargetAccounts.map((account) => (
                              <div key={account.socialAccountId} className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground">
                                  {account.providerLabel} · {getAccountDisplayLabel(account)}
                                </label>
                                <Textarea
                                  value={form.destinationCaptions[account.socialAccountId] || ""}
                                  onChange={(event) => updateDestinationCaption(account.socialAccountId, event.target.value)}
                                  rows={3}
                                  placeholder={`Custom ${account.providerLabel} caption`}
                                  className="rounded-[16px] border-white/10 bg-white/[0.03]"
                                />
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </section>

                  {!isEventsMode && targetPlatforms.length > 0 ? (
                    <section className="space-y-3 rounded-[18px] border border-white/10 bg-white/[0.025] p-4">
                      <div>
                        <label className="text-sm font-medium">Platform settings</label>
                        <p className="mt-1 text-xs text-muted-foreground">These prepare the post for native publishing rules later.</p>
                      </div>
                      {targetPlatforms.includes("tiktok") ? (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">TikTok privacy</label>
                          <select
                            value={form.tiktokPrivacy}
                            onChange={(event) => updateField("tiktokPrivacy", event.target.value as CalendarFormState["tiktokPrivacy"])}
                            aria-label="TikTok privacy setting"
                            className="h-11 w-full rounded-[16px] border border-white/10 bg-background px-3 text-sm"
                          >
                            <option value="public">Public</option>
                            <option value="friends">Friends</option>
                            <option value="private">Private</option>
                          </select>
                        </div>
                      ) : null}
                      {targetPlatforms.includes("instagram") ? (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Instagram placement</label>
                          <select
                            value={form.instagramPublishAs}
                            onChange={(event) => updateField("instagramPublishAs", event.target.value as CalendarFormState["instagramPublishAs"])}
                            aria-label="Instagram placement"
                            className="h-11 w-full rounded-[16px] border border-white/10 bg-background px-3 text-sm"
                          >
                            <option value="feed">Feed</option>
                            <option value="reel">Reel</option>
                            <option value="story">Story</option>
                          </select>
                        </div>
                      ) : null}
                      {targetPlatforms.includes("youtube") ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">YouTube title</label>
                            <Input value={form.youtubeTitle} onChange={(event) => updateField("youtubeTitle", event.target.value)} placeholder="Video title" className="rounded-[16px] border-white/10 bg-white/[0.03]" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">YouTube visibility</label>
                            <select
                              value={form.youtubeVisibility}
                              onChange={(event) => updateField("youtubeVisibility", event.target.value as CalendarFormState["youtubeVisibility"])}
                              aria-label="YouTube visibility"
                              className="h-11 w-full rounded-[16px] border border-white/10 bg-background px-3 text-sm"
                            >
                              <option value="private">Private</option>
                              <option value="unlisted">Unlisted</option>
                              <option value="public">Public</option>
                            </select>
                          </div>
                        </div>
                      ) : null}
                      {targetPlatforms.includes("linkedin") ? (
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">LinkedIn destination type</label>
                          <select
                            value={form.linkedinDestinationType}
                            onChange={(event) => updateField("linkedinDestinationType", event.target.value as CalendarFormState["linkedinDestinationType"])}
                            aria-label="LinkedIn destination type"
                            className="h-11 w-full rounded-[16px] border border-white/10 bg-background px-3 text-sm"
                          >
                            <option value="profile">Profile</option>
                            <option value="organization">Organization</option>
                          </select>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="space-y-3">
                    <label className="text-sm font-medium">{isEventsMode ? "Schedule" : "5. Schedule"}</label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Date</label>
                        <Input type="date" value={form.scheduledDate} onChange={(event) => updateField("scheduledDate", event.target.value)} className="rounded-[16px] border-white/10 bg-white/[0.03]" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Time</label>
                        <Input type="time" value={form.scheduledTime} onChange={(event) => updateField("scheduledTime", event.target.value)} className="rounded-[16px] border-white/10 bg-white/[0.03]" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">{isEventsMode ? "Series" : "Campaign"}</label>
                      <select
                        className={cn("h-11 w-full rounded-[16px] border border-white/10 bg-background px-3 text-sm")}
                        value={form.campaignId}
                        onChange={(event) => updateField("campaignId", event.target.value)}
                        aria-label={isEventsMode ? "Choose series for scheduled event" : "Choose campaign for scheduled post"}
                      >
                        <option value="">No campaign</option>
                        {campaigns.map((campaign) => (
                          <option key={campaign.socialCampaignId} value={campaign.socialCampaignId}>
                            {campaign.campaignName}
                          </option>
                        ))}
                      </select>
                      {campaigns.length === 0 ? <p className="text-xs text-muted-foreground">{campaignOptionalLabel}</p> : null}
                    </div>
                    {!isEventsMode ? (
                      <div className="flex flex-wrap gap-2">
                        <Button asChild type="button" size="sm" variant="outline" className="rounded-[14px]">
                          <Link href="/ai-studio">Suggest best time</Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const firstGap = contentGapDays[0];
                            if (firstGap) {
                              updateField("scheduledDate", format(firstGap, "yyyy-MM-dd"));
                            }
                          }}
                          disabled={contentGapDays.length === 0}
                          className="rounded-[14px]"
                        >
                          Fill content gap
                        </Button>
                      </div>
                    ) : null}
                  </section>

                  <button
                    type="button"
                    onClick={() => setShowAdvancedDetails((current) => !current)}
                    className="flex w-full items-center justify-between rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-muted-foreground transition hover:bg-white/[0.06] hover:text-white"
                  >
                    {isEventsMode ? "Advanced details" : "6. Advanced"}
                    <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvancedDetails && "rotate-180")} />
                  </button>

                  {showAdvancedDetails ? (
                    <div className="space-y-4 rounded-[18px] border border-white/10 bg-white/[0.025] p-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{isEventsMode ? "Event title" : "Post title"}</label>
                        <Input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Optional title for your calendar" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Internal notes</label>
                        <Textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} rows={3} placeholder="Private reminders or approval notes." />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Timezone</label>
                        <Input value={form.timezone} onChange={(event) => updateField("timezone", event.target.value)} placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Nairobi"} />
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" disabled={loading || !canSaveDraft} onClick={() => savePost("draft")} className="h-11 rounded-[16px]">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                      {saveDraftLabel}
                    </Button>
                    <Button type="button" disabled={loading || !canSchedulePost} onClick={() => savePost("scheduled")} className="h-11 rounded-[16px]">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {scheduleLabel}
                    </Button>
                  </div>
                  {!canPublishToSelectedPlatform ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Connect a destination account before {isEventsMode ? "saving events" : "scheduling posts"}.
                    </p>
                  ) : null}
                  {canPublishToSelectedPlatform && anyTargetRequiresMedia && selectedAssetIds.length === 0 && !isEventsMode ? (
                    <p className="text-xs leading-5 text-amber-300">
                      {form.contentType} posts for the selected destination need a completed media asset.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="ghost" onClick={clearForm} disabled={loading}>
                      Clear
                    </Button>
                    {selectedPost ? (
                      <Button type="button" variant="destructive" onClick={deletePost} disabled={loading}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </form>
              </GlassCard>

              {selectedPost && !isEventsMode ? (
                <GlassCard className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Publishing readiness</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Worker-ready payload, provider metadata, and recent publishing attempts for this post.
                      </p>
                    </div>
                    {publishReadinessLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <SquareArrowOutUpRight className="h-5 w-5 text-primary" />}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Payload</div>
                      <div className="mt-2 text-sm font-medium text-white">{publishPayload?.payloadVersion || "Not loaded"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{publishPayload?.content.mediaItems.length || 0} media item(s)</div>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Destination</div>
                      <div className="mt-2 truncate text-sm font-medium text-white">{publishPayload?.destination.handle || publishPayload?.destination.accountName || "No account"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{publishPayload?.platform || selectedPost.platform}</div>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Attempts</div>
                      <div className="mt-2 text-sm font-medium text-white">{publishAttempts.length}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Recorded publish attempts</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent attempts</div>
                    {publishAttempts.length > 0 ? publishAttempts.map((attempt) => (
                      <div key={attempt.publishAttemptId} className="rounded-[14px] border border-white/10 bg-white/[0.025] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium text-white">Attempt #{attempt.attemptNumber}</div>
                          <Badge variant="outline" className={cn("border px-2 py-0 text-[10px] uppercase tracking-[0.16em]", attempt.status === "success" ? "border-emerald-500/25 text-emerald-300" : attempt.status === "failed" ? "border-red-500/25 text-red-300" : "border-white/10 text-muted-foreground")}>
                            {attempt.status}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {attempt.triggeredAt ? format(parseISO(attempt.triggeredAt), "MMM d, HH:mm") : "No timestamp"} · {attempt.provider || attempt.platform}
                        </div>
                        {attempt.errorMessage ? <div className="mt-2 text-xs text-red-200">{attempt.errorMessage}</div> : null}
                        {attempt.providerPostId ? <div className="mt-2 text-xs text-muted-foreground">Provider post: {attempt.providerPostId}</div> : null}
                      </div>
                    )) : (
                      <div className="rounded-[14px] border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                        No publish attempts recorded yet. The native publishing worker will write attempts here.
                      </div>
                    )}
                  </div>
                </GlassCard>
              ) : null}

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                      <h2 className="text-lg font-semibold">{selectedCampaign ? (isEventsMode ? "Edit series" : "Edit campaign") : campaignEditorLabel}</h2>
                      <p className="text-sm text-muted-foreground">
                      {selectedCampaign ? "Update the selected campaign or archive it." : campaignEditorDescription}
                      </p>
                  </div>
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>

                <form className="mt-4 space-y-4" onSubmit={handleCampaignSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Campaign name</label>
                    <Input value={campaignForm.campaignName} onChange={(event) => updateCampaignField("campaignName", event.target.value)} placeholder="Launch, offer, or theme name" />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Platform</label>
                      <select
                        className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                        value={campaignForm.platform}
                        onChange={(event) => updateCampaignField("platform", event.target.value as SocialPlatform | "")}
                        aria-label="Campaign platform"
                      >
                        <option value="">All platforms</option>
                        {SOCIAL_PROVIDER_REGISTRY.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Status</label>
                      <select
                        className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                        value={campaignForm.status}
                        onChange={(event) => updateCampaignField("status", event.target.value as SocialCampaignStatus)}
                        aria-label="Campaign status"
                      >
                        {SOCIAL_CAMPAIGN_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Goal</label>
                    <Textarea value={campaignForm.goal} onChange={(event) => updateCampaignField("goal", event.target.value)} rows={3} placeholder="Describe the outcome you want this campaign to drive." />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start date</label>
                      <Input type="date" value={campaignForm.startDate} onChange={(event) => updateCampaignField("startDate", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">End date</label>
                      <Input type="date" value={campaignForm.endDate} onChange={(event) => updateCampaignField("endDate", event.target.value)} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Theme color</label>
                      <Input value={campaignForm.color} onChange={(event) => updateCampaignField("color", event.target.value)} placeholder="#2563eb" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Notes</label>
                      <Input value={campaignForm.notes} onChange={(event) => updateCampaignField("notes", event.target.value)} placeholder="Optional team notes" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={campaignLoading}>
                      {campaignLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : selectedCampaign ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {selectedCampaign ? "Save Campaign" : "Add Campaign"}
                    </Button>
                    <Button type="button" variant="outline" onClick={clearCampaignForm} disabled={campaignLoading}>
                      Clear
                    </Button>
                    {selectedCampaign ? (
                      <Button type="button" variant="destructive" onClick={deleteCampaign} disabled={campaignLoading}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={refreshCampaigns} disabled={campaignLoading || campaignLoadingState}>
                      {campaignLoadingState ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Refresh
                    </Button>
                  </div>
                </form>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{isEventsMode ? "Upcoming events" : "Upcoming items"}</h2>
                    <p className="text-sm text-muted-foreground">{campaignSectionHelper}</p>
                  </div>
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>

                <div className="mt-4 space-y-2">
                  {posts.slice(0, 10).map((post) => (
                    <button
                      type="button"
                      key={post.scheduledPostId}
                      onClick={() => setSelectedPostId(post.scheduledPostId)}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-md border border-white/10 bg-white/5 p-3 text-left",
                        selectedPostId === post.scheduledPostId && "border-primary/30 bg-primary/10"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{post.title || post.caption.slice(0, 32) || "Untitled post"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {format(parseISO(post.scheduledTime), "MMM d, HH:mm")} - {post.platform}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("border px-1.5 py-0 text-[10px] uppercase tracking-[0.16em]", getPostBadgeClass(post.status))}>
                        {post.status}
                      </Badge>
                    </button>
                  ))}

                  {posts.length === 0 ? (
                    <div className="rounded-md border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                      {campaignEmptyLabel}
                    </div>
                  ) : null}
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{campaignSectionLabel}</h2>
                    <p className="text-sm text-muted-foreground">
                      {campaignSummary.totalCampaigns} total · {campaignSummary.activeCampaigns} active
                    </p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Editor</span>
                </div>

                <div className="mt-4 space-y-2">
                  {campaigns.length > 0 ? campaigns.map((campaign) => (
                    <button
                      type="button"
                      key={campaign.socialCampaignId}
                      onClick={() => setSelectedCampaignId(campaign.socialCampaignId)}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 rounded-md border border-white/10 bg-white/5 p-3 text-left",
                        selectedCampaignId === campaign.socialCampaignId && "border-primary/30 bg-primary/10"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{campaign.campaignName}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {campaign.platform || "all platforms"} · {campaign.scheduledPostCount || 0} posts
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("border px-1.5 py-0 text-[10px] uppercase tracking-[0.16em]", getCampaignBadgeClass(campaign.status))}>
                        {campaign.status}
                      </Badge>
                    </button>
                  )) : (
                    <div className="rounded-md border border-dashed border-white/10 p-4 text-sm text-muted-foreground">
                      No campaigns yet.
                    </div>
                  )}
                </div>
              </GlassCard>
            </aside>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
