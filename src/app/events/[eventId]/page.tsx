"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarPlus,
  Clock,
  ExternalLink,
  Lock,
  PlayCircle,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { authFetch } from "@/lib/clientApi";
import { cn } from "@/lib/utils";
import type { EventRecord, EventStatus, EventType, EventVisibility } from "@/events/types";

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
  completed: "Replay available",
  cancelled: "Cancelled",
};

const VISIBILITY_LABELS: Record<EventVisibility, string> = {
  all: "All members",
  explorer: "Explorer and above",
  pro: "Pro and Elite",
  elite: "Elite only",
  custom: "Selected members",
};

function formatEventDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function getDurationLabel(event: EventRecord) {
  if (!event.endsAt) return "Duration shared in session";
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (!minutes) return "Duration shared in session";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function toCalendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarUrl(event: EventRecord) {
  const start = toCalendarDate(event.startsAt);
  const fallbackEnd = new Date(new Date(event.startsAt).getTime() + 60 * 60 * 1000).toISOString();
  const end = toCalendarDate(event.endsAt || fallbackEnd);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    details: event.description,
    location: event.meetingUrl || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function StatusBadge({ status }: { status: EventStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
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

function EventsDetailContent() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRsvp, setSavingRsvp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/events/${eventId}`);
      const payload = (await response.json()) as { event?: EventRecord; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message || "Unable to load event.");
      }
      setEvent(payload.event || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load event.");
      setEvent(null);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  const calendarUrl = useMemo(() => (event ? buildGoogleCalendarUrl(event) : ""), [event]);

  const canJoin = Boolean(event?.meetingUrl && (event.status === "scheduled" || event.status === "live"));
  const canReplay = Boolean(event?.replayUrl && event.status === "completed");
  const canRsvp = Boolean(event && (event.status === "scheduled" || event.status === "live"));
  const isGoing = event?.viewerRsvp === "going";
  const isFull = Boolean(event && event.capacity !== null && event.capacity !== undefined && event.rsvpCount >= event.capacity && !isGoing);

  const handleRsvp = useCallback(async () => {
    if (!event) return;
    setSavingRsvp(true);
    setError(null);
    try {
      const response = await authFetch(`/api/events/${event.eventId}/rsvp`, { method: "POST" });
      const payload = (await response.json()) as { event?: EventRecord; error?: string };
      if (!response.ok || !payload.event) {
        throw new Error(payload.error || "Unable to RSVP.");
      }
      setEvent(payload.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to RSVP.");
    } finally {
      setSavingRsvp(false);
    }
  }, [event]);

  const handleCancelRsvp = useCallback(async () => {
    if (!event) return;
    setSavingRsvp(true);
    setError(null);
    try {
      const response = await authFetch(`/api/events/${event.eventId}/rsvp`, { method: "DELETE" });
      const payload = (await response.json()) as { event?: EventRecord; error?: string };
      if (!response.ok || !payload.event) {
        throw new Error(payload.error || "Unable to cancel RSVP.");
      }
      setEvent(payload.event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel RSVP.");
    } finally {
      setSavingRsvp(false);
    }
  }, [event]);

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#090B13]">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <Button asChild variant="ghost" className="w-fit rounded-2xl text-[#BFC6D4] hover:bg-white/[0.06] hover:text-white">
            <Link href="/events">
              <ArrowLeft className="h-4 w-4" />
              Back to events
            </Link>
          </Button>

          {loading ? (
            <GlassCard className="h-[520px] animate-pulse rounded-[30px] border-white/10 bg-white/[0.035]" />
          ) : error || !event ? (
            <GlassCard className="rounded-[28px] border-red-400/20 bg-red-500/10 p-10 text-center">
              <h1 className="text-2xl font-semibold text-white">Event unavailable</h1>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-red-100">
                {error || "This event may be unavailable, cancelled, or not included in your current access level."}
              </p>
              <Button asChild className="mt-6 rounded-2xl bg-white text-[#090B13] hover:bg-white/90">
                <Link href="/events">Return to events</Link>
              </Button>
            </GlassCard>
          ) : (
            <>
              <section className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-[#111827]/70 shadow-[0_24px_80px_rgba(0,0,0,.38)]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(91,95,255,.35),transparent_30%),radial-gradient(circle_at_78%_18%,rgba(79,157,255,.25),transparent_32%),linear-gradient(135deg,rgba(139,92,246,.16),transparent_55%)]" />
                {event.coverImageUrl && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={event.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
                    <div className="absolute inset-0 bg-[#090B13]/60" />
                  </>
                )}
                <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_360px] lg:p-10">
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={event.status} />
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-[#BFC6D4]">
                        {EVENT_TYPE_LABELS[event.eventType]}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-[#BFC6D4]">
                        {VISIBILITY_LABELS[event.visibility]}
                      </span>
                    </div>
                    <div className="space-y-4">
                      <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">{event.title}</h1>
                      <p className="max-w-3xl whitespace-pre-line text-base leading-7 text-[#BFC6D4]">{event.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {canJoin && (
                        <Button asChild className="rounded-2xl bg-gradient-to-r from-[#5B5FFF] via-[#8B5CF6] to-[#4F9DFF] px-6 text-white shadow-[0_16px_48px_rgba(91,95,255,.28)]">
                          <a href={event.meetingUrl} target="_blank" rel="noreferrer">
                            {event.status === "live" ? "Join live now" : "Open meeting link"}
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {canReplay && (
                        <Button asChild className="rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#4F9DFF] px-6 text-white">
                          <a href={event.replayUrl} target="_blank" rel="noreferrer">
                            Watch replay
                            <PlayCircle className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button asChild variant="outline" className="rounded-2xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]">
                        <a href={calendarUrl} target="_blank" rel="noreferrer">
                          Add to Google Calendar
                          <CalendarPlus className="h-4 w-4" />
                        </a>
                      </Button>
                      {canRsvp && (
                        isGoing ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={savingRsvp}
                            onClick={() => void handleCancelRsvp()}
                            className="rounded-2xl border-emerald-400/20 bg-emerald-400/10 px-6 text-emerald-100 hover:bg-emerald-400/15"
                          >
                            Going · Cancel RSVP
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={savingRsvp || isFull}
                            onClick={() => void handleRsvp()}
                            className="rounded-2xl border-white/10 bg-white/[0.04] px-6 text-white hover:bg-white/[0.08]"
                          >
                            {isFull ? "Event full" : "RSVP"}
                          </Button>
                        )
                      )}
                    </div>
                  </div>

                  <GlassCard className="rounded-[24px] border-white/10 bg-[#090B13]/60 p-5 backdrop-blur-xl">
                    <h2 className="text-lg font-semibold text-white">Session details</h2>
                    <div className="mt-5 space-y-4">
                      <div className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                        <Clock className="mt-0.5 h-5 w-5 text-[#4F9DFF]" />
                        <div>
                          <p className="text-sm font-medium text-white">{formatEventDate(event.startsAt, event.timezone)}</p>
                          <p className="mt-1 text-xs text-[#7E8799]">{getDurationLabel(event)} · {event.timezone}</p>
                        </div>
                      </div>
                      <div className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                        <Users className="mt-0.5 h-5 w-5 text-violet-200" />
                        <div>
                          <p className="text-sm font-medium text-white">{event.hostName || "SDC Team"}</p>
                          <p className="mt-1 text-xs text-[#7E8799]">Host</p>
                        </div>
                      </div>
                      <div className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                        <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-200" />
                        <div>
                          <p className="text-sm font-medium text-white">{VISIBILITY_LABELS[event.visibility]}</p>
                          <p className="mt-1 text-xs text-[#7E8799]">{event.allowedTiers.length ? `Eligible tiers: ${event.allowedTiers.join(", ")}` : "Available to eligible members"}</p>
                        </div>
                      </div>
                      <div className="flex gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                        <Users className="mt-0.5 h-5 w-5 text-blue-200" />
                        <div>
                          <p className="text-sm font-medium text-white">{event.capacity ? `${event.rsvpCount}/${event.capacity} members going` : `${event.rsvpCount} members going`}</p>
                          <p className="mt-1 text-xs text-[#7E8799]">{isGoing ? "You are on the list." : "RSVP to save your spot."}</p>
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
                <GlassCard className="rounded-[24px] border-white/10 bg-white/[0.035] p-6">
                  <h2 className="text-xl font-semibold text-white">What to expect</h2>
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                      <Video className="h-5 w-5 text-[#4F9DFF]" />
                      <h3 className="mt-4 font-medium text-white">Live guidance</h3>
                      <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">Attend live when the meeting link is available for your plan.</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                      <CalendarPlus className="h-5 w-5 text-violet-200" />
                      <h3 className="mt-4 font-medium text-white">Calendar ready</h3>
                      <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">Save the session to your calendar so it fits your operating rhythm.</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                      <PlayCircle className="h-5 w-5 text-emerald-200" />
                      <h3 className="mt-4 font-medium text-white">Replay support</h3>
                      <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">Completed sessions show replay access when the SDC team publishes it.</p>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="rounded-[24px] border-white/10 bg-gradient-to-br from-violet-500/15 via-blue-500/10 to-transparent p-6">
                  <div className="flex h-full flex-col justify-between gap-6">
                    <div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] text-violet-100">
                        <Lock className="h-5 w-5" />
                      </div>
                      <h2 className="mt-5 text-xl font-semibold text-white">Access is plan-aware</h2>
                      <p className="mt-2 text-sm leading-6 text-[#BFC6D4]">
                        Meeting and replay links are only returned for events your account can access. If an event is not visible, it is not exposed through the client.
                      </p>
                    </div>
                    <Button asChild variant="outline" className="rounded-2xl border-white/10 bg-white/[0.05] text-white hover:bg-white/[0.08]">
                      <Link href="/events">Browse more events</Link>
                    </Button>
                  </div>
                </GlassCard>
              </section>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function EventDetailPage() {
  return (
    <ProtectedRoute>
      <EventsDetailContent />
    </ProtectedRoute>
  );
}
