"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  AlertTriangle,
  BarChart3,
  Eye,
  Heart,
  MessageCircle,
  MousePointerClick,
  Send,
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
import { authFetch, parseApiError } from "@/lib/clientApi";
import { normalizeDate } from "@/lib/date-utils";
import { showErrorToast } from "@/lib/error-toast";
import { logger } from "@/lib/logger";
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
  type SocialPostAnalyticsRecord,
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

function isEventCalendarPost(post: ScheduledPostRecord): boolean {
  return post.metadata?.calendarMode === "events";
}

function filterSchedulerPosts(posts: ScheduledPostRecord[]): ScheduledPostRecord[] {
  return posts.filter((post) => !isEventCalendarPost(post));
}

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

type PostAnalyticsResponse = {
  analytics: SocialPostAnalyticsRecord[];
};

type SchedulerAIResponse = {
  action: string;
  label: string;
  content: {
    title: string;
    summary: string;
    generatedContent: string;
    strategicTips: string[];
    variants: string[];
    providerId: string;
    modelId: string;
  };
  suggestion: {
    platform?: SocialPlatform;
    caption?: string;
    hashtags?: string[];
    cta?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    campaignName?: string;
    campaignGoal?: string;
  };
};

const SOCIAL_PROVIDER_LIST_LABEL = SOCIAL_PROVIDER_REGISTRY.map((provider) => provider.label).join(", ").replace(/, ([^,]*)$/, ", or $1");

type PublishingControlsResponse = {
  controls: {
    ownerId: string;
    paused: boolean;
    reason?: string;
    pausedAt?: string | null;
    resumedAt?: string | null;
    updatedAt?: string | null;
  };
};

type PublishPayloadResponse = {
  payload: NormalizedSocialPublishPayload;
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

type CalendarViewMode = "month" | "week" | "agenda" | "queue" | "analytics";
type ComposerWorkflowStep = "platform" | "format" | "ai" | "edit" | "preview" | "schedule" | "publish" | "analytics";

const COMPOSER_WORKFLOW_STEPS: Array<{
  id: ComposerWorkflowStep;
  title: string;
  description: string;
}> = [
  { id: "platform", title: "Destination", description: "Choose connected accounts." },
  { id: "format", title: "Format", description: "Select the content shape." },
  { id: "ai", title: "Media", description: "Add or generate assets." },
  { id: "edit", title: "Caption", description: "Write and adapt copy." },
  { id: "preview", title: "Preview", description: "Review each platform." },
  { id: "schedule", title: "Schedule", description: "Pick the publishing time." },
  { id: "publish", title: "Auto-publish", description: "Queue the worker." },
  { id: "analytics", title: "Track", description: "Monitor results." },
];

const STATUS_LABELS: Record<ScheduledPostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  editing: "Editing",
  cancelled: "Cancelled",
};

function ComposerSection({
  title,
  description,
  badge,
  defaultOpen = false,
  visible = true,
  children,
}: {
  title: string;
  description?: string;
  badge?: string;
  defaultOpen?: boolean;
  visible?: boolean;
  children: ReactNode;
}) {
  if (!visible) return null;

  return (
    <details
      open={defaultOpen}
      className="group depth-panel depth-card-hover rounded-[18px]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{title}</span>
            {badge ? (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p> : null}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-white/10 px-4 py-4">
        {children}
      </div>
    </details>
  );
}

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

function buildAiStudioActionHref(
  action: string,
  form: CalendarFormState,
  options: { platform?: SocialPlatform; contentType?: ScheduledPostContentType } = {}
): string {
  const params = new URLSearchParams({
    source: "scheduler",
    action,
    platform: options.platform || form.platform,
    contentType: options.contentType || form.contentType,
    returnTo: "/social/calendar?mode=scheduler",
  });

  if (form.caption.trim()) {
    params.set("caption", form.caption.trim().slice(0, 280));
  }
  if (form.cta.trim()) {
    params.set("cta", form.cta.trim().slice(0, 160));
  }
  if (form.assetIds.trim()) {
    params.set("assetIds", form.assetIds.trim().slice(0, 500));
  }
  if (form.scheduledDate) {
    params.set("scheduledDate", form.scheduledDate);
  }

  return `/ai/studio?${params.toString()}`;
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

function getPostAccount(post: ScheduledPostRecord, accountMap: Record<string, SocialAccountRecord>): SocialAccountRecord | undefined {
  const accountId = post.connectedAccountId || post.socialAccountId;
  return accountId ? accountMap[accountId] : undefined;
}

function getPostReadinessWarning(
  post: ScheduledPostRecord,
  accountMap: Record<string, SocialAccountRecord>,
  assetMap: Record<string, StudioAssetSummary>
): string | null {
  if (post.status === "published" || post.status === "cancelled") return null;
  const account = getPostAccount(post, accountMap);
  if (!account) return "No destination account selected";
  if (account.status !== "connected") return "Destination account is not connected";
  if (account.lastError) return account.lastError;
  const contentType = post.contentType || getDefaultContentType(post.platform);
  if (requiresMedia(post.platform, contentType) && post.assetIds.length === 0) return "Media required before publishing";
  const missingAsset = post.assetIds.find((assetId) => !assetMap[assetId]);
  if (missingAsset) return "Attached media is not available yet";
  return null;
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
    case "publishing":
      return "bg-blue-500/15 text-blue-300 border-blue-500/25";
    case "scheduled":
      return "bg-sky-500/15 text-sky-300 border-sky-500/25";
    case "failed":
      return "bg-red-500/15 text-red-300 border-red-500/25";
    case "editing":
      return "bg-violet-500/15 text-violet-300 border-violet-500/25";
    case "cancelled":
      return "bg-white/5 text-white/45 border-white/10";
    case "draft":
    default:
      return "bg-white/5 text-white/70 border-white/10";
  }
}

function getPlatformMark(platform: SocialPlatform): string {
  switch (platform) {
    case "tiktok":
      return "TT";
    case "instagram":
      return "IG";
    case "facebook":
      return "FB";
    case "linkedin":
      return "in";
    case "youtube":
      return "YT";
    case "x":
      return "X";
    default:
      return String(platform).slice(0, 2).toUpperCase();
  }
}

function getPlatformBadgeClass(platform: SocialPlatform): string {
  switch (platform) {
    case "tiktok":
      return "border-cyan-300/30 bg-cyan-400/15 text-cyan-100";
    case "instagram":
      return "border-fuchsia-300/30 bg-fuchsia-400/15 text-fuchsia-100";
    case "facebook":
      return "border-blue-300/30 bg-blue-500/15 text-blue-100";
    case "linkedin":
      return "border-sky-300/30 bg-sky-500/15 text-sky-100";
    case "youtube":
      return "border-red-300/30 bg-red-500/15 text-red-100";
    case "x":
      return "border-white/20 bg-white/10 text-white";
    default:
      return "border-white/10 bg-white/5 text-white";
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

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "Creator";
  return trimmed.split(/\s+/)[0] || "Creator";
}

function formatFriendlyTime(value: string): string {
  const parsed = parseISO(value);
  if (Number.isNaN(parsed.getTime())) return "7:30 PM";
  return format(parsed, "h:mm a");
}

function getSuggestedPostingTime(posts: ScheduledPostRecord[]): { label: string; source: string } {
  const scheduledHours = posts
    .filter((post) => post.status === "scheduled" || post.status === "published")
    .map((post) => parseISO(post.scheduledTime))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.getHours());

  if (scheduledHours.length > 0) {
    const counts = scheduledHours.reduce<Record<number, number>>((acc, hour) => {
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});
    const bestHour = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 19);
    const suggested = new Date();
    suggested.setHours(bestHour, bestHour >= 18 ? 30 : 0, 0, 0);
    return { label: format(suggested, "h:mm a"), source: "Based on your scheduled pattern" };
  }

  return { label: "7:30 PM", source: "Suggested starting point until analytics sync" };
}

