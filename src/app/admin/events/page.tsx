"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  BarChart3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  UserX,
  Video,
  XCircle,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { AdminMediaPicker } from "@/components/admin/AdminMediaPicker";
import type {
  EventRecord,
  EventAnalyticsSummary,
  LegacyEventMigrationResult,
  EventRsvpRecord,
  EventStatus,
  EventType,
  EventVisibility,
  MeetingProvider,
} from "@/events/types";

type EventFormState = {
  title: string;
  description: string;
  eventType: EventType;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  timezone: string;
  hostName: string;
  meetingProvider: MeetingProvider;
  meetingUrl: string;
  replayUrl: string;
  visibility: EventVisibility;
  allowedTiers: string[];
  capacity: string;
  seriesId: string;
  coverImageUrl: string;
};

const EVENT_TYPES: Array<{ value: EventType; label: string }> = [
  { value: "live_class", label: "Live Class" },
  { value: "workshop", label: "Workshop" },
  { value: "coaching_call", label: "Coaching Call" },
  { value: "webinar", label: "Webinar" },
  { value: "community_event", label: "Community Event" },
];

const EVENT_STATUSES: Array<{ value: EventStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "live", label: "Live" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const MEETING_PROVIDERS: Array<{ value: MeetingProvider; label: string }> = [
  { value: "none", label: "No Meeting Link" },
  { value: "zoom", label: "Zoom" },
  { value: "google_meet", label: "Google Meet" },
  { value: "external", label: "External Link" },
];

const VISIBILITIES: Array<{ value: EventVisibility; label: string; helper: string }> = [
  { value: "all", label: "All Members", helper: "Visible to everyone." },
  { value: "explorer", label: "Explorer+", helper: "Explorer, Pro, and Elite." },
  { value: "pro", label: "Pro+", helper: "Pro and Elite only." },
  { value: "elite", label: "Elite", helper: "Elite only." },
  { value: "custom", label: "Custom", helper: "Use selected tiers." },
];

const emptyForm: EventFormState = {
  title: "",
  description: "",
  eventType: "live_class",
  status: "draft",
  startsAt: "",
  endsAt: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Nairobi",
  hostName: "",
  meetingProvider: "none",
  meetingUrl: "",
  replayUrl: "",
  visibility: "all",
  allowedTiers: ["explorer", "pro", "elite"],
  capacity: "",
  seriesId: "",
  coverImageUrl: "",
};

function toLocalInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInputValue(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusClass(status: EventStatus) {
  switch (status) {
    case "scheduled":
      return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
    case "live":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "completed":
      return "border-white/10 bg-white/[0.06] text-white/70";
    case "cancelled":
      return "border-red-400/20 bg-red-400/10 text-red-200";
    default:
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  }
}

function formFromEvent(event: EventRecord): EventFormState {
  return {
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    status: event.status,
    startsAt: toLocalInputValue(event.startsAt),
    endsAt: toLocalInputValue(event.endsAt),
    timezone: event.timezone || emptyForm.timezone,
    hostName: event.hostName || "",
    meetingProvider: event.meetingProvider,
    meetingUrl: event.meetingUrl || "",
    replayUrl: event.replayUrl || "",
    visibility: event.visibility,
    allowedTiers: event.allowedTiers || [],
    capacity: event.capacity ? String(event.capacity) : "",
    seriesId: event.seriesId || "",
    coverImageUrl: event.coverImageUrl || "",
  };
}

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Admin session expired.");
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Admin event action failed.");
  }
  return payload;
}

