"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  GraduationCap,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  Video,
} from "lucide-react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { authFetch } from "@/lib/clientApi";
import { normalizeDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { EventRecord, EventStatus, EventType } from "@/events/types";

type EventTab = "upcoming" | "live" | "replays" | "mine" | "all";

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  live_class: "Live class",
  workshop: "Workshop",
  coaching_call: "Coaching call",
  webinar: "Webinar",
  community_event: "Community event",
};

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live now",
  completed: "Replay",
  cancelled: "Cancelled",
};

const FILTER_TABS: Array<{ id: EventTab; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "live", label: "Live now" },
  { id: "replays", label: "Replays" },
  { id: "mine", label: "My RSVPs" },
  { id: "all", label: "All events" },
];

const EVENT_TYPES: Array<EventType | "all"> = ["all", "live_class", "workshop", "coaching_call", "webinar", "community_event"];

function getMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return getMonthKey(date);
}

function formatMonth(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatEventDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatEventDay(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatEventTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function getDurationLabel(event: EventRecord) {
  if (!event.endsAt) return "Session time";
  const start = normalizeDate(event.startsAt)?.getTime() || 0;
  const end = normalizeDate(event.endsAt)?.getTime() || 0;
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (!minutes) return "Session time";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function toCalendarDate(value: string) {
  return (normalizeDate(value) || new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarUrl(event: EventRecord) {
  const start = toCalendarDate(event.startsAt);
  const startDate = normalizeDate(event.startsAt) || new Date();
  const end = toCalendarDate(event.endsAt || new Date(startDate.getTime() + 60 * 60 * 1000).toISOString());
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description,
    location: event.meetingUrl || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function eventMatchesTab(event: EventRecord, tab: EventTab) {
  if (tab === "all") return event.status !== "cancelled";
  if (tab === "live") return event.status === "live";
  if (tab === "replays") return event.status === "completed";
  if (tab === "mine") return event.viewerRsvp === "going";
  return event.status === "scheduled" || event.status === "live";
}

function EventStatusBadge({ status }: { status: EventStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        status === "live" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
        status === "scheduled" && "border-blue-400/30 bg-blue-400/10 text-blue-200",
        status === "completed" && "border-violet-400/30 bg-violet-400/10 text-violet-200",
        status === "cancelled" && "border-red-400/30 bg-red-400/10 text-red-200",
        status === "draft" && "border-white/10 bg-white/[0.06] text-[#BFC6D4]"
      )}
    >
      {EVENT_STATUS_LABELS[status]}
    </span>
  );
}

function EventCard({
  event,
  featured = false,
  busy,
  onRsvp,
  onCancelRsvp,
}: {
  event: EventRecord;
  featured?: boolean;
  busy?: boolean;
  onRsvp: (eventId: string) => void;
  onCancelRsvp: (eventId: string) => void;
}) {
  const canJoin = Boolean(event.meetingUrl && (event.status === "scheduled" || event.status === "live"));
  const canReplay = Boolean(event.replayUrl && event.status === "completed");
  const canRsvp = event.status === "scheduled" || event.status === "live";
  const isGoing = event.viewerRsvp === "going";
  const isFull = event.capacity !== null && event.capacity !== undefined && event.rsvpCount >= event.capacity && !isGoing;

  return (
    <GlassCard
      className={cn(
        "group overflow-hidden rounded-[24px] border-white/10 bg-white/[0.045] p-0 transition duration-300 hover:-translate-y-1 hover:border-violet-400/30 hover:bg-white/[0.065] hover:shadow-[0_24px_80px_rgba(91,95,255,0.18)]",
        featured && "lg:col-span-2"
      )}
    >
      <div className="relative min-h-[160px] overflow-hidden border-b border-white/[0.06] bg-[#111827]">
        {event.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverImageUrl} alt="" className="h-full min-h-[160px] w-full object-cover opacity-80 transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(91,95,255,.44),transparent_30%),radial-gradient(circle_at_78%_30%,rgba(79,157,255,.32),transparent_28%),linear-gradient(135deg,rgba(139,92,246,.28),rgba(9,11,19,.82))]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090B13] via-[#090B13]/40 to-transparent" />
        <div className="absolute left-5 top-5 flex items-center gap-2">
          <EventStatusBadge status={event.status} />
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-xs text-[#BFC6D4] backdrop-blur">
            {EVENT_TYPE_LABELS[event.eventType]}
          </span>
        </div>
        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-[#BFC6D4]">{formatEventDay(event.startsAt, event.timezone)}</div>
            <div className="text-2xl font-semibold text-white">{formatEventTime(event.startsAt, event.timezone)}</div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-xs text-white backdrop-blur">
            {getDurationLabel(event)}
          </span>
        </div>
      </div>
      <div className="space-y-5 p-5">
        <div className="space-y-2">
          <Link href={`/events/${event.eventId}`} className="block text-lg font-semibold text-white transition hover:text-violet-200">
            {event.title}
          </Link>
          <p className="line-clamp-2 text-sm leading-6 text-[#BFC6D4]">{event.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#7E8799]">
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {event.hostName || "SDC Team"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {event.timezone}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {event.capacity ? `${event.rsvpCount}/${event.capacity} going` : `${event.rsvpCount} going`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="rounded-2xl bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] text-white shadow-[0_16px_48px_rgba(91,95,255,.28)]">
            <Link href={`/events/${event.eventId}`}>Details</Link>
          </Button>
          {canJoin && (
            <Button asChild variant="outline" className="rounded-2xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]">
              <a href={event.meetingUrl} target="_blank" rel="noreferrer">
                Join <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          )}
          {canReplay && (
            <Button asChild variant="outline" className="rounded-2xl border-violet-400/20 bg-violet-400/10 text-violet-100 hover:bg-violet-400/15">
              <a href={event.replayUrl} target="_blank" rel="noreferrer">
                Replay <PlayCircle className="h-4 w-4" />
              </a>
            </Button>
          )}
          {canRsvp && (
            isGoing ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onCancelRsvp(event.eventId)}
                className="rounded-2xl border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15"
              >
                Going
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy || isFull}
                onClick={() => onRsvp(event.eventId)}
                className="rounded-2xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
              >
                {isFull ? "Full" : "RSVP"}
              </Button>
            )
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function EventsPageContent() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [month, setMonth] = useState(getMonthKey());
  const [tab, setTab] = useState<EventTab>("upcoming");
  const [type, setType] = useState<EventType | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month, limit: "200", status: "all" });
      if (type !== "all") params.set("type", type);
      const response = await authFetch(`/api/events?${params.toString()}`);
      const payload = (await response.json()) as { events?: EventRecord[]; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message || "Unable to load events.");
      }
      setEvents(payload.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [month, type]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events
      .filter((event) => eventMatchesTab(event, tab))
      .filter((event) => !normalizedQuery || `${event.title} ${event.description} ${event.hostName || ""}`.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => (normalizeDate(a.startsAt)?.getTime() || 0) - (normalizeDate(b.startsAt)?.getTime() || 0));
  }, [events, query, tab]);

  const upcoming = events.filter((event) => event.status === "scheduled" || event.status === "live").length;
  const replays = events.filter((event) => event.status === "completed" && event.replayUrl).length;
  const myRsvps = events.filter((event) => event.viewerRsvp === "going").length;
  const liveEvent = events.find((event) => event.status === "live");
  const nextEvent = filteredEvents[0] || events.find((event) => event.status === "scheduled" || event.status === "live");

  const updateEventInState = useCallback((updated: EventRecord) => {
    setEvents((current) => current.map((event) => (event.eventId === updated.eventId ? updated : event)));
  }, []);

  const handleRsvp = useCallback(async (eventId: string) => {
    setBusyEventId(eventId);
    setError(null);
    try {
      const response = await authFetch(`/api/events/${eventId}/rsvp`, { method: "POST" });
      const payload = (await response.json()) as { event?: EventRecord; error?: string };
      if (!response.ok || !payload.event) {
        throw new Error(payload.error || "Unable to RSVP.");
      }
      updateEventInState(payload.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to RSVP.");
    } finally {
      setBusyEventId(null);
    }
  }, [updateEventInState]);

  const handleCancelRsvp = useCallback(async (eventId: string) => {
    setBusyEventId(eventId);
    setError(null);
    try {
      const response = await authFetch(`/api/events/${eventId}/rsvp`, { method: "DELETE" });
      const payload = (await response.json()) as { event?: EventRecord; error?: string };
      if (!response.ok || !payload.event) {
        throw new Error(payload.error || "Unable to cancel RSVP.");
      }
      updateEventInState(payload.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel RSVP.");
    } finally {
      setBusyEventId(null);
    }
  }, [updateEventInState]);

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#090B13]">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
          <section className="relative overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#111827]/70 p-6 shadow-[0_24px_80px_rgba(0,0,0,.35)] sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_12%,rgba(91,95,255,.30),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(79,157,255,.22),transparent_30%),linear-gradient(135deg,rgba(139,92,246,.18),transparent_55%)]" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_360px] lg:items-end">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-violet-100">
                  <CalendarDays className="h-4 w-4" />
                  Events
                </div>
                <div className="space-y-3">
                  <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">Live classes, coaching calls, and replays in one calm workspace.</h1>
                  <p className="max-w-2xl text-base leading-7 text-[#BFC6D4]">
                    Join SDC sessions, plan around upcoming workshops, and revisit replays when your schedule gets full.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {FILTER_TABS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={cn(
                        "rounded-2xl border px-4 py-2 text-sm transition",
                        tab === item.id ? "border-violet-400/40 bg-violet-400/20 text-white" : "border-white/10 bg-white/[0.04] text-[#BFC6D4] hover:bg-white/[0.07]"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <GlassCard className="rounded-[24px] border-white/10 bg-white/[0.05] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#BFC6D4]">Next session</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">{liveEvent ? "Live now" : nextEvent ? formatEventDate(nextEvent.startsAt, nextEvent.timezone) : "No upcoming sessions"}</h2>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-[#5B5FFF] to-[#8B5CF6] p-3 text-white">
                    <Video className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/[0.06] bg-[#090B13]/55 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#7E8799]">Upcoming</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{upcoming}</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.06] bg-[#090B13]/55 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#7E8799]">Replays</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{replays}</p>
                  </div>
                  <div className="col-span-2 rounded-2xl border border-white/[0.06] bg-[#090B13]/55 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#7E8799]">My RSVPs</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{myRsvps}</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <GlassCard className="rounded-[24px] border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth((value) => shiftMonth(value, -1))} className="rounded-2xl border-white/10 bg-white/[0.04] text-white">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[180px] rounded-2xl border border-white/10 bg-[#090B13]/70 px-4 py-2 text-center font-medium text-white">
                    {formatMonth(month)}
                  </div>
                  <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth((value) => shiftMonth(value, 1))} className="rounded-2xl border-white/10 bg-white/[0.04] text-white">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setMonth(getMonthKey())} className="rounded-2xl border-white/10 bg-white/[0.04] text-white">
                    Today
                  </Button>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="relative min-w-[240px]">
                    <span className="sr-only">Search events</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7E8799]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search sessions"
                      className="h-11 w-full rounded-2xl border border-white/10 bg-[#090B13]/70 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-[#7E8799] focus:border-violet-400/50"
                    />
                  </label>
                  <label>
                    <span className="sr-only">Filter by event type</span>
                    <select
                      value={type}
                      onChange={(event) => setType(event.target.value as EventType | "all")}
                      className="h-11 rounded-2xl border border-white/10 bg-[#090B13]/70 px-4 text-sm text-white outline-none transition focus:border-violet-400/50"
                    >
                      {EVENT_TYPES.map((item) => (
                        <option key={item} value={item}>
                          {item === "all" ? "All session types" : EVENT_TYPE_LABELS[item]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button variant="outline" onClick={() => void loadEvents()} className="rounded-2xl border-white/10 bg-white/[0.04] text-white">
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="rounded-[24px] border-white/10 bg-gradient-to-br from-violet-500/15 via-blue-500/10 to-transparent p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white/[0.08] p-3 text-violet-100">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">How to use Events</h2>
                  <p className="text-sm text-[#BFC6D4]">Join live, save to calendar, or watch eligible replays later.</p>
                </div>
              </div>
            </GlassCard>
          </section>

          {error && <GlassCard className="rounded-[24px] border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">{error}</GlassCard>}

          {loading ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <GlassCard key={index} className="h-[360px] animate-pulse rounded-[24px] border-white/10 bg-white/[0.035]" />
              ))}
            </div>
          ) : filteredEvents.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredEvents.map((event, index) => (
                <EventCard
                  key={event.eventId}
                  event={event}
                  featured={index === 0 && tab === "upcoming"}
                  busy={busyEventId === event.eventId}
                  onRsvp={(id) => void handleRsvp(id)}
                  onCancelRsvp={(id) => void handleCancelRsvp(id)}
                />
              ))}
            </div>
          ) : (
            <GlassCard className="rounded-[28px] border-dashed border-white/10 bg-white/[0.025] p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-[#4F9DFF]">
                <GraduationCap className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-white">No sessions found</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#BFC6D4]">
                There are no eligible events for this view yet. Try another month or filter, or check back when the SDC team publishes the next live class.
              </p>
            </GlassCard>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function EventsPage() {
  return (
    <ProtectedRoute>
      <EventsPageContent />
    </ProtectedRoute>
  );
}