function getPlatformInactivityInsight(posts: ScheduledPostRecord[], accounts: SocialAccountRecord[]): string {
  const connectedPlatforms = SOCIAL_PROVIDER_REGISTRY
    .filter((provider) => accounts.some((account) => account.providerId === provider.id && account.status === "connected"));

  if (connectedPlatforms.length === 0) {
    return "Connect a platform to unlock channel-specific recommendations.";
  }

  const now = Date.now();
  const oldest = connectedPlatforms
    .map((provider) => {
      const lastPost = posts
        .filter((post) => post.platform === provider.id && post.status !== "draft" && post.status !== "cancelled")
        .map((post) => parseISO(post.scheduledTime))
        .filter((date) => !Number.isNaN(date.getTime()) && date.getTime() <= now)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        label: provider.label,
        days: lastPost ? Math.floor((now - lastPost.getTime()) / 86_400_000) : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => b.days - a.days)[0];

  if (!oldest) return "Your connected platforms are ready for scheduling.";
  if (!Number.isFinite(oldest.days)) return `${oldest.label} has not been posted to yet.`;
  if (oldest.days === 0) return `${oldest.label} has activity today.`;
  return `${oldest.label} has not been posted to in ${oldest.days} day${oldest.days === 1 ? "" : "s"}.`;
}

function getEngagementInsight(accounts: SocialAccountRecord[]): string {
  for (const account of accounts) {
    const metadata = account.metadata || {};
    const rawDelta = metadata.engagementDeltaPercent ?? metadata.engagementChangePercent ?? metadata.monthlyEngagementDeltaPercent;
    const delta = typeof rawDelta === "number" ? rawDelta : typeof rawDelta === "string" ? Number(rawDelta) : Number.NaN;
    if (Number.isFinite(delta)) {
      const provider = SOCIAL_PROVIDER_REGISTRY.find((item) => item.id === account.providerId);
      const direction = delta >= 0 ? "up" : "down";
      return `${provider?.label || account.providerLabel} engagement is ${direction} ${Math.abs(delta).toFixed(0)}%.`;
    }
  }

  return "Engagement insights will appear after platform analytics sync.";
}

function readMetadataNumber(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = metadata[key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/,/g, "")) : Number.NaN;
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function sumAccountMetric(accounts: SocialAccountRecord[], keys: string[]): { value: number; synced: boolean } {
  let total = 0;
  let synced = false;

  accounts.forEach((account) => {
    const value = readMetadataNumber(account.metadata || {}, keys);
    if (value !== null) {
      total += value;
      synced = true;
    }
  });

  return { value: total, synced };
}

function formatCompactMetric(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

function formatEngagementRate(value: number): string {
  const normalized = value > 1 ? value : value * 100;
  return `${Math.round(normalized * 10) / 10}%`;
}

function getConsistencyScore(posts: ScheduledPostRecord[], month: Date): number {
  const activePosts = posts.filter((post) => post.status === "scheduled" || post.status === "published");
  const activeDays = new Set(
    activePosts
      .map((post) => parseISO(post.scheduledTime))
      .filter((date) => !Number.isNaN(date.getTime()) && isSameMonth(date, month))
      .map((date) => format(date, "yyyy-MM-dd"))
  );
  const daysInMonth = endOfMonth(month).getDate();
  const targetPublishingDays = Math.min(20, Math.max(8, Math.ceil(daysInMonth * 0.45)));
  return Math.min(100, Math.round((activeDays.size / targetPublishingDays) * 100));
}

export default function SocialCalendarPage() {
  const { user, userData } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const isEventsMode = false;
  const pageLabel = "Scheduler";
  const pageTitle = "Schedule content across the month";
  const pageDescription = "Plan, edit, and move social content in one visual calendar. Drag a post to a new day when a reschedule makes more sense.";
  const createEntryLabel = "Create post";
  const emptyStateLabel = "Create your first scheduled post, generate content in AI Studio, or connect another platform.";
  const createCardHeading = "Create post";
  const createCardDescription = "Update the content or move it to a better time.";
  const postHeadingLabel = "Post copy";
  const campaignSectionLabel = "Campaigns";
  const campaignSectionHelper = "A quick list of the month's scheduled entries.";
  const campaignEmptyLabel = "No scheduled content for this month yet.";
  const campaignOptionalLabel = "Campaigns are optional. You can organize posts later.";
  const campaignEditorLabel = "Create campaign";
  const campaignEditorDescription = "Group related posts under a shared campaign.";
  const saveDraftLabel = "Save draft";
  const scheduleLabel = "Schedule post";
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
  const [postAnalytics, setPostAnalytics] = useState<SocialPostAnalyticsRecord[]>([]);
  const [selectedPostAnalytics, setSelectedPostAnalytics] = useState<SocialPostAnalyticsRecord[]>([]);
  const [selectedPostPanelTab, setSelectedPostPanelTab] = useState<"readiness" | "analytics">("readiness");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<SocialAccountRecord[]>([]);
  const [form, setForm] = useState<CalendarFormState>(() => buildEmptyForm(getTodayDateString()));
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(() => buildEmptyCampaignForm());
  const [workflowStep, setWorkflowStep] = useState<ComposerWorkflowStep>("platform");
  const [schedulerAiLoadingAction, setSchedulerAiLoadingAction] = useState<string | null>(null);
  const [schedulerAiResult, setSchedulerAiResult] = useState<SchedulerAIResponse | null>(null);
  const [publishingControls, setPublishingControls] = useState<PublishingControlsResponse["controls"] | null>(null);
  const [publishingControlLoading, setPublishingControlLoading] = useState(false);
  const [creditDashboard, setCreditDashboard] = useState<CreditDashboard | null>(null);
  const [creditLoading, setCreditLoading] = useState(true);

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

  const socialAccountMap = useMemo(() => {
    return connectedAccounts.reduce<Record<string, SocialAccountRecord>>((acc, account) => {
      acc[account.socialAccountId] = account;
      return acc;
    }, {});
  }, [connectedAccounts]);

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
      upcomingPosts: filteredPosts.filter((post) => post.status !== "published" && (normalizeDate(post.scheduledTime)?.getTime() || 0) >= Date.now()).length,
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
    return [...filteredPosts].sort((a, b) => (normalizeDate(a.scheduledTime)?.getTime() || 0) - (normalizeDate(b.scheduledTime)?.getTime() || 0));
  }, [filteredPosts]);

  const upcomingAgendaPosts = useMemo(() => {
    const now = Date.now();
    return agendaPosts.filter((post) => (normalizeDate(post.scheduledTime)?.getTime() || 0) >= now && post.status !== "published" && post.status !== "cancelled");
  }, [agendaPosts]);

  const queuePosts = useMemo(() => {
    return agendaPosts.filter((post) => ["scheduled", "publishing", "failed", "editing"].includes(post.status));
  }, [agendaPosts]);

  const todaysPosts = useMemo(() => {
    const todayKey = format(new Date(), "yyyy-MM-dd");
    return agendaPosts.filter((post) => format(parseISO(post.scheduledTime), "yyyy-MM-dd") === todayKey);
  }, [agendaPosts]);

  const nextScheduledPost = upcomingAgendaPosts[0] || null;
  const creatorName = getFirstName(userData?.name || user?.displayName || user?.email);
  const suggestedPostingTime = useMemo(() => getSuggestedPostingTime(posts), [posts]);
  const inactivityInsight = useMemo(() => getPlatformInactivityInsight(posts, connectedAccounts), [connectedAccounts, posts]);
  const engagementInsight = useMemo(() => getEngagementInsight(connectedAccounts), [connectedAccounts]);
  const reachMetric = useMemo(
    () => sumAccountMetric(connectedAccounts, ["monthlyReach", "reach", "totalReach", "impressions", "monthlyImpressions", "totalImpressions"]),
    [connectedAccounts]
  );
  const engagementMetric = useMemo(
    () => sumAccountMetric(connectedAccounts, ["monthlyEngagement", "engagement", "totalEngagement", "engagements", "interactions", "totalInteractions"]),
    [connectedAccounts]
  );
  const likesMetric = useMemo(
    () => sumAccountMetric(connectedAccounts, ["monthlyLikes", "likes", "totalLikes", "likeCount"]),
    [connectedAccounts]
  );
  const commentsMetric = useMemo(
    () => sumAccountMetric(connectedAccounts, ["monthlyComments", "comments", "totalComments", "commentCount"]),
    [connectedAccounts]
  );
  const clicksMetric = useMemo(
    () => sumAccountMetric(connectedAccounts, ["monthlyClicks", "clicks", "linkClicks", "websiteClicks", "totalClicks"]),
    [connectedAccounts]
  );
  const consistencyScore = useMemo(() => getConsistencyScore(filteredPosts, currentMonth), [currentMonth, filteredPosts]);
  const schedulerAnalyticsCards = useMemo(() => {
    const scheduledCount = visibleSummary.byStatus.scheduled + visibleSummary.byStatus.publishing;
    const failedCount = visibleSummary.byStatus.failed;
    return [
      {
        label: "Posts scheduled",
        value: formatCompactMetric(scheduledCount),
        helper: "Queued to publish",
        tone: "text-white",
        icon: Send,
      },
      {
        label: "Published",
        value: formatCompactMetric(visibleSummary.byStatus.published),
        helper: "This month",
        tone: "text-emerald-300",
        icon: CalendarDays,
      },
      {
        label: "Needs attention",
        value: formatCompactMetric(failedCount),
        helper: failedCount > 0 ? "Review failed posts" : "No failed posts",
        tone: failedCount > 0 ? "text-red-300" : "text-muted-foreground",
        icon: AlertTriangle,
      },
      {
        label: "Total reach",
        value: reachMetric.synced ? formatCompactMetric(reachMetric.value) : "0",
        helper: reachMetric.synced ? "Synced from platforms" : "Analytics not synced",
        tone: reachMetric.synced ? "text-white" : "text-muted-foreground",
        icon: Eye,
      },
      {
        label: "Total engagement",
        value: engagementMetric.synced ? formatCompactMetric(engagementMetric.value) : "0",
        helper: engagementMetric.synced ? "Synced from platforms" : "Analytics not synced",
        tone: engagementMetric.synced ? "text-white" : "text-muted-foreground",
        icon: BarChart3,
      },
      {
        label: "Likes",
        value: likesMetric.synced ? formatCompactMetric(likesMetric.value) : "0",
        helper: likesMetric.synced ? "Synced from platforms" : "Analytics not synced",
        tone: likesMetric.synced ? "text-white" : "text-muted-foreground",
        icon: Heart,
      },
      {
        label: "Comments",
        value: commentsMetric.synced ? formatCompactMetric(commentsMetric.value) : "0",
        helper: commentsMetric.synced ? "Synced from platforms" : "Analytics not synced",
        tone: commentsMetric.synced ? "text-white" : "text-muted-foreground",
        icon: MessageCircle,
      },
      {
        label: "Clicks",
        value: clicksMetric.synced ? formatCompactMetric(clicksMetric.value) : "0",
        helper: clicksMetric.synced ? "Tracked from accounts" : "Analytics not synced",
        tone: clicksMetric.synced ? "text-white" : "text-muted-foreground",
        icon: MousePointerClick,
      },
      {
        label: "Consistency Score",
        value: `${consistencyScore}%`,
        helper: consistencyScore >= 70 ? "Strong rhythm" : consistencyScore > 0 ? "Build momentum" : "Start scheduling",
        tone: consistencyScore >= 70 ? "text-emerald-300" : consistencyScore > 0 ? "text-amber-300" : "text-muted-foreground",
        icon: BarChart3,
      },
      {
        label: "AI Credits",
        value: creditLoading ? "--" : String(creditDashboard?.snapshot.remainingCredits ?? 0),
        helper: creditDashboard?.snapshot.monthlyCreditsGranted
          ? `${creditDashboard.snapshot.monthlyCreditsUsed} used this cycle`
          : "Buy or upgrade to create",
        tone: creditDashboard?.snapshot.remainingCredits ? "text-white" : "text-muted-foreground",
        icon: Sparkles,
      },
    ];
  }, [clicksMetric, commentsMetric, consistencyScore, creditDashboard, creditLoading, engagementMetric, likesMetric, reachMetric, visibleSummary]);

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
  const postsNeedingAttention = useMemo(() => {
    return queuePosts.filter((post) => getPostReadinessWarning(post, socialAccountMap, studioAssetMap) || post.status === "failed");
  }, [queuePosts, socialAccountMap, studioAssetMap]);
  const postAnalyticsByPostId = useMemo(() => {
    return postAnalytics.reduce<Record<string, SocialPostAnalyticsRecord>>((acc, record) => {
      const existing = acc[record.scheduledPostId];
      const existingTime = existing?.lastSyncedAt ? Date.parse(existing.lastSyncedAt) : 0;
      const nextTime = record.lastSyncedAt ? Date.parse(record.lastSyncedAt) : 0;
      if (!existing || nextTime >= existingTime) acc[record.scheduledPostId] = record;
      return acc;
    }, {});
  }, [postAnalytics]);
  const selectedPostLatestAnalytics = useMemo(() => {
    if (!selectedPostId) return null;
    return selectedPostAnalytics[0] || postAnalyticsByPostId[selectedPostId] || null;
  }, [postAnalyticsByPostId, selectedPostAnalytics, selectedPostId]);
  const postAnalyticsTotals = useMemo(() => {
    return postAnalytics.reduce(
      (acc, record) => {
        acc.likes += record.metrics.likes || 0;
        acc.comments += record.metrics.comments || 0;
        acc.shares += record.metrics.shares || 0;
        acc.saves += record.metrics.saves || 0;
        acc.clicks += record.metrics.clicks || 0;
        acc.views += record.metrics.views || 0;
        acc.reach += record.metrics.reach || 0;
        acc.impressions += record.metrics.impressions || 0;
        acc.engagement += (record.metrics.likes || 0) + (record.metrics.comments || 0) + (record.metrics.shares || 0) + (record.metrics.saves || 0) + (record.metrics.clicks || 0);
        return acc;
      },
      { likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, views: 0, reach: 0, impressions: 0, engagement: 0 }
    );
  }, [postAnalytics]);
  const topPerformingPosts = useMemo(() => {
    return postAnalytics
      .map((record) => {
        const post = posts.find((item) => item.scheduledPostId === record.scheduledPostId);
        const score =
          (record.metrics.engagementRate || 0) * 100 +
          (record.metrics.likes || 0) +
          (record.metrics.comments || 0) * 2 +
          (record.metrics.shares || 0) * 3 +
          (record.metrics.saves || 0) * 2 +
          (record.metrics.clicks || 0) * 2;
        return { record, post, score };
      })
      .filter((item) => item.post)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [postAnalytics, posts]);
  const bestPostingTimeFromAnalytics = useMemo(() => {
    const buckets = new Map<number, { count: number; score: number }>();
    postAnalytics.forEach((record) => {
      const post = posts.find((item) => item.scheduledPostId === record.scheduledPostId);
      if (!post?.scheduledTime) return;
      const hour = parseISO(post.scheduledTime).getHours();
      const current = buckets.get(hour) || { count: 0, score: 0 };
      current.count += 1;
      current.score +=
        (record.metrics.likes || 0) +
        (record.metrics.comments || 0) * 2 +
        (record.metrics.shares || 0) * 3 +
        (record.metrics.saves || 0) * 2 +
        (record.metrics.clicks || 0) * 2 +
        (record.metrics.views || 0) * 0.05;
      buckets.set(hour, current);
    });
    const best = [...buckets.entries()].sort((a, b) => (b[1].score / Math.max(b[1].count, 1)) - (a[1].score / Math.max(a[1].count, 1)))[0];
    if (!best) return { label: suggestedPostingTime.label, source: "Based on your schedule until post analytics sync" };
    const hourDate = new Date();
    hourDate.setHours(best[0], 0, 0, 0);
    return {
      label: format(hourDate, "h:mm a"),
      source: `Best average engagement from ${best[1].count} synced post${best[1].count === 1 ? "" : "s"}`,
    };
  }, [postAnalytics, posts, suggestedPostingTime.label]);
  const platformAnalytics = useMemo(() => {
    return SOCIAL_PROVIDER_REGISTRY.map((provider) => {
      const records = postAnalytics.filter((record) => record.platform === provider.id);
      const totals = records.reduce(
        (acc, record) => {
          acc.reach += record.metrics.reach || 0;
          acc.views += record.metrics.views || 0;
          acc.engagement += (record.metrics.likes || 0) + (record.metrics.comments || 0) + (record.metrics.shares || 0) + (record.metrics.saves || 0) + (record.metrics.clicks || 0);
          return acc;
        },
        { reach: 0, views: 0, engagement: 0 }
      );
      return { provider, records: records.length, ...totals };
    }).filter((item) => item.records > 0);
  }, [postAnalytics]);
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
    ? true
    : publishTargetAccounts.length > 0;
  const canSaveDraft = isEventsMode ? canPublishToSelectedPlatform && Boolean(form.caption.trim()) : publishTargetAccounts.length > 0;
  const canSchedulePost = isEventsMode
    ? canPublishToSelectedPlatform && Boolean(form.caption.trim()) && Boolean(form.scheduledDate && form.scheduledTime)
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
  const workflowStepIndex = Math.max(0, COMPOSER_WORKFLOW_STEPS.findIndex((step) => step.id === workflowStep));
  const activeWorkflowStep = COMPOSER_WORKFLOW_STEPS[workflowStepIndex] || COMPOSER_WORKFLOW_STEPS[0];
  const goToPreviousWorkflowStep = () => {
    setWorkflowStep(COMPOSER_WORKFLOW_STEPS[Math.max(0, workflowStepIndex - 1)].id);
  };
  const goToNextWorkflowStep = () => {
    setWorkflowStep(COMPOSER_WORKFLOW_STEPS[Math.min(COMPOSER_WORKFLOW_STEPS.length - 1, workflowStepIndex + 1)].id);
  };

  useEffect(() => {
    if (searchParams.get("mode") === "events") {
      router.replace("/events");
    }
  }, [router, searchParams]);

  useEffect(() => {
    setSelectedPostId(null);
    setForm(buildEmptyForm(format(currentMonth, "yyyy-MM-dd")));
    setWorkflowStep("platform");
  }, [currentMonth]);

  useEffect(() => {
    let mounted = true;

    async function loadCredits() {
      if (!user) {
        setCreditDashboard(null);
        setCreditLoading(false);
        return;
      }

      setCreditLoading(true);
      try {
        const response = await authFetch("/api/creator-credits");
        if (!response.ok) throw await parseApiError(response, "Unable to load Creator Credits.");
        const data = (await response.json()) as CreditDashboard;
        if (mounted) setCreditDashboard(data);
      } catch (error) {
        logger.warn("Unable to load scheduler credit summary", { error: error instanceof Error ? error.message : String(error) });
        if (mounted) setCreditDashboard(null);
      } finally {
        if (mounted) setCreditLoading(false);
      }
    }

    loadCredits();
    return () => {
      mounted = false;
    };
  }, [user]);

  const loadMonth = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const monthKey = format(currentMonth, "yyyy-MM");
    const response = await fetch(`/api/social/scheduled-posts?month=${monthKey}&limit=200`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw await parseApiError(response, "Could not load calendar data.");
    }

    const data = (await response.json()) as CalendarResponse;
    setPosts(filterSchedulerPosts(data.posts || []));
    setSummary(data.summary);
  };

  const loadCampaigns = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const response = await fetch("/api/social/campaigns?limit=24", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) {
      throw await parseApiError(response, "Could not load campaigns.");
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

  const loadPostAnalytics = async () => {
    if (!user) return;

    const idToken = await user.getIdToken();
    const response = await fetch("/api/social/post-analytics?limit=200", {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!response.ok) return;
    const data = (await response.json()) as PostAnalyticsResponse;
    setPostAnalytics(data.analytics || []);
  };

  const loadPublishingControls = async () => {
    if (!user) return;
    const idToken = await user.getIdToken();
    const response = await fetch("/api/social/publishing-controls", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!response.ok) return;
    const data = (await response.json()) as PublishingControlsResponse;
    setPublishingControls(data.controls);
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
          throw await parseApiError(response, "Could not load calendar data.");
        }

        const data = (await response.json()) as CalendarResponse;
        if (mounted) {
          setPosts(filterSchedulerPosts(data.posts || []));
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
        const analyticsResponse = await fetch("/api/social/post-analytics?limit=200", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (analyticsResponse.ok) {
          const analyticsData = (await analyticsResponse.json()) as PostAnalyticsResponse;
          if (mounted) {
            setPostAnalytics(analyticsData.analytics || []);
          }
        }
        const controlsResponse = await fetch("/api/social/publishing-controls", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (controlsResponse.ok) {
          const controlsData = (await controlsResponse.json()) as PublishingControlsResponse;
          if (mounted) {
            setPublishingControls(controlsData.controls);
          }
        }
      } catch (error) {
        if (mounted) {
          toast({
            title: "Calendar unavailable",
            description: "Could not load scheduled posts.",
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
    setWorkflowStep(isEventsMode ? "platform" : "edit");
  }, [isEventsMode, selectedPost]);

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
        setSelectedPostAnalytics([]);
        return;
      }

      try {
        setPublishReadinessLoading(true);
        const idToken = await user.getIdToken();
        setSelectedPostPanelTab("readiness");
        const [attemptsResponse, payloadResponse, analyticsResponse] = await Promise.all([
          fetch(`/api/social/publish-attempts?scheduledPostId=${encodeURIComponent(selectedPostId)}&limit=8`, {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch(`/api/social/scheduled-posts/${selectedPostId}/publish-payload`, {
            headers: { Authorization: `Bearer ${idToken}` },
          }),
          fetch(`/api/social/post-analytics?scheduledPostId=${encodeURIComponent(selectedPostId)}&limit=8`, {
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
        if (analyticsResponse.ok) {
          const data = (await analyticsResponse.json()) as PostAnalyticsResponse;
          if (mounted) setSelectedPostAnalytics(data.analytics || []);
        } else if (mounted) {
          setSelectedPostAnalytics([]);
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

  const applySchedulerAISuggestion = (data: SchedulerAIResponse) => {
    const suggestion = data.suggestion || {};
    setSchedulerAiResult(data);

    setForm((current) => {
      const nextPlatform = suggestion.platform || current.platform;
      const nextAccount = nextPlatform !== current.platform
        ? connectedAccounts.find((account) => account.status === "connected" && account.providerId === nextPlatform)
        : undefined;
      return {
        ...current,
        platform: nextPlatform,
        connectedAccountId: nextAccount?.socialAccountId || current.connectedAccountId,
        destinationAccountIds: nextAccount ? [nextAccount.socialAccountId] : current.destinationAccountIds,
        contentType: nextPlatform !== current.platform ? getDefaultContentType(nextPlatform) : current.contentType,
        caption: suggestion.caption !== undefined && suggestion.caption.trim() ? suggestion.caption : current.caption,
        hashtags: suggestion.hashtags && suggestion.hashtags.length > 0 ? suggestion.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ") : current.hashtags,
        cta: suggestion.cta !== undefined && suggestion.cta.trim() ? suggestion.cta : current.cta,
        scheduledDate: suggestion.scheduledDate || current.scheduledDate,
        scheduledTime: suggestion.scheduledTime || current.scheduledTime,
      };
    });

    if (suggestion.campaignName || suggestion.campaignGoal) {
      setCampaignForm((current) => ({
        ...current,
        campaignName: suggestion.campaignName || current.campaignName,
        goal: suggestion.campaignGoal || current.goal,
        startDate: suggestion.scheduledDate || current.startDate || getTodayDateString(),
      }));
    }
  };

  const runSchedulerAIAction = async (action: string, options: { targetPlatform?: SocialPlatform } = {}) => {
    if (!user || schedulerAiLoadingAction) return;

    try {
      setSchedulerAiLoadingAction(action);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/social/scheduler-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          action,
          targetPlatform: options.targetPlatform,
          month: format(currentMonth, "yyyy-MM"),
          form: {
            title: form.title,
            caption: form.caption,
            platform: form.platform,
            contentType: form.contentType,
            scheduledDate: form.scheduledDate,
            scheduledTime: form.scheduledTime,
            hashtags: form.hashtags,
            cta: form.cta,
            campaignId: form.campaignId,
            assetIds: form.assetIds,
          },
        }),
      });

      if (!response.ok) {
        throw await parseApiError(response, "Soma AI could not complete this action.");
      }

      const data = (await response.json()) as SchedulerAIResponse;
      applySchedulerAISuggestion(data);
      setWorkflowStep(action === "suggest_best_time" ? "schedule" : action === "create_7_day_campaign" ? "preview" : "edit");
      toast({
        title: data.label,
        description: "Soma AI updated the scheduler draft. Review before publishing.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Soma AI action failed",
        fallback: "Could not generate scheduler guidance.",
      });
    } finally {
      setSchedulerAiLoadingAction(null);
    }
  };

  const clearForm = () => {
    setSelectedPostId(null);
    setForm(buildEmptyForm(format(currentMonth, "yyyy-MM-dd")));
    setWorkflowStep("platform");
    setSchedulerAiResult(null);
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
        throw await parseApiError(response, "Upload failed.");
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
      showErrorToast(toast, error, {
        title: "Upload failed",
        fallback: "Could not upload media.",
      });
    } finally {
      setMediaUploading(false);
    }
  };

  const refreshCalendar = async () => {
    try {
      setLoading(true);
      await Promise.all([loadMonth(), loadConnectedAccounts(), loadStudioAssets(), loadPostAnalytics(), loadPublishingControls()]);
      toast({
        title: "Calendar refreshed",
        description: "The latest scheduled content is loaded.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Refresh failed",
        fallback: "Could not refresh the calendar.",
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
      showErrorToast(toast, error, {
        title: "Campaign refresh failed",
        fallback: "Could not refresh campaigns.",
      });
    } finally {
      setCampaignLoading(false);
    }
  };

  const setPublishingPaused = async (paused: boolean) => {
    if (!user || publishingControlLoading) return;
    try {
      setPublishingControlLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch("/api/social/publishing-controls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          paused,
          reason: paused ? "Paused from Scheduler" : "",
        }),
      });
      if (!response.ok) {
        throw await parseApiError(response, "Could not update publishing controls.");
      }
      const data = (await response.json()) as PublishingControlsResponse;
      setPublishingControls(data.controls);
      toast({
        title: paused ? "Scheduled publishing paused" : "Scheduled publishing resumed",
        description: paused ? "The worker will skip your scheduled posts until you resume." : "Eligible scheduled posts can publish again.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Publishing controls failed",
        fallback: "Could not update publishing controls.",
      });
    } finally {
      setPublishingControlLoading(false);
    }
  };

  const runPostControlAction = async (postId: string, action: "retry" | "cancel") => {
    if (!user || loading) return;
    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/scheduled-posts/${postId}/controls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        throw await parseApiError(response, "Could not update post.");
      }
      const data = (await response.json()) as { post: ScheduledPostRecord };
      setPosts((current) => current.map((post) => post.scheduledPostId === data.post.scheduledPostId ? data.post : post));
      toast({
        title: action === "retry" ? "Retry queued" : "Post cancelled",
        description: action === "retry" ? "The publishing worker will try this post again." : "This post will no longer auto-publish.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: action === "retry" ? "Retry failed" : "Cancel failed",
        fallback: "Could not update the post.",
      });
    } finally {
      setLoading(false);
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
        metadata: { calendarMode: "scheduler" },
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
        throw await parseApiError(failedResponse, "Could not save scheduled post.");
      }

      const data = (await responses[0].json()) as CalendarPostResponse;
      setSelectedPostId(data.post.scheduledPostId);
      setForm((current) => ({ ...current, status: data.post.status, publicationGroupId: groupId }));
      setWorkflowStep(nextStatus === "scheduled" ? "publish" : "edit");
      await loadMonth();
      toast({
        title: nextStatus === "scheduled" ? "Post scheduled" : "Draft saved",
        description: nextStatus === "scheduled"
          ? `${responses.length} destination${responses.length === 1 ? "" : "s"} added to the calendar.`
          : "Your draft is saved in the calendar.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Save failed",
        fallback: "Could not save the calendar entry.",
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
        throw await parseApiError(response, "Could not save campaign.");
      }

      const data = (await response.json()) as CalendarCampaignResponse;
      setSelectedCampaignId(data.campaign.socialCampaignId);
      await loadCampaigns();
      toast({
        title: "Campaign saved",
        description: "The campaign editor has been updated.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Campaign save failed",
        fallback: "Could not save the campaign.",
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
        throw await parseApiError(response, "Could not delete campaign.");
      }

      clearCampaignForm();
      await loadCampaigns();
      toast({
        title: "Campaign removed",
        description: "The campaign has been deleted.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Campaign delete failed",
        fallback: "Could not remove the campaign.",
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
        throw await parseApiError(response, "Could not delete scheduled post.");
      }

      clearForm();
      await loadMonth();
      toast({
        title: "Scheduled post removed",
        description: "The calendar entry has been deleted.",
      });
    } catch (error) {
      showErrorToast(toast, error, {
        title: "Delete failed",
        fallback: "Could not remove the calendar entry.",
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
        throw await parseApiError(response, "Could not move scheduled post.");
      }

      await loadMonth();
      toast({
        title: "Post moved",
        description: "The scheduled time has been updated.",
      });
    } catch (error) {
      setPosts(previousPosts);
      showErrorToast(toast, error, {
        title: "Move failed",
        fallback: "Could not move the post.",
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
    const provider = SOCIAL_PROVIDER_REGISTRY.find((item) => item.id === post.platform);
    const platformLabel = provider?.label || post.platform;
    const account = getPostAccount(post, socialAccountMap);
    const accountLabel = account ? getAccountDisplayLabel(account) : "No account";
    const readinessWarning = getPostReadinessWarning(post, socialAccountMap, studioAssetMap);

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
          "group depth-card-hover relative overflow-hidden rounded-[14px] border text-xs",
          post.status === "published"
            ? "border-emerald-500/20 bg-emerald-500/10"
            : post.status === "failed"
              ? "border-red-500/20 bg-red-500/10"
              : "border-white/10 bg-black/25",
          compact ? "p-3" : "p-2.5"
        )}
        title={`${platformLabel} ${STATUS_LABELS[post.status]} at ${format(parseISO(post.scheduledTime), "HH:mm")}`}
      >
        <div className={cn("flex items-start", compact ? "gap-3" : "gap-2")}>
          <div className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-white/10 bg-white/[0.05] text-primary",
            compact ? "h-16 w-20" : "h-14 w-16"
          )}>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ContentIcon className="h-4 w-4" />
            )}
            <span className={cn(
              "absolute bottom-1 left-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[9px] font-semibold leading-none shadow-sm",
              getPlatformBadgeClass(post.platform)
            )}>
              {getPlatformMark(post.platform)}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <Clock3 className="h-3 w-3 shrink-0" />
                <span>{format(parseISO(post.scheduledTime), "HH:mm")}</span>
              <span>·</span>
                <span className="truncate normal-case tracking-normal">{platformLabel}</span>
              <span>·</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {readinessWarning ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-300" aria-label={readinessWarning} />
                ) : null}
                <Badge variant="outline" className={cn("border px-1.5 py-0 text-[9px] uppercase tracking-[0.12em]", getPostBadgeClass(post.status))}>
                  {STATUS_LABELS[post.status]}
                </Badge>
              </div>
            </div>
            <div className="mt-1 line-clamp-2 font-medium leading-4 text-white">{captionSnippet}</div>
            <div className="mt-1 truncate text-[10px] text-muted-foreground">
              {accountLabel}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 capitalize">
                <ContentIcon className="h-3 w-3" />
                {post.contentType || "text"}
              </span>
              {post.assetIds.length > 0 ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5">
                  {post.assetIds.length} asset{post.assetIds.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            {compact && post.caption ? (
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/70">{post.caption}</div>
            ) : null}
            <div className="mt-1 truncate text-[10px] text-muted-foreground">
              {getCampaignLabel(campaignMap, post.campaignId)}
            </div>
            {readinessWarning ? (
              <div className="mt-1 line-clamp-1 text-[10px] text-amber-200">{readinessWarning}</div>
            ) : null}
            {compact ? (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <GripVertical className={cn("h-3.5 w-3.5", canDrag ? "text-white/60" : "text-white/20")} />
                <span>{canDrag ? "Drag to reschedule" : "Locked"}</span>
              </div>
            ) : null}
          </div>
          <GripVertical className={cn("h-4 w-4 shrink-0 transition-colors", canDrag ? "text-white/45 group-hover:text-white/80" : "text-white/15")} />
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
                {(["month", "week", "agenda", "queue", "analytics"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    variant={viewMode === mode ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode(mode)}
                    className="h-8 px-3"
                  >
                    {mode === "month" ? "Month" : mode === "week" ? "Week" : mode === "agenda" ? "Agenda" : mode === "queue" ? "Queue" : "Analytics"}
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
              <Button
                variant={publishingControls?.paused ? "default" : "outline"}
                size="sm"
                onClick={() => setPublishingPaused(!(publishingControls?.paused === true))}
                disabled={publishingControlLoading}
                className={cn(publishingControls?.paused && "bg-amber-500/20 text-amber-100 hover:bg-amber-500/30")}
              >
                {publishingControlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : publishingControls?.paused ? <Clock3 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {publishingControls?.paused ? "Resume publishing" : "Pause all"}
              </Button>
            </div>
          </div>

          {publishingControls?.paused ? (
            <div className="rounded-[18px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Scheduled publishing is paused. Drafting and scheduling still work, but the worker will skip your queued posts until you resume.
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {schedulerAnalyticsCards.map((card) => {
              const Icon = card.icon;
              return (
                <GlassCard key={card.label} className="depth-card-hover relative overflow-hidden p-4">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{card.label}</div>
                      <div className={cn("mt-2 text-2xl font-semibold", card.tone)}>{card.value}</div>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.045]">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <div className="mt-2 min-h-8 text-xs leading-4 text-muted-foreground">{card.helper}</div>
                </GlassCard>
              );
            })}
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
            <GlassCard className="accent-glow overflow-hidden p-0">
              <div className="depth-shell relative p-6">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(139,92,246,0.28),transparent_32%),radial-gradient(circle_at_10%_10%,rgba(79,157,255,0.18),transparent_34%)]" />
                <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-[#BFC6D4]">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Soma AI briefing
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white">
                      {getTimeGreeting()}, {creatorName}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                      You have {visibleSummary.totalPosts} post{visibleSummary.totalPosts === 1 ? "" : "s"} scheduled this month. Best posting time today: {suggestedPostingTime.label}.
                    </p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="depth-card rounded-[16px] p-3">
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Today</span>
                        <span className="mt-1 block text-sm font-medium text-white">
                          {todaysPosts.length} scheduled item{todaysPosts.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="depth-card rounded-[16px] p-3">
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Timing</span>
                        <span className="mt-1 block text-sm font-medium text-white">{suggestedPostingTime.source}</span>
                      </div>
                      <div className="depth-card rounded-[16px] p-3">
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Channel gap</span>
                        <span className="mt-1 block text-sm font-medium text-white">{inactivityInsight}</span>
                      </div>
                      <div className="depth-card rounded-[16px] p-3">
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">Performance</span>
                        <span className="mt-1 block text-sm font-medium text-white">{engagementInsight}</span>
                      </div>
                    </div>
                  </div>

                  <div className="depth-panel w-full rounded-[18px] p-4 xl:max-w-[300px]">
                    <div className="text-sm font-medium text-white">Want me to generate today&apos;s content?</div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Soma AI can create a platform-ready post from today&apos;s gaps, suggested timing, and connected channels.
                    </p>
                    <Button
                      type="button"
                      onClick={() => runSchedulerAIAction("generate_todays_content")}
                      disabled={Boolean(schedulerAiLoadingAction)}
                      className="floating-action mt-4 h-11 w-full rounded-[16px] bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF]"
                    >
                      {schedulerAiLoadingAction === "generate_todays_content" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Generate today&apos;s content
                    </Button>
                    <div className="mt-3 text-[11px] leading-5 text-muted-foreground">
                      Next post: {nextScheduledPost ? `${formatFriendlyTime(nextScheduledPost.scheduledTime)} · ${nextScheduledPost.platform}` : "Nothing scheduled yet"}
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          ) : null}

          {schedulerAiResult && !isEventsMode ? (
            <GlassCard className="border-primary/20 p-5 shadow-[0_20px_60px_rgba(91,95,255,0.16)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Soma AI generated
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-white">{schedulerAiResult.content.title || schedulerAiResult.label}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{schedulerAiResult.content.summary || "Review the generated draft before scheduling."}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" onClick={() => setSchedulerAiResult(null)} className="rounded-[14px]">
                    Dismiss
                  </Button>
                  <Button type="button" onClick={() => setWorkflowStep("preview")} className="rounded-[14px]">
                    Preview
                  </Button>
                </div>
              </div>
              <div className="mt-4 rounded-[16px] border border-white/10 bg-white/[0.035] p-4">
                <p className="whitespace-pre-line text-sm leading-6 text-[#BFC6D4]">{schedulerAiResult.content.generatedContent}</p>
              </div>
              {schedulerAiResult.content.strategicTips?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {schedulerAiResult.content.strategicTips.slice(0, 4).map((tip) => (
                    <span key={tip} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                      {tip}
                    </span>
                  ))}
                </div>
              ) : null}
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
                    <div className="depth-card rounded-[16px] p-3">
                      <div className="text-xl font-semibold text-white">{todaysPosts.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Today</div>
                    </div>
                    <div className="depth-card rounded-[16px] p-3">
                      <div className="text-xl font-semibold text-white">{contentGapDays.length}</div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Open days</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  <div className="depth-panel rounded-[18px] p-4">
                    <div className="text-sm font-medium text-white">Next scheduled post</div>
                    {nextScheduledPost ? (
                      <button
                        type="button"
                        onClick={() => setSelectedPostId(nextScheduledPost.scheduledPostId)}
                        className="depth-card depth-card-hover mt-3 w-full rounded-[14px] p-3 text-left"
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

                  <div className="depth-panel rounded-[18px] p-4">
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

                  <div className="depth-panel rounded-[18px] p-4">
                    <div className="text-sm font-medium text-white">Soma AI actions</div>
                    <div className="mt-3 grid gap-2">
                      <Button size="sm" variant="outline" onClick={() => runSchedulerAIAction("generate_todays_content")} disabled={Boolean(schedulerAiLoadingAction)} className="justify-start rounded-[14px]">
                        {schedulerAiLoadingAction === "generate_todays_content" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Generate today&apos;s content
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => runSchedulerAIAction("repurpose_video_captions")} disabled={Boolean(schedulerAiLoadingAction)} className="justify-start rounded-[14px]">
                        {schedulerAiLoadingAction === "repurpose_video_captions" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                        Repurpose video into captions
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => runSchedulerAIAction("fill_content_gap")} disabled={Boolean(schedulerAiLoadingAction) || contentGapDays.length === 0} className="justify-start rounded-[14px]">
                        {schedulerAiLoadingAction === "fill_content_gap" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                        Fill content gap
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => runSchedulerAIAction("create_7_day_campaign")} disabled={Boolean(schedulerAiLoadingAction)} className="justify-start rounded-[14px]">
                        {schedulerAiLoadingAction === "create_7_day_campaign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
                        Create a 7-day campaign
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-5 accent-glow">
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
                        <div key={account.socialAccountId} className="rounded-[14px] border border-amber-500/25 bg-amber-500/12 p-3 shadow-[0_12px_34px_rgba(245,158,11,0.08)]">
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
                      {viewMode === "month" ? format(currentMonth, "MMMM yyyy") : viewMode === "week" ? "Week view" : viewMode === "agenda" ? "Agenda" : viewMode === "queue" ? "Publishing queue" : "Publishing analytics"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {viewMode === "month"
                        ? "Drag posts onto a different day to reschedule them."
                        : viewMode === "week"
                          ? "A denser seven-day view for team coordination."
                          : viewMode === "agenda"
                            ? "A linear agenda for fast scanning and same-day planning."
                            : viewMode === "queue"
                              ? "Everything waiting for auto-publish, provider confirmation, or review."
                              : "Platform performance and publishing health from synced account data."}
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
                              "min-h-[230px] rounded-[16px] border p-2 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30",
                              inMonth ? "depth-panel" : "border-white/5 bg-white/[0.018] text-white/35",
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
                              {items.slice(0, 3).map((post) => renderPostCard(post))}
                              {items.length > 3 ? (
                                <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                  +{items.length - 3} more
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
                            "depth-panel min-h-[320px] rounded-[18px] p-3 text-left transition-colors",
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
                ) : viewMode === "queue" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="depth-panel rounded-[18px] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ready to auto-publish</div>
                        <div className="mt-2 text-2xl font-semibold text-white">{queuePosts.filter((post) => !getPostReadinessWarning(post, socialAccountMap, studioAssetMap) && post.status === "scheduled").length}</div>
                      </div>
                      <div className="depth-panel rounded-[18px] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Needs attention</div>
                        <div className={cn("mt-2 text-2xl font-semibold", postsNeedingAttention.length > 0 ? "text-amber-300" : "text-muted-foreground")}>{postsNeedingAttention.length}</div>
                      </div>
                      <div className="depth-panel rounded-[18px] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Awaiting confirmation</div>
                        <div className="mt-2 text-2xl font-semibold text-blue-300">{queuePosts.filter((post) => post.status === "publishing").length}</div>
                      </div>
                    </div>

                    {queuePosts.length > 0 ? (
                      <div className="space-y-3">
                        {queuePosts.map((post) => {
                          const warning = getPostReadinessWarning(post, socialAccountMap, studioAssetMap);
                          const account = getPostAccount(post, socialAccountMap);
                          return (
                            <button
                              key={post.scheduledPostId}
                              type="button"
                              onClick={() => setSelectedPostId(post.scheduledPostId)}
                              className="depth-panel depth-card-hover grid w-full gap-4 rounded-[18px] p-4 text-left md:grid-cols-[1fr_auto]"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className={cn("border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]", getPlatformBadgeClass(post.platform))}>
                                    {SOCIAL_PROVIDER_REGISTRY.find((item) => item.id === post.platform)?.label || post.platform}
                                  </Badge>
                                  <Badge variant="outline" className={cn("border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]", getPostBadgeClass(post.status))}>
                                    {STATUS_LABELS[post.status]}
                                  </Badge>
                                  {warning ? (
                                    <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      {warning}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-emerald-300">Publish-ready</span>
                                  )}
                                </div>
                                <div className="mt-2 line-clamp-1 text-sm font-medium text-white">
                                  {post.title || post.caption || "Scheduled post"}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {format(parseISO(post.scheduledTime), "EEE, MMM d, h:mm a")} · {account ? getAccountDisplayLabel(account) : "No account"} · {post.contentType || "text"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <GripVertical className="h-4 w-4" />
                                Open
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">
                        Nothing is queued yet. Create a scheduled post to activate auto-publishing.
                      </div>
                    )}
                  </div>
                ) : viewMode === "analytics" ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: "Reach", metric: reachMetric, icon: Eye },
                        { label: "Engagement", metric: engagementMetric, icon: BarChart3 },
                        { label: "Likes", metric: likesMetric, icon: Heart },
                        { label: "Comments", metric: commentsMetric, icon: MessageCircle },
                        { label: "Clicks", metric: clicksMetric, icon: MousePointerClick },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <div key={item.label} className="depth-panel rounded-[18px] p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
                                <div className="mt-2 text-2xl font-semibold text-white">{item.metric.synced ? formatCompactMetric(item.metric.value) : "0"}</div>
                              </div>
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">{item.metric.synced ? "Synced from connected accounts" : "Analytics not synced"}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                      <div className="depth-panel rounded-[18px] p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">Top performing posts</div>
                            <p className="mt-1 text-xs text-muted-foreground">Ranked by post-level engagement after provider sync.</p>
                          </div>
                          <Badge variant="outline" className="border-white/10 text-muted-foreground">{postAnalytics.length} synced</Badge>
                        </div>
                        <div className="mt-4 space-y-3">
                          {topPerformingPosts.length > 0 ? topPerformingPosts.map(({ record, post }, index) => {
                            const provider = SOCIAL_PROVIDER_REGISTRY.find((item) => item.id === record.platform);
                            const account = record.socialAccountId ? socialAccountMap[record.socialAccountId] : undefined;
                            return (
                              <button
                                key={record.analyticsId}
                                type="button"
                                onClick={() => post && setSelectedPostId(post.scheduledPostId)}
                                className="depth-card depth-card-hover grid w-full gap-3 rounded-[16px] p-3 text-left sm:grid-cols-[auto_1fr_auto]"
                              >
                                <div className="flex h-9 w-9 items-center justify-center rounded-[13px] border border-white/10 bg-white/[0.045] text-sm font-semibold text-white">
                                  {index + 1}
                                </div>
                                <div className="min-w-0">
                                  <div className="line-clamp-1 text-sm font-medium text-white">{post?.title || post?.caption || "Published post"}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {provider?.label || record.platform} · {account ? getAccountDisplayLabel(account) : "Synced post"} · {record.lastSyncedAt ? `Synced ${format(parseISO(record.lastSyncedAt), "MMM d")}` : "No sync timestamp"}
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-right text-xs">
                                  <div>
                                    <div className="font-semibold text-white">{formatCompactMetric(record.metrics.views || record.metrics.reach || record.metrics.impressions)}</div>
                                    <div className="text-muted-foreground">views</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-white">{formatCompactMetric((record.metrics.likes || 0) + (record.metrics.comments || 0) + (record.metrics.shares || 0) + (record.metrics.saves || 0) + (record.metrics.clicks || 0))}</div>
                                    <div className="text-muted-foreground">eng.</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold text-white">{formatEngagementRate(record.metrics.engagementRate || 0)}</div>
                                    <div className="text-muted-foreground">rate</div>
                                  </div>
                                </div>
                              </button>
                            );
                          }) : (
                            <div className="rounded-[16px] border border-dashed border-white/10 p-5 text-sm leading-6 text-muted-foreground">
                              Published post analytics will appear here after the sync worker receives provider metrics.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-4">
                        <div className="depth-panel rounded-[18px] p-5">
                          <div className="text-sm font-semibold text-white">Best posting time</div>
                          <div className="mt-4 flex items-end justify-between gap-4">
                            <div>
                              <div className="text-3xl font-semibold text-white">{bestPostingTimeFromAnalytics.label}</div>
                              <p className="mt-1 text-xs text-muted-foreground">{bestPostingTimeFromAnalytics.source}</p>
                            </div>
                            <Clock3 className="h-7 w-7 text-primary" />
                          </div>
                        </div>

                        <div className="depth-panel rounded-[18px] p-5">
                          <div className="text-sm font-semibold text-white">Post analytics totals</div>
                          <div className="mt-4 grid grid-cols-2 gap-2">
                            {[
                              ["Views", postAnalyticsTotals.views],
                              ["Reach", postAnalyticsTotals.reach],
                              ["Shares", postAnalyticsTotals.shares],
                              ["Saves", postAnalyticsTotals.saves],
                              ["Clicks", postAnalyticsTotals.clicks],
                              ["Impressions", postAnalyticsTotals.impressions],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-[14px] border border-white/10 bg-white/[0.035] p-3">
                                <div className="text-lg font-semibold text-white">{formatCompactMetric(Number(value))}</div>
                                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                      <div className="depth-panel rounded-[18px] p-5">
                        <div className="text-sm font-semibold text-white">Platform growth</div>
                        <div className="mt-4 space-y-3">
                          {platformAnalytics.length > 0 ? platformAnalytics.map((item) => (
                            <div key={item.provider.id} className="space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-white">{item.provider.label}</span>
                                <span className="text-muted-foreground">{item.records} post{item.records === 1 ? "" : "s"}</span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="rounded-[12px] bg-white/[0.035] p-2">
                                  <div className="font-semibold text-white">{formatCompactMetric(item.reach)}</div>
                                  <div className="text-muted-foreground">reach</div>
                                </div>
                                <div className="rounded-[12px] bg-white/[0.035] p-2">
                                  <div className="font-semibold text-white">{formatCompactMetric(item.views)}</div>
                                  <div className="text-muted-foreground">views</div>
                                </div>
                                <div className="rounded-[12px] bg-white/[0.035] p-2">
                                  <div className="font-semibold text-white">{formatCompactMetric(item.engagement)}</div>
                                  <div className="text-muted-foreground">eng.</div>
                                </div>
                              </div>
                            </div>
                          )) : (
                            <p className="text-sm leading-6 text-muted-foreground">No platform growth signals yet. Sync post analytics after publishing.</p>
                          )}
                        </div>
                      </div>

                      <div className="depth-panel rounded-[18px] p-5">
                        <div className="text-sm font-semibold text-white">Content gaps</div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {contentGapDays.slice(0, 8).map((day) => (
                            <button
                              key={day.toISOString()}
                              type="button"
                              onClick={() => {
                                setSelectedPostId(null);
                                setForm(buildEmptyForm(format(day, "yyyy-MM-dd")));
                              }}
                              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-white"
                            >
                              {format(day, "MMM d")}
                            </button>
                          ))}
                          {contentGapDays.length === 0 ? <p className="text-sm leading-6 text-muted-foreground">No calendar gaps in this month.</p> : null}
                        </div>
                      </div>

                      <div className="depth-panel rounded-[18px] p-5">
                        <div className="text-sm font-semibold text-white">Needs attention</div>
                        <div className="mt-4 space-y-2">
                          {postsNeedingAttention.slice(0, 5).map((post) => {
                            const warning = getPostReadinessWarning(post, socialAccountMap, studioAssetMap) || "Publish failed";
                            return (
                              <button
                                key={post.scheduledPostId}
                                type="button"
                                onClick={() => setSelectedPostId(post.scheduledPostId)}
                                className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-amber-400/30"
                              >
                                <span className="min-w-0">
                                  <span className="line-clamp-1 text-sm font-medium text-white">{post.title || post.caption || "Scheduled post"}</span>
                                  <span className="mt-1 line-clamp-1 text-xs text-amber-200">{warning}</span>
                                </span>
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                              </button>
                            );
                          })}
                          {postsNeedingAttention.length === 0 ? <p className="text-sm leading-6 text-muted-foreground">No scheduled posts need attention.</p> : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                      <div className="depth-panel rounded-[18px] p-5">
                        <div className="text-sm font-semibold text-white">Publishing health</div>
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Consistency score</span>
                            <span className="font-medium text-white">{consistencyScore}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF]" style={{ width: `${consistencyScore}%` }} />
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-[14px] border border-white/10 bg-white/[0.035] p-3">
                              <div className="text-lg font-semibold text-white">{visibleSummary.byStatus.published}</div>
                              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Published</div>
                            </div>
                            <div className="rounded-[14px] border border-white/10 bg-white/[0.035] p-3">
                              <div className="text-lg font-semibold text-white">{visibleSummary.byStatus.scheduled}</div>
                              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Scheduled</div>
                            </div>
                            <div className="rounded-[14px] border border-white/10 bg-white/[0.035] p-3">
                              <div className="text-lg font-semibold text-red-300">{visibleSummary.byStatus.failed}</div>
                              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Failed</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="depth-panel rounded-[18px] p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">Platform mix</div>
                            <p className="mt-1 text-xs text-muted-foreground">Scheduled and published posts by destination.</p>
                          </div>
                          <Button asChild size="sm" variant="outline" className="rounded-[14px]">
                            <Link href="/social/publish-attempts">Attempts</Link>
                          </Button>
                        </div>
                        <div className="mt-4 space-y-2">
                          {SOCIAL_PROVIDER_REGISTRY.map((provider) => {
                            const count = visibleSummary.byPlatform[provider.id] || 0;
                            const width = visibleSummary.totalPosts > 0 ? Math.max(6, Math.round((count / visibleSummary.totalPosts) * 100)) : 0;
                            return (
                              <div key={provider.id} className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{provider.label}</span>
                                  <span className="text-white/80">{count}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                  <div className={cn("h-full rounded-full", getPlatformBadgeClass(provider.id).includes("red") ? "bg-red-400" : "bg-primary")} style={{ width: `${width}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
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
                            "depth-panel depth-card-hover grid w-full gap-4 rounded-[18px] p-4 text-left md:grid-cols-[140px_1fr]",
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
                      <div className="mt-1 text-xl font-semibold text-white">{visibleSummary.byStatus[status]}</div>
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
                  <div className="m-5 rounded-[18px] border border-dashed border-white/15 bg-white/[0.045] p-5 shadow-[0_16px_45px_rgba(0,0,0,0.22)]">
                    <h3 className="text-sm font-semibold text-white">Connect an account first</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Connect {SOCIAL_PROVIDER_LIST_LABEL} before scheduling live posts.
                    </p>
                    <Button asChild className="mt-4 rounded-[16px]">
                      <Link href="/social">Connect social account</Link>
                    </Button>
                  </div>
                ) : null}

                <form className="space-y-3 p-5" onSubmit={handleSubmit}>
                  {!isEventsMode ? (
                    <div className="depth-shell rounded-[18px] p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Workflow</div>
                          <div className="mt-1 text-sm font-medium text-white">{activeWorkflowStep.title}</div>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-muted-foreground">
                          {workflowStepIndex + 1} of {COMPOSER_WORKFLOW_STEPS.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {COMPOSER_WORKFLOW_STEPS.map((step, index) => {
                          const active = workflowStep === step.id;
                          const complete = index < workflowStepIndex;
                          return (
                            <button
                              key={step.id}
                              type="button"
                              onClick={() => setWorkflowStep(step.id)}
                              className={cn(
                                "rounded-[16px] border px-3 py-3 text-left transition",
                                active
                                  ? "border-primary/60 bg-primary/15 text-white shadow-[0_16px_42px_rgba(91,95,255,0.18)]"
                                  : complete
                                    ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
                                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]"
                              )}
                            >
                              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em]">{index + 1}. {step.title}</span>
                              <span className="mt-1 block text-xs leading-4">{step.description}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {isEventsMode ? (
                    <ComposerSection title="Platform" description="Choose where this live event belongs." defaultOpen>
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
                                active ? "border-primary/60 bg-primary/15 text-white shadow-[0_14px_36px_rgba(91,95,255,0.16)]" : "depth-card text-muted-foreground hover:bg-white/[0.06]",
                                !connected && "cursor-not-allowed opacity-45"
                              )}
                            >
                              <span className="block font-medium">{provider.label}</span>
                              <span className="mt-1 block text-[11px]">{connected ? "Connected" : "Not connected"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </ComposerSection>
                  ) : (
                    <>
                      <ComposerSection title="Campaign" description="Optional grouping for this post." visible={workflowStep === "platform"}>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Campaign</label>
                          <select
                            className={cn("h-11 w-full rounded-[16px] border border-white/10 bg-background px-3 text-sm")}
                            value={form.campaignId}
                            onChange={(event) => updateField("campaignId", event.target.value)}
                            aria-label="Choose campaign for scheduled post"
                          >
                            <option value="">No campaign</option>
                            {campaigns.map((campaign) => (
                              <option key={campaign.socialCampaignId} value={campaign.socialCampaignId}>
                                {campaign.campaignName}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground">
                            {campaigns.length === 0 ? campaignOptionalLabel : "Campaigns keep related posts organized without changing how they publish."}
                          </p>
                        </div>
                      </ComposerSection>

                      <ComposerSection title="Destination" description="Choose connected accounts." defaultOpen visible={workflowStep === "platform"}>
                        <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-medium">Destination</label>
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
                                  active ? "border-primary/60 bg-primary/15 text-white shadow-[0_14px_36px_rgba(91,95,255,0.16)]" : "depth-card text-muted-foreground hover:bg-white/[0.06]"
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
                        </div>

                        <div className="space-y-3">
                        <label className="text-sm font-medium">Format</label>
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
                                  active ? "border-primary/60 bg-primary/15 text-white shadow-[0_14px_36px_rgba(91,95,255,0.16)]" : "depth-card text-muted-foreground hover:bg-white/[0.06]"
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
                        </div>
                      </ComposerSection>

                      {workflowStep === "format" ? (
                        <ComposerSection title="Format" description="Select the content shape for the selected destinations." defaultOpen>
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
                                    active ? "border-primary/60 bg-primary/15 text-white shadow-[0_14px_36px_rgba(91,95,255,0.16)]" : "depth-card text-muted-foreground hover:bg-white/[0.06]"
                                  )}
                                >
                                  <FormatIcon className="h-4 w-4" />
                                  {contentType}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {anyTargetRequiresMedia ? "This format requires media before auto-publishing." : "This format can publish text-first where the platform allows it."}
                          </p>
                        </ComposerSection>
                      ) : null}

                      {workflowStep === "ai" ? (
                        <div className="depth-panel rounded-[18px] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-white">Generate with Soma AI</div>
                              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                                Create the missing piece for this post before editing and previewing it.
                              </p>
                            </div>
                            <Sparkles className="h-5 w-5 text-primary" />
                          </div>
                          <div className="mt-4 grid gap-3">
                            <div className="depth-card rounded-[16px] p-3">
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Media</div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <Button asChild type="button" variant="outline" className="justify-start rounded-[14px]">
                                  <Link href={`/ai/image-studio?${new URLSearchParams({ source: "scheduler", action: "generate_image", platform: form.platform, returnTo: "/social/calendar?mode=scheduler" }).toString()}`}>
                                    <ImageIcon className="h-4 w-4" />
                                    Generate image
                                  </Link>
                                </Button>
                                <Button asChild type="button" variant="outline" className="justify-start rounded-[14px]">
                                  <Link href={`/ai/video-studio?${new URLSearchParams({ source: "scheduler", action: "generate_video", platform: form.platform, returnTo: "/social/calendar?mode=scheduler" }).toString()}`}>
                                    <Video className="h-4 w-4" />
                                    Generate video
                                  </Link>
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => loadStudioAssets()} className="justify-start rounded-[14px]">
                                  <RefreshCw className="h-4 w-4" />
                                  Find recent asset
                                </Button>
                                <Button asChild type="button" variant="ghost" className="justify-start rounded-[14px]">
                                  <Link href={buildAiStudioActionHref("repurpose_content", form)}>
                                    <SquareArrowOutUpRight className="h-4 w-4" />
                                    Repurpose content
                                  </Link>
                                </Button>
                              </div>
                            </div>
                            <div className="depth-card rounded-[16px] p-3">
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Copy</div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <Button type="button" variant="outline" onClick={() => runSchedulerAIAction("generate_todays_content")} disabled={Boolean(schedulerAiLoadingAction)} className="justify-start rounded-[14px]">
                                  {schedulerAiLoadingAction === "generate_todays_content" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                  Write caption
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => runSchedulerAIAction("shorten_x", { targetPlatform: "x" })} disabled={Boolean(schedulerAiLoadingAction)} className="justify-start rounded-[14px]">
                                  {schedulerAiLoadingAction === "shorten_x" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
                                  Shorten for X
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => runSchedulerAIAction("generate_hashtags")} disabled={Boolean(schedulerAiLoadingAction)} className="justify-start rounded-[14px]">
                                  {schedulerAiLoadingAction === "generate_hashtags" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hash className="h-4 w-4" />}
                                  Generate hashtags
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => runSchedulerAIAction("adapt_instagram", { targetPlatform: "instagram" })} disabled={Boolean(schedulerAiLoadingAction)} className="justify-start rounded-[14px]">
                                  {schedulerAiLoadingAction === "adapt_instagram" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                                  Adapt for Instagram
                                </Button>
                              </div>
                            </div>
                            <div className="depth-card rounded-[16px] p-3">
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Timing</div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <Button type="button" variant="outline" onClick={() => runSchedulerAIAction("suggest_best_time")} disabled={Boolean(schedulerAiLoadingAction)} className="justify-start rounded-[14px]">
                                  {schedulerAiLoadingAction === "suggest_best_time" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                                  Suggest best time
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => runSchedulerAIAction("fill_content_gap")}
                                  disabled={Boolean(schedulerAiLoadingAction) || contentGapDays.length === 0}
                                  className="justify-start rounded-[14px]"
                                >
                                  {schedulerAiLoadingAction === "fill_content_gap" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                                  Fill content gap
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <ComposerSection title="Media" description="Attach, upload, or generate visuals." badge={anyTargetRequiresMedia ? "Required" : "Optional"} defaultOpen={anyTargetRequiresMedia} visible={workflowStep === "ai"}>
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-sm font-medium">Selected media</label>
                          {selectedAssets.length > 0 ? <span className="text-xs text-muted-foreground">{selectedAssets.length} attached</span> : null}
                        </div>
                        <div className="depth-shell rounded-[18px] border-dashed p-4">
                          {selectedAssets.length > 0 ? (
                            <div className="space-y-3">
                              {selectedAssets.map(({ assetId, asset }, index) => {
                                const isVideoAsset = asset?.type === "video" || asset?.mimeType?.startsWith("video/");
                                const previewUrl = asset?.thumbnail || asset?.downloadUrl;
                                return (
                                  <div key={`${assetId}-${index}`} className="depth-card grid gap-3 rounded-[16px] p-3 sm:grid-cols-[120px_1fr]">
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
                                  <Link href={`/ai/image-studio?${new URLSearchParams({ source: "scheduler", action: "generate_image", platform: form.platform, returnTo: "/social/calendar?mode=scheduler" }).toString()}`}>Generate image</Link>
                                </Button>
                                <Button asChild size="sm" variant="outline" className="rounded-[14px]">
                                  <Link href={`/ai/video-studio?${new URLSearchParams({ source: "scheduler", action: "generate_video", platform: form.platform, returnTo: "/social/calendar?mode=scheduler" }).toString()}`}>Generate video</Link>
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => loadStudioAssets()} className="rounded-[14px]">
                                  Find recent asset
                                </Button>
                                <Button asChild size="sm" variant="ghost" className="rounded-[14px]">
                                  <Link href={buildAiStudioActionHref("repurpose_existing_content", form)}>Repurpose existing content</Link>
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="depth-panel rounded-[18px] p-4">
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
                                      active ? "border-primary/60 bg-primary/15 shadow-[0_14px_36px_rgba(91,95,255,0.14)]" : "depth-card hover:bg-white/[0.06]"
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
                      </ComposerSection>
                    </>
                  )}

                  <ComposerSection title={isEventsMode ? "Content" : "Content"} description={isEventsMode ? "Describe the event clearly." : "Caption, hashtags, CTA, and destination variants."} defaultOpen visible={isEventsMode || workflowStep === "edit"}>
                    <label className="text-sm font-medium">{isEventsMode ? postHeadingLabel : "Caption"}</label>
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
                          <Button type="button" size="sm" variant="outline" onClick={() => runSchedulerAIAction("generate_todays_content")} disabled={Boolean(schedulerAiLoadingAction)} className="rounded-[14px]">
                            {schedulerAiLoadingAction === "generate_todays_content" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            Write caption
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => runSchedulerAIAction("shorten_x", { targetPlatform: "x" })} disabled={Boolean(schedulerAiLoadingAction)} className="rounded-[14px]">
                            Shorten for X
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => runSchedulerAIAction("adapt_instagram", { targetPlatform: "instagram" })} disabled={Boolean(schedulerAiLoadingAction)} className="rounded-[14px]">
                            Adapt for Instagram
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => runSchedulerAIAction("repurpose_video_captions")} disabled={Boolean(schedulerAiLoadingAction)} className="rounded-[14px]">
                            Repurpose video
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => runSchedulerAIAction("generate_hashtags")} disabled={Boolean(schedulerAiLoadingAction)} className="rounded-[14px]">
                            Generate hashtags
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => runSchedulerAIAction("suggest_best_time")} disabled={Boolean(schedulerAiLoadingAction)} className="rounded-[14px]">
                            Suggest best time
                          </Button>
                        </div>
                        {publishTargetAccounts.length > 1 ? (
                          <div className="depth-panel space-y-3 rounded-[18px] p-4">
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
                  </ComposerSection>

                  {!isEventsMode && targetPlatforms.length > 0 ? (
                    <ComposerSection title="Advanced" description="Provider rules, internal notes, and timezone." visible={workflowStep === "edit"}>
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
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Post title</label>
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
                    </ComposerSection>
                  ) : null}

                  {!isEventsMode && workflowStep === "preview" ? (
                    <div className="depth-panel rounded-[18px] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">Preview</div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Review what will be created for each destination before choosing the final schedule.
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]", canSchedulePost ? "border-emerald-400/25 text-emerald-300" : "border-amber-400/25 text-amber-300")}>
                          {canSchedulePost ? "Ready" : "Needs input"}
                        </Badge>
                      </div>
                      <div className="mt-4 space-y-3">
                        <div className="depth-card rounded-[16px] p-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Destinations</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {publishTargetAccounts.length > 0 ? publishTargetAccounts.map((account) => (
                              <span key={account.socialAccountId} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs", getPlatformBadgeClass(account.providerId))}>
                                {account.providerLabel}
                                <span className="text-white/75">{getAccountDisplayLabel(account)}</span>
                              </span>
                            )) : (
                              <span className="text-sm text-muted-foreground">Choose at least one connected account.</span>
                            )}
                          </div>
                        </div>
                        <div className="depth-card overflow-hidden rounded-[16px]">
                          <div className="flex aspect-video items-center justify-center bg-black/35">
                            {selectedAssets[0]?.asset?.thumbnail || selectedAssets[0]?.asset?.downloadUrl ? (
                              selectedAssets[0]?.asset?.type === "video" || selectedAssets[0]?.asset?.mimeType?.startsWith("video/") ? (
                                <video src={selectedAssets[0]?.asset?.downloadUrl} className="h-full w-full object-cover" muted controls preload="metadata" />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={selectedAssets[0]?.asset?.thumbnail || selectedAssets[0]?.asset?.downloadUrl} alt="" className="h-full w-full object-cover" />
                              )
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                {form.contentType === "video" ? <Video className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
                                <span className="text-sm">{anyTargetRequiresMedia ? "Media required before scheduling" : "No media attached"}</span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-3 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="border-white/10 capitalize text-muted-foreground">{form.contentType}</Badge>
                              {selectedAssets.length > 0 ? (
                                <Badge variant="outline" className="border-white/10 text-muted-foreground">{selectedAssets.length} asset{selectedAssets.length === 1 ? "" : "s"}</Badge>
                              ) : null}
                              {form.campaignId ? (
                                <Badge variant="outline" className="border-white/10 text-muted-foreground">{getCampaignLabel(campaignMap, form.campaignId)}</Badge>
                              ) : null}
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Caption</div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/85">{form.caption || "No caption yet."}</p>
                            </div>
                            {(form.hashtags || form.cta) ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Hashtags</div>
                                  <p className="mt-1 text-sm text-white/80">{form.hashtags || "None"}</p>
                                </div>
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">CTA</div>
                                  <p className="mt-1 text-sm text-white/80">{form.cta || "None"}</p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <ComposerSection title="Schedule" description={isEventsMode ? "Choose the event date and series." : "Choose date and time."} visible={isEventsMode || workflowStep === "schedule"}>
                    <label className="text-sm font-medium">Date and time</label>
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
                    {isEventsMode ? (
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Series</label>
                        <select
                          className={cn("h-11 w-full rounded-[16px] border border-white/10 bg-background px-3 text-sm")}
                          value={form.campaignId}
                          onChange={(event) => updateField("campaignId", event.target.value)}
                          aria-label="Choose series for scheduled event"
                        >
                          <option value="">No series</option>
                          {campaigns.map((campaign) => (
                            <option key={campaign.socialCampaignId} value={campaign.socialCampaignId}>
                              {campaign.campaignName}
                            </option>
                          ))}
                        </select>
                        {campaigns.length === 0 ? <p className="text-xs text-muted-foreground">{campaignOptionalLabel}</p> : null}
                      </div>
                    ) : null}
                    {!isEventsMode ? (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => runSchedulerAIAction("suggest_best_time")} disabled={Boolean(schedulerAiLoadingAction)} className="rounded-[14px]">
                          {schedulerAiLoadingAction === "suggest_best_time" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Suggest best time
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => runSchedulerAIAction("fill_content_gap")}
                          disabled={Boolean(schedulerAiLoadingAction) || contentGapDays.length === 0}
                          className="rounded-[14px]"
                        >
                          {schedulerAiLoadingAction === "fill_content_gap" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Fill content gap
                        </Button>
                      </div>
                    ) : null}
                  </ComposerSection>

                  {isEventsMode ? (
                    <ComposerSection title="Advanced" description="Private event details and timezone.">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Event title</label>
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
                    </ComposerSection>
                  ) : null}

                  {!isEventsMode ? (
                    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] p-3">
                      <Button type="button" variant="ghost" onClick={goToPreviousWorkflowStep} disabled={workflowStepIndex === 0} className="rounded-[14px]">
                        Back
                      </Button>
                      <div className="text-center text-xs text-muted-foreground">
                        {activeWorkflowStep.title}
                        <span className="mx-2 text-white/25">/</span>
                        {workflowStepIndex + 1} of {COMPOSER_WORKFLOW_STEPS.length}
                      </div>
                      {workflowStep === "analytics" ? (
                        <Button type="button" variant="outline" onClick={() => setViewMode("analytics")} className="rounded-[14px]">
                          Open analytics
                        </Button>
                      ) : (
                        <Button type="button" onClick={goToNextWorkflowStep} className="rounded-[14px]">
                          Continue
                        </Button>
                      )}
                    </div>
                  ) : null}

                  {!isEventsMode && workflowStep === "publish" ? (
                    <div className="depth-panel rounded-[18px] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">Ready to queue</div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            This creates one publishable record per selected account and lets the scheduled worker publish it later.
                          </p>
                        </div>
                        <Badge variant="outline" className={cn("border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]", canSchedulePost ? "border-emerald-400/25 text-emerald-300" : "border-amber-400/25 text-amber-300")}>
                          {canSchedulePost ? "Schedule ready" : "Draft only"}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="depth-card rounded-[16px] p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Destinations</div>
                          <div className="mt-2 text-lg font-semibold text-white">{publishTargetAccounts.length}</div>
                        </div>
                        <div className="depth-card rounded-[16px] p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Format</div>
                          <div className="mt-2 text-lg font-semibold capitalize text-white">{form.contentType}</div>
                        </div>
                        <div className="depth-card rounded-[16px] p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Time</div>
                          <div className="mt-2 text-sm font-semibold text-white">
                            {form.scheduledDate && form.scheduledTime ? `${form.scheduledDate} · ${form.scheduledTime}` : "Not scheduled"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {!isEventsMode && workflowStep === "analytics" ? (
                    <div className="depth-panel rounded-[18px] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-white">Track analytics</div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            After the scheduled worker publishes this post, analytics sync will surface reach, engagement, likes, comments, and clicks in the Analytics view.
                          </p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Button type="button" variant="outline" onClick={() => setViewMode("queue")} className="rounded-[14px]">
                          Open queue
                        </Button>
                        <Button type="button" onClick={() => setViewMode("analytics")} className="rounded-[14px]">
                          Open analytics
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {(isEventsMode || workflowStep === "publish") ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button type="button" variant="outline" disabled={loading || !canSaveDraft} onClick={() => savePost("draft")} className="h-11 rounded-[16px]">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                        {saveDraftLabel}
                      </Button>
                      <Button type="button" disabled={loading || !canSchedulePost} onClick={() => savePost("scheduled")} className="h-11 rounded-[16px]">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {isEventsMode ? scheduleLabel : "Schedule for publishing"}
                      </Button>
                    </div>
                  ) : null}
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
                      <h2 className="text-lg font-semibold text-white">Post detail</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Worker readiness, publishing attempts, and synced provider analytics for this post.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedPost.status === "failed" ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => runPostControlAction(selectedPost.scheduledPostId, "retry")} disabled={loading} className="rounded-[12px]">
                          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Retry
                        </Button>
                      ) : null}
                      {!["published", "cancelled"].includes(selectedPost.status) ? (
                        <Button type="button" size="sm" variant="ghost" onClick={() => runPostControlAction(selectedPost.scheduledPostId, "cancel")} disabled={loading} className="rounded-[12px] text-red-200 hover:text-red-100">
                          <Trash2 className="h-3.5 w-3.5" />
                          Cancel
                        </Button>
                      ) : null}
                      {publishReadinessLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <SquareArrowOutUpRight className="h-5 w-5 text-primary" />}
                    </div>
                  </div>

                  <div className="mt-4 flex rounded-[14px] border border-white/10 bg-white/[0.035] p-1">
                    {(["readiness", "analytics"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setSelectedPostPanelTab(tab)}
                        className={cn(
                          "flex-1 rounded-[11px] px-3 py-2 text-sm transition",
                          selectedPostPanelTab === tab ? "bg-white/10 text-white shadow-sm" : "text-muted-foreground hover:text-white"
                        )}
                      >
                        {tab === "readiness" ? "Readiness" : "Analytics"}
                      </button>
                    ))}
                  </div>

                  {selectedPostPanelTab === "readiness" ? (
                    <>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="depth-card rounded-[16px] p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Payload</div>
                          <div className="mt-2 text-sm font-medium text-white">{publishPayload?.payloadVersion || "Not loaded"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{publishPayload?.content.mediaItems.length || 0} media item(s)</div>
                        </div>
                        <div className="depth-card rounded-[16px] p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Destination</div>
                          <div className="mt-2 truncate text-sm font-medium text-white">{publishPayload?.destination.handle || publishPayload?.destination.accountName || "No account"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{publishPayload?.platform || selectedPost.platform}</div>
                        </div>
                        <div className="depth-card rounded-[16px] p-3">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Attempts</div>
                          <div className="mt-2 text-sm font-medium text-white">{publishAttempts.length}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Recorded publish attempts</div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent attempts</div>
                          <Button asChild size="sm" variant="ghost" className="h-8 rounded-[12px]">
                            <Link href="/social/publish-attempts">View all attempts</Link>
                          </Button>
                        </div>
                        {publishAttempts.length > 0 ? publishAttempts.map((attempt) => (
                          <div key={attempt.publishAttemptId} className="depth-card rounded-[14px] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-medium text-white">Attempt #{attempt.attemptNumber}</div>
                              <Badge variant="outline" className={cn("border px-2 py-0 text-[10px] uppercase tracking-[0.16em]", attempt.status === "success" ? "border-emerald-500/25 text-emerald-300" : attempt.status === "failed" ? "border-red-500/25 text-red-300" : attempt.status === "pending_confirmation" ? "border-violet-500/25 text-violet-200" : "border-white/10 text-muted-foreground")}>
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
                    </>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {selectedPostLatestAnalytics ? (
                        <>
                          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                            {[
                              ["Likes", selectedPostLatestAnalytics.metrics.likes],
                              ["Comments", selectedPostLatestAnalytics.metrics.comments],
                              ["Shares", selectedPostLatestAnalytics.metrics.shares],
                              ["Saves", selectedPostLatestAnalytics.metrics.saves],
                              ["Clicks", selectedPostLatestAnalytics.metrics.clicks],
                              ["Views", selectedPostLatestAnalytics.metrics.views],
                              ["Reach", selectedPostLatestAnalytics.metrics.reach],
                              ["Impressions", selectedPostLatestAnalytics.metrics.impressions],
                              ["Engagement", formatEngagementRate(selectedPostLatestAnalytics.metrics.engagementRate || 0)],
                            ].map(([label, value]) => (
                              <div key={label} className="depth-card rounded-[16px] p-3">
                                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
                                <div className="mt-2 text-sm font-medium text-white">{typeof value === "number" ? formatCompactMetric(value) : value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-[16px] border border-white/10 bg-white/[0.035] p-4">
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Provider permalink</div>
                            {selectedPostLatestAnalytics.providerPermalink ? (
                              <Link href={selectedPostLatestAnalytics.providerPermalink} target="_blank" rel="noreferrer" className="mt-2 line-clamp-1 text-sm text-primary hover:underline">
                                {selectedPostLatestAnalytics.providerPermalink}
                              </Link>
                            ) : (
                              <div className="mt-2 text-sm text-muted-foreground">No provider permalink synced yet.</div>
                            )}
                            <div className="mt-3 text-xs text-muted-foreground">
                              Last synced: {selectedPostLatestAnalytics.lastSyncedAt ? format(parseISO(selectedPostLatestAnalytics.lastSyncedAt), "MMM d, yyyy h:mm a") : "Not synced"}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-[16px] border border-dashed border-white/10 p-5 text-sm leading-6 text-muted-foreground">
                          Post analytics will appear here after the post is published and the analytics sync worker receives provider metrics.
                        </div>
                      )}
                    </div>
                  )}
                </GlassCard>
              ) : null}

              <GlassCard className="p-5 accent-glow">
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
                        "depth-card depth-card-hover flex w-full items-start justify-between gap-3 rounded-[14px] p-3 text-left",
                        selectedPostId === post.scheduledPostId && "border-primary/40 bg-primary/10 shadow-[0_14px_36px_rgba(91,95,255,0.14)]"
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

              <GlassCard className="p-5 accent-glow">
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
                        "depth-card depth-card-hover flex w-full items-start justify-between gap-3 rounded-[14px] p-3 text-left",
                        selectedCampaignId === campaign.socialCampaignId && "border-primary/40 bg-primary/10 shadow-[0_14px_36px_rgba(91,95,255,0.14)]"
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