function toPayload(form: EventFormState) {
  return {
    title: form.title,
    description: form.description,
    eventType: form.eventType,
    status: form.status,
    startsAt: fromLocalInputValue(form.startsAt),
    endsAt: form.endsAt ? fromLocalInputValue(form.endsAt) : null,
    timezone: form.timezone,
    hostName: form.hostName || undefined,
    meetingProvider: form.meetingProvider,
    meetingUrl: form.meetingProvider === "none" ? undefined : form.meetingUrl || undefined,
    replayUrl: form.replayUrl || undefined,
    visibility: form.visibility,
    allowedTiers: form.visibility === "custom" ? form.allowedTiers : undefined,
    capacity: form.capacity ? Number(form.capacity) : null,
    seriesId: form.seriesId || undefined,
    coverImageUrl: form.coverImageUrl || undefined,
  };
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [analytics, setAnalytics] = useState<EventAnalyticsSummary | null>(null);
  const [legacyMigration, setLegacyMigration] = useState<LegacyEventMigrationResult | null>(null);
  const [form, setForm] = useState<EventFormState>(emptyForm);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [attendees, setAttendees] = useState<EventRsvpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [saving, setSaving] = useState(false);
  const [migratingLegacy, setMigratingLegacy] = useState(false);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [attendanceBusyId, setAttendanceBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EventStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      if (statusFilter !== "all" && event.status !== statusFilter) return false;
      if (typeFilter !== "all" && event.eventType !== typeFilter) return false;
      if (!term) return true;
      return `${event.title} ${event.description} ${event.hostName || ""}`.toLowerCase().includes(term);
    });
  }, [events, search, statusFilter, typeFilter]);

  const totals = useMemo(() => {
    return {
      total: events.length,
      scheduled: events.filter((event) => event.status === "scheduled").length,
      live: events.filter((event) => event.status === "live").length,
      completed: events.filter((event) => event.status === "completed").length,
    };
  }, [events]);

  const attendeeTotals = useMemo(() => {
    const active = attendees.filter((attendee) => attendee.status === "going");
    return {
      going: active.length,
      attended: active.filter((attendee) => attendee.attendance?.status === "attended").length,
      cancelled: attendees.filter((attendee) => attendee.status === "cancelled").length,
    };
  }, [attendees]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ month, limit: "200" });
      const payload = await adminFetch(`/api/admin/events?${params.toString()}`);
      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load events.");
    } finally {
      setLoading(false);
    }
  };

  const loadAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      const payload = await adminFetch(`/api/admin/events/analytics?${new URLSearchParams({ month }).toString()}`);
      setAnalytics(payload.analytics || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load event analytics.");
      setAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const loadAttendees = async (eventId: string) => {
    try {
      setLoadingAttendees(true);
      const payload = await adminFetch(`/api/admin/events/${eventId}/rsvps`);
      setAttendees(Array.isArray(payload.attendees) ? payload.attendees : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load event attendees.");
      setAttendees([]);
    } finally {
      setLoadingAttendees(false);
    }
  };

  useEffect(() => {
    void loadEvents();
    void loadAnalytics();
  }, [month]);

  const updateForm = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setSelectedEvent(null);
    setAttendees([]);
    setForm(emptyForm);
    setMessage(null);
    setError(null);
  };

  const selectEvent = (event: EventRecord) => {
    setSelectedEvent(event);
    setForm(formFromEvent(event));
    setMessage(null);
    setError(null);
    void loadAttendees(event.eventId);
  };

  const submitEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      const payload = toPayload(form);
      const path = selectedEvent ? `/api/admin/events/${selectedEvent.eventId}` : "/api/admin/events";
      const result = await adminFetch(path, {
        method: selectedEvent ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setMessage(selectedEvent ? "Event updated." : "Event created.");
      setSelectedEvent(result.event);
      setForm(formFromEvent(result.event));
      if (result.event?.eventId) {
        await loadAttendees(result.event.eventId);
      }
      await loadEvents();
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save event.");
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (event: EventRecord, status: EventStatus) => {
    try {
      setSaving(true);
      setError(null);
      await adminFetch(`/api/admin/events/${event.eventId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...event, status }),
      });
      setMessage(`Event marked ${status}.`);
      await loadEvents();
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update event status.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedEvent) return;
    const confirmed = window.confirm(`Delete "${selectedEvent.title}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      setSaving(true);
      setError(null);
      await adminFetch(`/api/admin/events/${selectedEvent.eventId}`, { method: "DELETE" });
      resetForm();
      await loadEvents();
      await loadAnalytics();
      setMessage("Event deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete event.");
    } finally {
      setSaving(false);
    }
  };

  const markAttendance = async (attendee: EventRsvpRecord) => {
    if (!selectedEvent) return;
    try {
      setAttendanceBusyId(attendee.userId);
      const payload = await adminFetch(`/api/admin/events/${selectedEvent.eventId}/attendance/${attendee.userId}`, { method: "POST" });
      if (payload.attendee) {
        setAttendees((current) => current.map((item) => item.userId === attendee.userId ? payload.attendee : item));
      }
      await loadAnalytics();
      setMessage(`${attendee.displayName || "Member"} checked in.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to mark attendance.");
    } finally {
      setAttendanceBusyId(null);
    }
  };

  const removeAttendance = async (attendee: EventRsvpRecord) => {
    if (!selectedEvent) return;
    try {
      setAttendanceBusyId(attendee.userId);
      const payload = await adminFetch(`/api/admin/events/${selectedEvent.eventId}/attendance/${attendee.userId}`, { method: "DELETE" });
      if (payload.attendee) {
        setAttendees((current) => current.map((item) => item.userId === attendee.userId ? payload.attendee : item));
      }
      await loadAnalytics();
      setMessage(`${attendee.displayName || "Member"} check-in removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove attendance.");
    } finally {
      setAttendanceBusyId(null);
    }
  };

  const runLegacyMigration = async (dryRun: boolean) => {
    const confirmed = dryRun || window.confirm("Migrate legacy scheduledPosts event-mode records into real Events and archive the originals?");
    if (!confirmed) return;

    try {
      setMigratingLegacy(true);
      setError(null);
      const payload = await adminFetch("/api/admin/events/migrate-legacy", {
        method: "POST",
        body: JSON.stringify({ dryRun, limit: 100 }),
      });
      setLegacyMigration(payload.migration || null);
      setMessage(dryRun ? "Legacy migration dry run complete." : "Legacy event migration complete.");
      if (!dryRun) {
        await loadEvents();
        await loadAnalytics();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run legacy migration.");
    } finally {
      setMigratingLegacy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-6 shadow-2xl shadow-black/30 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
            <CalendarDays className="h-3.5 w-3.5" />
            Live Events
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Events Manager</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            Create and manage SDC live classes, workshops, coaching calls, webinars, meeting links, replay links, and plan visibility.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={resetForm} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white/80 transition hover:bg-white/[0.08]">
            <Plus className="h-4 w-4" />
            New Event
          </button>
          <button type="button" onClick={() => { void loadEvents(); void loadAnalytics(); }} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white/80 transition hover:bg-white/[0.08]">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Events" value={totals.total} />
        <Metric label="Scheduled" value={totals.scheduled} tone="cyan" />
        <Metric label="Live" value={totals.live} tone="green" />
        <Metric label="Completed" value={totals.completed} />
      </div>

      <section className="rounded-3xl border border-white/10 bg-[#0d1018] p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-medium text-violet-100">
              <BarChart3 className="h-3.5 w-3.5" />
              Event Analytics
            </div>
            <h2 className="mt-3 text-lg font-semibold text-white">Monthly performance</h2>
            <p className="mt-1 text-sm text-white/45">Track registrations, attendance, capacity, and replay readiness for this month.</p>
          </div>
          {loadingAnalytics && (
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/45">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading analytics
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <Metric label="Active RSVPs" value={analytics?.totals.activeRsvps || 0} tone="cyan" />
          <Metric label="Attended" value={analytics?.totals.attended || 0} tone="green" />
          <Metric label="Attendance" value={analytics?.rates.attendanceRate || 0} suffix="%" tone="green" />
          <Metric label="Replay Coverage" value={analytics?.rates.replayCoverage || 0} suffix="%" />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">Top events</h3>
              <span className="text-xs text-white/35">By RSVP volume</span>
            </div>
            <div className="mt-4 space-y-3">
              {analytics?.topEvents.length ? (
                analytics.topEvents.map((event) => (
                  <div key={event.eventId} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{event.title}</p>
                        <p className="mt-1 text-xs text-white/40">{dateLabel(event.startsAt)} · {event.eventType.replaceAll("_", " ")}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-cyan-100">{event.rsvps} RSVP</span>
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">{event.attendanceRate}% attended</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/45">No event performance data for this month yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">By event type</h3>
            <div className="mt-4 space-y-3">
              {analytics?.byType.length ? (
                analytics.byType.map((item) => {
                  const max = Math.max(1, analytics.totals.activeRsvps);
                  return (
                    <div key={item.type}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="capitalize text-white/75">{item.type.replaceAll("_", " ")}</span>
                        <span className="text-white/40">{item.rsvps} RSVP · {item.attended} attended</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${Math.max(4, Math.round((item.rsvps / max) * 100))}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/45">Create and publish events to populate this breakdown.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-amber-400/15 bg-amber-400/[0.06] p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Legacy event-mode migration</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-white/55">
              Convert old Scheduler records with <code className="rounded bg-black/25 px-1.5 py-0.5">metadata.calendarMode = events</code> into real Events records.
              Dry run first, then run the migration when you are ready.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={migratingLegacy} onClick={() => void runLegacyMigration(true)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white/80 transition hover:bg-white/[0.08] disabled:opacity-50">
              {migratingLegacy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Dry run
            </button>
            <button type="button" disabled={migratingLegacy} onClick={() => void runLegacyMigration(false)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/15 px-4 text-sm text-amber-50 transition hover:bg-amber-300/20 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" />
              Run migration
            </button>
          </div>
        </div>
        {legacyMigration ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap gap-3 text-sm text-white/70">
              <span>Mode: <strong className="text-white">{legacyMigration.dryRun ? "Dry run" : "Executed"}</strong></span>
              <span>Scanned: <strong className="text-white">{legacyMigration.scanned}</strong></span>
              <span>Migrated: <strong className="text-white">{legacyMigration.migrated}</strong></span>
              <span>Skipped: <strong className="text-white">{legacyMigration.skipped}</strong></span>
            </div>
            {legacyMigration.items.length ? (
              <div className="mt-3 max-h-48 space-y-2 overflow-auto pr-1">
                {legacyMigration.items.slice(0, 25).map((item) => (
                  <div key={item.scheduledPostId} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">
                    <span className={item.action === "migrated" ? "text-emerald-100" : "text-amber-100"}>{item.action}</span>
                    <span className="mx-2 text-white/25">·</span>
                    <span>{item.title || item.scheduledPostId}</span>
                    {item.reason ? <span className="ml-2 text-white/35">({item.reason})</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {(error || message) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border border-white/10 bg-[#0d1018] p-5 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Event Library</h2>
              <p className="mt-1 text-sm text-white/45">Admin-managed live sessions for members.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search events" className="h-10 w-56 rounded-2xl border border-white/10 bg-black/20 pl-9 pr-3 text-sm outline-none transition focus:border-cyan-300/40" />
              </div>
              <input aria-label="Filter events by month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm outline-none transition focus:border-cyan-300/40" />
              <select aria-label="Filter events by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as EventStatus | "all")} className="h-10 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm outline-none transition focus:border-cyan-300/40">
                {EVENT_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
              <select aria-label="Filter events by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as EventType | "all")} className="h-10 rounded-2xl border border-white/10 bg-black/20 px-3 text-sm outline-none transition focus:border-cyan-300/40">
                <option value="all">All types</option>
                {EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-12 text-white/45">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading events
              </div>
            ) : filteredEvents.length ? (
              filteredEvents.map((event) => (
                <article key={event.eventId} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-cyan-300/25 hover:bg-white/[0.06]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <button type="button" onClick={() => selectEvent(event)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs capitalize ${statusClass(event.status)}`}>{event.status}</span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/55">
                          {EVENT_TYPES.find((type) => type.value === event.eventType)?.label || event.eventType}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/55">
                          {VISIBILITIES.find((visibility) => visibility.value === event.visibility)?.label || event.visibility}
                        </span>
                      </div>
                      <h3 className="mt-3 truncate text-base font-semibold text-white">{event.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-white/50">{event.description}</p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
                        <span>{dateLabel(event.startsAt)}</span>
                        <span>{event.timezone}</span>
                        {event.hostName ? <span>Host: {event.hostName}</span> : null}
                        {event.meetingProvider !== "none" ? <span>{MEETING_PROVIDERS.find((provider) => provider.value === event.meetingProvider)?.label}</span> : null}
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => selectEvent(event)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-white/75 hover:bg-white/[0.08]">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {event.status !== "cancelled" && (
                        <button type="button" onClick={() => quickStatus(event, "cancelled")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 text-xs text-red-100 hover:bg-red-400/15">
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      )}
                      {event.status !== "completed" && (
                        <button type="button" onClick={() => quickStatus(event, "completed")} className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs text-emerald-100 hover:bg-emerald-400/15">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Complete
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
                <CalendarDays className="mx-auto h-8 w-8 text-white/30" />
                <h3 className="mt-4 font-semibold">No events found</h3>
                <p className="mt-2 text-sm text-white/45">Create a live class, webinar, or coaching call to populate this month.</p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#0d1018] p-5 shadow-2xl shadow-black/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{selectedEvent ? "Edit Event" : "Create Event"}</h2>
              <p className="mt-1 text-sm text-white/45">Manage details, schedule, meeting access, replay, and member visibility.</p>
            </div>
            {selectedEvent && (
              <button type="button" onClick={deleteSelected} className="rounded-xl border border-red-400/20 bg-red-400/10 p-2 text-red-100 hover:bg-red-400/15" aria-label="Delete selected event">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <form onSubmit={submitEvent} className="mt-5 space-y-5">
            <FormSection title="Details">
              <Field label="Title">
                <input required value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Weekly Business Coaching Call" className="admin-input" />
              </Field>
              <Field label="Description">
                <textarea required value={form.description} onChange={(event) => updateForm("description", event.target.value)} rows={4} placeholder="What members will learn, prepare, or receive." className="admin-input resize-none" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Event type">
                  <select value={form.eventType} onChange={(event) => updateForm("eventType", event.target.value as EventType)} className="admin-input">
                    {EVENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={(event) => updateForm("status", event.target.value as EventStatus)} className="admin-input">
                    {EVENT_STATUSES.filter((status) => status.value !== "all").map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </Field>
              </div>
              <AdminMediaPicker
                label="Event cover image"
                value={form.coverImageUrl}
                kind="image"
                accept="image/*"
                usageContext="events"
                linkedEntityType="event"
                linkedEntityId={selectedEvent?.eventId}
                helperText="Upload a branded event cover, choose from the library, or paste an external URL."
                aspectHint="Recommended: 16:9, strong title-safe center area."
                onChange={(url) => updateForm("coverImageUrl", url)}
              />
            </FormSection>

            <FormSection title="Schedule">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starts at">
                  <input required type="datetime-local" value={form.startsAt} onChange={(event) => updateForm("startsAt", event.target.value)} className="admin-input" />
                </Field>
                <Field label="Ends at">
                  <input type="datetime-local" value={form.endsAt} onChange={(event) => updateForm("endsAt", event.target.value)} className="admin-input" />
                </Field>
              </div>
              <Field label="Timezone">
                <input value={form.timezone} onChange={(event) => updateForm("timezone", event.target.value)} placeholder="Africa/Nairobi" className="admin-input" />
              </Field>
              <Field label="Host name">
                <input value={form.hostName} onChange={(event) => updateForm("hostName", event.target.value)} placeholder="Coach Tedd" className="admin-input" />
              </Field>
            </FormSection>

            <FormSection title="Access">
              <Field label="Visibility">
                <select value={form.visibility} onChange={(event) => updateForm("visibility", event.target.value as EventVisibility)} className="admin-input">
                  {VISIBILITIES.map((visibility) => <option key={visibility.value} value={visibility.value}>{visibility.label}</option>)}
                </select>
              </Field>
              <p className="text-xs text-white/45">{VISIBILITIES.find((item) => item.value === form.visibility)?.helper}</p>
              {form.visibility === "custom" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {["explorer", "pro", "elite"].map((tier) => (
                    <label key={tier} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm capitalize text-white/70">
                      <input
                        type="checkbox"
                        checked={form.allowedTiers.includes(tier)}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? Array.from(new Set([...form.allowedTiers, tier]))
                            : form.allowedTiers.filter((item) => item !== tier);
                          updateForm("allowedTiers", next);
                        }}
                      />
                      {tier}
                    </label>
                  ))}
                </div>
              )}
              <Field label="Capacity">
                <input type="number" min={1} max={100000} value={form.capacity} onChange={(event) => updateForm("capacity", event.target.value)} placeholder="Optional" className="admin-input" />
              </Field>
            </FormSection>

            <FormSection title="Meeting & Replay">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Meeting provider">
                  <select value={form.meetingProvider} onChange={(event) => updateForm("meetingProvider", event.target.value as MeetingProvider)} className="admin-input">
                    {MEETING_PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
                  </select>
                </Field>
                <Field label="Series ID">
                  <input value={form.seriesId} onChange={(event) => updateForm("seriesId", event.target.value)} placeholder="Optional series key" className="admin-input" />
                </Field>
              </div>
              <Field label="Meeting URL">
                <div className="flex gap-2">
                  <input value={form.meetingUrl} onChange={(event) => updateForm("meetingUrl", event.target.value)} placeholder="Zoom, Google Meet, or external URL" className="admin-input" />
                  {form.meetingUrl && (
                    <a href={form.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]" aria-label="Open meeting URL">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </Field>
              <AdminMediaPicker
                label="Replay video"
                value={form.replayUrl}
                kind="video"
                accept="video/*"
                usageContext="events"
                linkedEntityType="event"
                linkedEntityId={selectedEvent?.eventId}
                helperText="Upload the replay after the event or paste a Zoom, Meet, Vimeo, or YouTube replay URL."
                aspectHint={form.replayUrl ? "Replay status: ready or externally linked." : "Replay status: none yet."}
                onChange={(url) => updateForm("replayUrl", url)}
              />
            </FormSection>

            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-5">
              <button type="submit" disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/10 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {selectedEvent ? "Save Changes" : "Create Event"}
              </button>
              <button type="button" onClick={resetForm} disabled={saving} className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm text-white/70 transition hover:bg-white/[0.08]">
                Clear
              </button>
            </div>
          </form>

          {selectedEvent && (
            <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
                    <Users className="h-3.5 w-3.5" />
                    RSVP Roster
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">Attendance</h3>
                  <p className="mt-1 text-sm text-white/45">Track who reserved a seat and check members in during the live session.</p>
                </div>
                <button type="button" onClick={() => loadAttendees(selectedEvent.eventId)} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white/75 transition hover:bg-white/[0.08]">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/35">Going</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{attendeeTotals.going}</p>
                </div>
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-emerald-100/60">Checked in</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-100">{attendeeTotals.attended}</p>
                </div>
                <div className="rounded-2xl border border-red-400/15 bg-red-400/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-red-100/60">Cancelled</p>
                  <p className="mt-2 text-2xl font-semibold text-red-100">{attendeeTotals.cancelled}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {loadingAttendees ? (
                  <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-8 text-sm text-white/45">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading roster
                  </div>
                ) : attendees.length ? (
                  attendees.map((attendee) => {
                    const checkedIn = attendee.attendance?.status === "attended";
                    const cancelled = attendee.status === "cancelled";
                    return (
                      <div key={attendee.userId} className={`rounded-2xl border p-3 ${cancelled ? "border-red-400/15 bg-red-400/5" : checkedIn ? "border-emerald-400/20 bg-emerald-400/10" : "border-white/10 bg-white/[0.035]"}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            {attendee.photoURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={attendee.photoURL} alt="" className="h-10 w-10 rounded-2xl object-cover" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.08] text-sm font-semibold text-white/70">
                                {(attendee.displayName || attendee.email || "M").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">{attendee.displayName || "Member"}</p>
                              <p className="truncate text-xs text-white/40">{attendee.email || attendee.userId}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-xs ${cancelled ? "border-red-400/20 bg-red-400/10 text-red-100" : checkedIn ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"}`}>
                              {cancelled ? "Cancelled" : checkedIn ? "Attended" : "Going"}
                            </span>
                            {!cancelled && (
                              checkedIn ? (
                                <button type="button" disabled={attendanceBusyId === attendee.userId} onClick={() => removeAttendance(attendee)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs text-white/70 hover:bg-white/[0.08] disabled:opacity-50">
                                  <UserX className="h-3.5 w-3.5" />
                                  Undo
                                </button>
                              ) : (
                                <button type="button" disabled={attendanceBusyId === attendee.userId} onClick={() => markAttendance(attendee)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-xs text-emerald-100 hover:bg-emerald-400/15 disabled:opacity-50">
                                  <UserCheck className="h-3.5 w-3.5" />
                                  Check in
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-6 text-center">
                    <Users className="mx-auto h-7 w-7 text-white/30" />
                    <p className="mt-3 text-sm font-medium text-white">No RSVPs yet</p>
                    <p className="mt-1 text-xs text-white/40">Members who RSVP will appear here for check-in.</p>
                  </div>
                )}
              </div>
            </section>
          )}
        </section>
      </div>

      <style jsx global>{`
        .admin-input {
          height: 2.75rem;
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(0, 0, 0, 0.2);
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: white;
          outline: none;
          transition: border-color 160ms ease, background 160ms ease;
        }
        .admin-input:focus {
          border-color: rgba(34, 211, 238, 0.55);
          background: rgba(255, 255, 255, 0.045);
        }
        textarea.admin-input {
          height: auto;
        }
        .admin-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}

function Metric({ label, value, suffix = "", tone = "default" }: { label: string; value: number; suffix?: string; tone?: "default" | "cyan" | "green" }) {
  const toneClass = tone === "cyan" ? "text-cyan-200" : tone === "green" ? "text-emerald-200" : "text-white";
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${toneClass}`}>{value}{suffix}</p>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-white/80">{label}</span>
      {children}
    </label>
  );
}
