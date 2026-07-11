"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  Clock3,
  Loader2,
  PencilLine,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  GripVertical,
  SquareArrowOutUpRight,
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
} from "@/social/types";

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

interface CalendarFormState {
  title: string;
  caption: string;
  platform: SocialPlatform;
  status: ScheduledPostStatus;
  scheduledDate: string;
  scheduledTime: string;
  assetIds: string;
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
  published: "Published",
  failed: "Failed",
  editing: "Editing",
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
    status: post.status,
    scheduledDate: scheduled.scheduledDate,
    scheduledTime: scheduled.scheduledTime,
    assetIds: (post.assetIds || []).join(", "),
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
    status: "draft",
    scheduledDate: date,
    scheduledTime: "09:00",
    assetIds: "",
    campaignId: "",
    notes: "",
    timezone: "",
  };
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

export default function SocialCalendarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
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
      published: 0,
      failed: 0,
      editing: 0,
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
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
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
      published: 0,
      failed: 0,
      editing: 0,
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

  const updateField = <K extends keyof CalendarFormState>(key: K, value: CalendarFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateCampaignField = <K extends keyof CampaignFormState>(key: K, value: CampaignFormState[K]) => {
    setCampaignForm((current) => ({ ...current, [key]: value }));
  };

  const clearForm = () => {
    setSelectedPostId(null);
    setForm(buildEmptyForm(format(currentMonth, "yyyy-MM-dd")));
  };

  const clearCampaignForm = () => {
    setSelectedCampaignId(null);
    setCampaignForm(buildEmptyCampaignForm());
  };

  const refreshCalendar = async () => {
    try {
      setLoading(true);
      await loadMonth();
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || loading) return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const payload = {
        title: form.title || undefined,
        caption: form.caption,
        platform: form.platform,
        status: form.status,
        scheduledTime: combineDateAndTime(form.scheduledDate, form.scheduledTime),
        assetIds: form.assetIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        campaignId: form.campaignId || undefined,
        notes: form.notes || undefined,
        timezone: form.timezone || undefined,
      };

      const response = await fetch(selectedPostId ? `/api/social/scheduled-posts/${selectedPostId}` : "/api/social/scheduled-posts", {
        method: selectedPostId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Could not save scheduled post.");
      }

      const data = (await response.json()) as CalendarPostResponse;
      setSelectedPostId(data.post.scheduledPostId);
      await loadMonth();
      toast({
        title: "Scheduled post saved",
        description: "The calendar entry has been updated.",
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
    if (!post || post.status === "published") return;

    try {
      setLoading(true);
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/social/scheduled-posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          moveOnly: true,
          scheduledTime: combineDateAndTime(day, format(parseISO(post.scheduledTime), "HH:mm")),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Could not move scheduled post.");
      }

      await loadMonth();
      toast({
        title: "Post moved",
        description: "The scheduled time has been updated.",
      });
    } catch (error) {
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

  const renderPostCard = (post: ScheduledPostRecord, compact = false) => (
    <div
      key={post.scheduledPostId}
      draggable={post.status !== "published"}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData("text/plain", post.scheduledPostId);
      }}
      onClick={(event) => {
        event.stopPropagation();
        setSelectedPostId(post.scheduledPostId);
      }}
      className={cn(
        "group rounded-md border px-2 py-1 text-xs shadow-sm transition-transform hover:-translate-y-0.5",
        post.status === "published"
          ? "border-emerald-500/20 bg-emerald-500/10"
          : post.status === "failed"
            ? "border-red-500/20 bg-red-500/10"
            : "border-white/10 bg-black/20",
        compact && "px-3 py-2"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{post.title || post.caption.slice(0, 26) || "Untitled post"}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            {format(parseISO(post.scheduledTime), "HH:mm")}
          </div>
          <div className="mt-1 truncate text-[10px] text-muted-foreground">
            {getCampaignLabel(campaignMap, post.campaignId)}
          </div>
        </div>
        <Badge variant="outline" className={cn("border px-1.5 py-0 text-[10px] uppercase tracking-[0.16em]", getPostBadgeClass(post.status))}>
          {post.status}
        </Badge>
      </div>
    </div>
  );

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary">
                <CalendarDays className="h-5 w-5" />
                <span className="text-xs font-semibold uppercase tracking-[0.24em]">Content Calendar</span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Schedule content across the month</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Plan, edit, and move social content in one visual calendar. Drag a post to a new day when a reschedule makes more sense.
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
                              "min-h-[170px] rounded-md border p-2 text-left transition-colors",
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
                            "min-h-[240px] rounded-md border border-white/10 bg-white/5 p-3 text-left transition-colors",
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
                              <div className="rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-xs text-muted-foreground">
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
                      return (
                        <button
                          key={post.scheduledPostId}
                          type="button"
                          onClick={() => setSelectedPostId(post.scheduledPostId)}
                          draggable={post.status !== "published"}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", post.scheduledPostId);
                          }}
                          className={cn(
                            "flex w-full items-start justify-between gap-4 rounded-md border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-primary/30",
                            post.status === "published" && "bg-emerald-500/5",
                            post.status === "failed" && "bg-red-500/5"
                          )}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{post.title || post.caption.slice(0, 42) || "Untitled post"}</span>
                              <Badge variant="outline" className={cn("border px-1.5 py-0 text-[10px] uppercase tracking-[0.16em]", getPostBadgeClass(post.status))}>
                                {post.status}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {dateLabel} · {format(parseISO(post.scheduledTime), "HH:mm")} · {post.platform}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {getCampaignLabel(campaignMap, post.campaignId)}
                            </div>
                            <div className="line-clamp-2 text-sm text-white/80">{post.caption}</div>
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
              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedPost ? "Edit scheduled post" : "Create scheduled post"}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedPost ? "Update the selected entry or move it to a new slot." : "Add a new calendar item for the chosen day."}
                    </p>
                  </div>
                  <PencilLine className="h-5 w-5 text-primary" />
                </div>

                <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Platform</label>
                      <select
                        className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                        value={form.platform}
                        onChange={(event) => updateField("platform", event.target.value as SocialPlatform)}
                        aria-label="Scheduled post platform"
                      >
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
                        value={form.status}
                        onChange={(event) => updateField("status", event.target.value as ScheduledPostStatus)}
                        aria-label="Scheduled post status"
                      >
                        {SCHEDULED_POST_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input value={form.title} onChange={(event) => updateField("title", event.target.value)} placeholder="Optional post title" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Caption</label>
                    <Textarea value={form.caption} onChange={(event) => updateField("caption", event.target.value)} rows={5} placeholder="Write the post copy or publishing notes." />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date</label>
                      <Input type="date" value={form.scheduledDate} onChange={(event) => updateField("scheduledDate", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Time</label>
                      <Input type="time" value={form.scheduledTime} onChange={(event) => updateField("scheduledTime", event.target.value)} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Asset IDs</label>
                      <Input value={form.assetIds} onChange={(event) => updateField("assetIds", event.target.value)} placeholder="Comma-separated asset IDs" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Campaign ID</label>
                      <select
                        className={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}
                        value={form.campaignId}
                        onChange={(event) => updateField("campaignId", event.target.value)}
                        aria-label="Scheduled post campaign"
                      >
                        <option value="">No campaign</option>
                        {campaigns.map((campaign) => (
                          <option key={campaign.socialCampaignId} value={campaign.socialCampaignId}>
                            {campaign.campaignName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Timezone</label>
                    <Input value={form.timezone} onChange={(event) => updateField("timezone", event.target.value)} placeholder="Africa/Nairobi" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} rows={3} placeholder="Internal reminders, context, or approval notes." />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : selectedPost ? <PencilLine className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {selectedPost ? "Save Changes" : "Add to Calendar"}
                    </Button>
                    <Button type="button" variant="outline" onClick={clearForm} disabled={loading}>
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

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedCampaign ? "Edit campaign" : "Create campaign"}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedCampaign ? "Update the selected campaign or archive it." : "Group related posts under a shared campaign."}
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
                    <h2 className="text-lg font-semibold">Upcoming items</h2>
                    <p className="text-sm text-muted-foreground">A quick list of the month&apos;s scheduled entries.</p>
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
                      No scheduled content for this month yet.
                    </div>
                  ) : null}
                </div>
              </GlassCard>

              <GlassCard className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Campaigns</h2>
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
