export const EVENT_STATUSES = ['draft', 'scheduled', 'live', 'completed', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_TYPES = ['live_class', 'workshop', 'coaching_call', 'webinar', 'community_event'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const MEETING_PROVIDERS = ['zoom', 'google_meet', 'external', 'none'] as const;
export type MeetingProvider = (typeof MEETING_PROVIDERS)[number];

export const EVENT_VISIBILITIES = ['all', 'explorer', 'pro', 'elite', 'custom'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const EVENT_TIERS = ['explorer', 'pro', 'elite'] as const;
export type EventTier = (typeof EVENT_TIERS)[number];

export const EVENT_RSVP_STATUSES = ['going', 'cancelled'] as const;
export type EventRsvpStatus = (typeof EVENT_RSVP_STATUSES)[number];

export interface EventInput {
  title: string;
  description: string;
  eventType?: EventType;
  status?: EventStatus;
  startsAt: string;
  endsAt?: string | null;
  timezone?: string;
  hostId?: string;
  hostName?: string;
  meetingProvider?: MeetingProvider;
  meetingUrl?: string;
  replayUrl?: string;
  visibility?: EventVisibility;
  allowedTiers?: EventTier[];
  capacity?: number | null;
  seriesId?: string;
  coverImageUrl?: string;
}

export interface EventUpdateInput extends Partial<EventInput> {}

export interface EventRecord {
  eventId: string;
  title: string;
  description: string;
  eventType: EventType;
  status: EventStatus;
  startsAt: string;
  endsAt?: string | null;
  timezone: string;
  hostId?: string;
  hostName?: string;
  meetingProvider: MeetingProvider;
  meetingUrl?: string;
  replayUrl?: string;
  visibility: EventVisibility;
  allowedTiers: EventTier[];
  capacity?: number | null;
  rsvpCount: number;
  viewerRsvp?: EventRsvpStatus | null;
  seriesId?: string;
  coverImageUrl?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EventRsvpRecord {
  eventId: string;
  userId: string;
  status: EventRsvpStatus;
  displayName?: string;
  email?: string;
  photoURL?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  cancelledAt?: string | null;
  attendance?: EventAttendanceRecord | null;
}

export interface EventAttendanceRecord {
  eventId: string;
  userId: string;
  status: 'attended';
  checkedInAt?: string | null;
  checkedInBy?: string;
}

export interface EventListOptions {
  month?: string;
  status?: EventStatus | 'all';
  type?: EventType | 'all';
  includeDrafts?: boolean;
  limit?: number;
}

export interface EventAnalyticsSummary {
  month: string;
  totals: {
    events: number;
    scheduled: number;
    live: number;
    completed: number;
    cancelled: number;
    rsvps: number;
    activeRsvps: number;
    cancelledRsvps: number;
    attended: number;
    capacity: number;
    replays: number;
  };
  rates: {
    attendanceRate: number;
    cancellationRate: number;
    capacityUtilization: number;
    replayCoverage: number;
  };
  byType: Array<{
    type: EventType;
    events: number;
    rsvps: number;
    attended: number;
  }>;
  byStatus: Array<{
    status: EventStatus;
    events: number;
  }>;
  topEvents: Array<{
    eventId: string;
    title: string;
    eventType: EventType;
    status: EventStatus;
    startsAt: string;
    rsvps: number;
    attended: number;
    attendanceRate: number;
  }>;
}

export interface LegacyEventMigrationResult {
  dryRun: boolean;
  scanned: number;
  migrated: number;
  skipped: number;
  items: Array<{
    scheduledPostId: string;
    eventId?: string;
    action: 'migrated' | 'skipped';
    reason?: string;
    title?: string;
    startsAt?: string;
  }>;
}
