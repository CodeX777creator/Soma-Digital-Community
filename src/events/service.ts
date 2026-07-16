import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import type { SubscriptionPlan } from '@/lib/entitlements';
import { subscriptionWeights } from '@/lib/entitlements';
import {
  normalizeAllowedTiers,
  parseEventDate,
  sanitizeEventString,
  sanitizeEventText,
  validateEventInput,
} from './validation';
import type {
  EventInput,
  EventAttendanceRecord,
  EventAnalyticsSummary,
  EventListOptions,
  LegacyEventMigrationResult,
  EventRecord,
  EventRsvpRecord,
  EventRsvpStatus,
  EventStatus,
  EventTier,
  EventType,
  EventUpdateInput,
  EventVisibility,
  MeetingProvider,
} from './types';

type EventDoc = {
  eventId: string;
  title: string;
  description: string;
  eventType: EventType;
  status: EventStatus;
  startsAt: Timestamp;
  endsAt?: Timestamp | null;
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
  seriesId?: string;
  coverImageUrl?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
};

type EventRsvpDoc = {
  eventId: string;
  userId: string;
  status: EventRsvpStatus;
  displayName?: string;
  email?: string;
  photoURL?: string | null;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  cancelledAt?: Timestamp | FieldValue | null;
};

type EventAttendanceDoc = {
  eventId: string;
  userId: string;
  status: 'attended';
  checkedInAt?: Timestamp | FieldValue;
  checkedInBy?: string;
};

type LegacyScheduledEventDoc = {
  scheduledPostId?: string;
  ownerId?: string;
  title?: string;
  caption?: string;
  notes?: string;
  status?: string;
  scheduledTime?: Timestamp;
  timezone?: string;
  metadata?: Record<string, unknown>;
  createdAt?: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
};

export class EventRsvpError extends Error {
  constructor(
    message: string,
    public readonly code: 'EVENT_NOT_FOUND' | 'EVENT_NOT_ACCESSIBLE' | 'EVENT_NOT_OPEN' | 'EVENT_FULL'
  ) {
    super(message);
    this.name = 'EventRsvpError';
  }
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string') return value;
  return null;
}

function toDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function datesEqual(a: Timestamp | FieldValue | undefined | null, b: Timestamp | FieldValue | undefined | null): boolean {
  const aIso = toIso(a);
  const bIso = toIso(b);
  return aIso === bIso;
}

function formatEventNotificationTime(value: Timestamp, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'UTC',
  }).format(toDateValue(value) || new Date());
}

async function getActiveRsvpUserIds(eventId: string): Promise<string[]> {
  const snap = await adminDb
    .collection('events')
    .doc(eventId)
    .collection('rsvps')
    .where('status', '==', 'going')
    .limit(1000)
    .get();
  return snap.docs.map((doc) => doc.id);
}

async function notifyEventRsvps(event: EventDoc, notification: { title: string; body: string; linkUrl?: string; createdBy?: string }) {
  const userIds = await getActiveRsvpUserIds(event.eventId);
  if (!userIds.length) return;

  const batches: FirebaseFirestore.WriteBatch[] = [];
  let batch = adminDb.batch();
  let operationCount = 0;

  for (const userId of userIds) {
    const ref = adminDb.collection('users').doc(userId).collection('notifications').doc();
    batch.set(ref, stripUndefined({
      type: 'event',
      title: notification.title,
      body: notification.body,
      linkUrl: notification.linkUrl || `/events/${event.eventId}`,
      createdBy: notification.createdBy,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
      eventId: event.eventId,
    }));
    operationCount += 1;

    if (operationCount >= 450) {
      batches.push(batch);
      batch = adminDb.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    batches.push(batch);
  }

  await Promise.all(batches.map((item) => item.commit()));
}

async function notifySingleEventUser(userId: string, event: EventDoc, notification: { title: string; body: string; createdBy?: string }) {
  await adminDb.collection('users').doc(userId).collection('notifications').add(stripUndefined({
    type: 'event',
    title: notification.title,
    body: notification.body,
    linkUrl: `/events/${event.eventId}`,
    createdBy: notification.createdBy,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
    eventId: event.eventId,
  }));
}

async function notifyEventLifecycleChanges(previous: EventDoc, next: EventDoc, actorId: string) {
  if (previous.status !== next.status) {
    if (next.status === 'live') {
      await notifyEventRsvps(next, {
        title: `${next.title} is live now`,
        body: 'Your SDC event has started. Join from the event page when you are ready.',
        createdBy: actorId,
      });
      return;
    }

    if (next.status === 'completed') {
      await notifyEventRsvps(next, {
        title: next.replayUrl ? `Replay available: ${next.title}` : `${next.title} has ended`,
        body: next.replayUrl ? 'The replay link is ready on the event page.' : 'This event has been marked completed.',
        createdBy: actorId,
      });
      return;
    }

    if (next.status === 'cancelled') {
      await notifyEventRsvps(next, {
        title: `${next.title} was cancelled`,
        body: 'An SDC event you RSVP’d to has been cancelled. Open the event page for the latest details.',
        createdBy: actorId,
      });
      return;
    }
  }

  if (!datesEqual(previous.startsAt, next.startsAt)) {
    await notifyEventRsvps(next, {
      title: `${next.title} was rescheduled`,
      body: `The new start time is ${formatEventNotificationTime(next.startsAt, next.timezone)}.`,
      createdBy: actorId,
    });
    return;
  }

  if (!previous.replayUrl && next.replayUrl && next.status === 'completed') {
    await notifyEventRsvps(next, {
      title: `Replay available: ${next.title}`,
      body: 'The replay link is ready on the event page.',
      createdBy: actorId,
    });
  }
}

function getMonthBounds(month: string): { start: Date; end: Date } {
  const parsed = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid month');
  }
  return {
    start: new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0, 23, 59, 59, 999)),
  };
}

function normalizeEventDoc(input: EventInput, actorId: string, eventId: string): EventDoc {
  validateEventInput(input);
  const visibility = input.visibility || 'all';
  const startsAt = parseEventDate(input.startsAt, 'Event start time');
  const endsAt = input.endsAt ? parseEventDate(input.endsAt, 'Event end time') : null;

  return stripUndefined<EventDoc>({
    eventId,
    title: sanitizeEventString(input.title, 160),
    description: sanitizeEventText(input.description, 5000),
    eventType: input.eventType || 'live_class',
    status: input.status || 'draft',
    startsAt: Timestamp.fromDate(startsAt),
    endsAt: endsAt ? Timestamp.fromDate(endsAt) : null,
    timezone: sanitizeEventString(input.timezone || 'UTC', 80) || 'UTC',
    hostId: sanitizeEventString(input.hostId, 160) || undefined,
    hostName: sanitizeEventString(input.hostName, 160) || undefined,
    meetingProvider: input.meetingProvider || 'none',
    meetingUrl: sanitizeEventString(input.meetingUrl, 2048) || undefined,
    replayUrl: sanitizeEventString(input.replayUrl, 2048) || undefined,
    visibility,
    allowedTiers: normalizeAllowedTiers(input.allowedTiers, visibility),
    capacity: input.capacity ?? null,
    rsvpCount: 0,
    seriesId: sanitizeEventString(input.seriesId, 160) || undefined,
    coverImageUrl: sanitizeEventString(input.coverImageUrl, 2048) || undefined,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function serializeAttendance(doc: EventAttendanceDoc): EventAttendanceRecord {
  return {
    eventId: doc.eventId,
    userId: doc.userId,
    status: doc.status,
    checkedInAt: toIso(doc.checkedInAt),
    checkedInBy: doc.checkedInBy,
  };
}

function serializeRsvp(doc: EventRsvpDoc, attendance?: EventAttendanceDoc | null): EventRsvpRecord {
  return {
    eventId: doc.eventId,
    userId: doc.userId,
    status: doc.status,
    displayName: doc.displayName,
    email: doc.email,
    photoURL: doc.photoURL ?? null,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
    cancelledAt: toIso(doc.cancelledAt),
    attendance: attendance ? serializeAttendance(attendance) : null,
  };
}

function serializeEvent(doc: EventDoc, options: { includeMeeting?: boolean; viewerRsvp?: EventRsvpStatus | null } = {}): EventRecord {
  return {
    eventId: doc.eventId,
    title: doc.title,
    description: doc.description,
    eventType: doc.eventType,
    status: doc.status,
    startsAt: toIso(doc.startsAt) || new Date().toISOString(),
    endsAt: toIso(doc.endsAt),
    timezone: doc.timezone,
    hostId: doc.hostId,
    hostName: doc.hostName,
    meetingProvider: doc.meetingProvider,
    meetingUrl: options.includeMeeting ? doc.meetingUrl : undefined,
    replayUrl: options.includeMeeting ? doc.replayUrl : undefined,
    visibility: doc.visibility,
    allowedTiers: doc.allowedTiers || [],
    capacity: doc.capacity ?? null,
    rsvpCount: doc.rsvpCount || 0,
    viewerRsvp: options.viewerRsvp ?? null,
    seriesId: doc.seriesId,
    coverImageUrl: doc.coverImageUrl,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    createdAt: toIso(doc.createdAt),
    updatedAt: toIso(doc.updatedAt),
  };
}

export function canAccessEvent(event: Pick<EventDoc, 'status' | 'visibility' | 'allowedTiers'>, tier: SubscriptionPlan, isAdmin = false): boolean {
  if (isAdmin) return true;
  if (!['scheduled', 'live', 'completed'].includes(event.status)) return false;
  if (event.visibility === 'all' || event.visibility === 'explorer') return true;
  if (event.visibility === 'custom') return (event.allowedTiers || []).includes(tier);
  return subscriptionWeights[tier] >= subscriptionWeights[event.visibility as SubscriptionPlan];
}

export async function createEvent(input: EventInput, actorId: string): Promise<EventRecord> {
  const ref = adminDb.collection('events').doc();
  const doc = normalizeEventDoc(input, actorId, ref.id);
  await ref.set(doc);
  return serializeEvent(doc, { includeMeeting: true });
}

export async function updateEvent(eventId: string, input: EventUpdateInput, actorId: string): Promise<EventRecord> {
  const ref = adminDb.collection('events').doc(eventId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Event not found');
  const current = snap.data() as EventDoc;
  const nextInput: EventInput = {
    title: input.title ?? current.title,
    description: input.description ?? current.description,
    eventType: input.eventType ?? current.eventType,
    status: input.status ?? current.status,
    startsAt: input.startsAt ?? toIso(current.startsAt) ?? new Date().toISOString(),
    endsAt: input.endsAt !== undefined ? input.endsAt : toIso(current.endsAt),
    timezone: input.timezone ?? current.timezone,
    hostId: input.hostId ?? current.hostId,
    hostName: input.hostName ?? current.hostName,
    meetingProvider: input.meetingProvider ?? current.meetingProvider,
    meetingUrl: input.meetingUrl ?? current.meetingUrl,
    replayUrl: input.replayUrl ?? current.replayUrl,
    visibility: input.visibility ?? current.visibility,
    allowedTiers: input.allowedTiers ?? current.allowedTiers,
    capacity: input.capacity !== undefined ? input.capacity : current.capacity,
    seriesId: input.seriesId ?? current.seriesId,
    coverImageUrl: input.coverImageUrl ?? current.coverImageUrl,
  };
  const normalized = normalizeEventDoc(nextInput, current.createdBy, eventId);
  const updated = stripUndefined<EventDoc>({
    ...normalized,
    rsvpCount: current.rsvpCount || 0,
    createdAt: current.createdAt,
    createdBy: current.createdBy,
    updatedBy: actorId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await ref.set(updated, { merge: true });
  await notifyEventLifecycleChanges(current, updated, actorId);
  return serializeEvent(updated, { includeMeeting: true });
}

async function getViewerRsvpStatus(eventId: string, userId?: string): Promise<EventRsvpStatus | null> {
  if (!userId) return null;
  const snap = await adminDb.collection('events').doc(eventId).collection('rsvps').doc(userId).get();
  if (!snap.exists) return null;
  const rsvp = snap.data() as EventRsvpDoc;
  return rsvp.status === 'going' ? 'going' : null;
}

export async function getEventById(eventId: string, viewer: { tier: SubscriptionPlan; isAdmin?: boolean; userId?: string }): Promise<EventRecord | null> {
  const snap = await adminDb.collection('events').doc(eventId).get();
  if (!snap.exists) return null;
  const doc = snap.data() as EventDoc;
  if (!canAccessEvent(doc, viewer.tier, viewer.isAdmin === true)) return null;
  const viewerRsvp = await getViewerRsvpStatus(eventId, viewer.userId);
  return serializeEvent(doc, { includeMeeting: true, viewerRsvp });
}

export async function listEvents(viewer: { tier: SubscriptionPlan; isAdmin?: boolean; userId?: string }, options: EventListOptions = {}): Promise<EventRecord[]> {
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  const month = options.month || new Date().toISOString().slice(0, 7);
  const { start, end } = getMonthBounds(month);

  let query: FirebaseFirestore.Query = adminDb
    .collection('events')
    .where('startsAt', '>=', Timestamp.fromDate(start))
    .where('startsAt', '<=', Timestamp.fromDate(end))
    .orderBy('startsAt', 'asc')
    .limit(limit);

  if (options.status && options.status !== 'all') {
    query = query.where('status', '==', options.status);
  }
  if (options.type && options.type !== 'all') {
    query = query.where('eventType', '==', options.type);
  }

  const snap = await query.get();
  const visibleEvents = snap.docs
    .map((item) => item.data() as EventDoc)
    .filter((event) => options.includeDrafts || canAccessEvent(event, viewer.tier, viewer.isAdmin === true));

  const rsvpByEvent = new Map<string, EventRsvpStatus | null>();
  if (viewer.userId && visibleEvents.length) {
    await Promise.all(
      visibleEvents.map(async (event) => {
        rsvpByEvent.set(event.eventId, await getViewerRsvpStatus(event.eventId, viewer.userId));
      })
    );
  }

  return visibleEvents.map((event) =>
    serializeEvent(event, {
      includeMeeting: viewer.isAdmin === true || canAccessEvent(event, viewer.tier, false),
      viewerRsvp: rsvpByEvent.get(event.eventId) ?? null,
    })
  );
}

export async function deleteEvent(eventId: string): Promise<void> {
  await adminDb.collection('events').doc(eventId).delete();
}

export async function rsvpToEvent(eventId: string, viewer: { userId: string; tier: SubscriptionPlan; isAdmin?: boolean }): Promise<{ event: EventRecord; rsvp: EventRsvpRecord }> {
  const eventRef = adminDb.collection('events').doc(eventId);
  const rsvpRef = eventRef.collection('rsvps').doc(viewer.userId);
  let shouldSendConfirmation = false;
  let eventForConfirmation: EventDoc | null = null;
  const userSnap = await adminDb.collection('users').doc(viewer.userId).get();
  const user = userSnap.exists ? userSnap.data() as Record<string, unknown> : {};
  const displayName = sanitizeEventString(
    String(user.displayName || user.name || user.email || 'Member'),
    160
  ) || 'Member';
  const email = sanitizeEventString(String(user.email || ''), 320) || undefined;
  const photoURL = sanitizeEventString(String(user.photoURL || user.avatarURL || user.avatarUrl || ''), 2048) || null;

  await adminDb.runTransaction(async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists) {
      throw new EventRsvpError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventSnap.data() as EventDoc;
    if (!canAccessEvent(event, viewer.tier, viewer.isAdmin === true)) {
      throw new EventRsvpError('This event is not available to your account.', 'EVENT_NOT_ACCESSIBLE');
    }
    if (!['scheduled', 'live'].includes(event.status)) {
      throw new EventRsvpError('RSVPs are only open for upcoming or live events.', 'EVENT_NOT_OPEN');
    }

    const rsvpSnap = await transaction.get(rsvpRef);
    const existing = rsvpSnap.exists ? (rsvpSnap.data() as EventRsvpDoc) : null;
    const alreadyGoing = existing?.status === 'going';
    const capacity = event.capacity ?? null;
    const currentCount = Math.max(0, Number(event.rsvpCount || 0));

    if (!alreadyGoing && capacity !== null && currentCount >= capacity) {
      throw new EventRsvpError('This event is already full.', 'EVENT_FULL');
    }

    const nextRsvp: EventRsvpDoc = {
      eventId,
      userId: viewer.userId,
      status: 'going',
      displayName,
      email,
      photoURL,
      createdAt: existing?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      cancelledAt: null,
    };

    transaction.set(rsvpRef, nextRsvp, { merge: true });
    if (!alreadyGoing) {
      shouldSendConfirmation = true;
      eventForConfirmation = event;
      transaction.update(eventRef, {
        rsvpCount: currentCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  const [event, rsvpSnap] = await Promise.all([
    getEventById(eventId, { tier: viewer.tier, isAdmin: viewer.isAdmin, userId: viewer.userId }),
    rsvpRef.get(),
  ]);

  if (!event || !rsvpSnap.exists) {
    throw new EventRsvpError('Event not found.', 'EVENT_NOT_FOUND');
  }

  const confirmationEvent = eventForConfirmation as EventDoc | null;
  if (shouldSendConfirmation && confirmationEvent) {
    await notifySingleEventUser(viewer.userId, confirmationEvent, {
      title: `You're going: ${confirmationEvent.title}`,
      body: `Saved for ${formatEventNotificationTime(confirmationEvent.startsAt, confirmationEvent.timezone)}.`,
    });
  }

  return { event, rsvp: serializeRsvp(rsvpSnap.data() as EventRsvpDoc) };
}

export async function cancelEventRsvp(eventId: string, viewer: { userId: string; tier: SubscriptionPlan; isAdmin?: boolean }): Promise<{ event: EventRecord; rsvp: EventRsvpRecord | null }> {
  const eventRef = adminDb.collection('events').doc(eventId);
  const rsvpRef = eventRef.collection('rsvps').doc(viewer.userId);

  await adminDb.runTransaction(async (transaction) => {
    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists) {
      throw new EventRsvpError('Event not found.', 'EVENT_NOT_FOUND');
    }

    const event = eventSnap.data() as EventDoc;
    if (!canAccessEvent(event, viewer.tier, viewer.isAdmin === true)) {
      throw new EventRsvpError('This event is not available to your account.', 'EVENT_NOT_ACCESSIBLE');
    }

    const rsvpSnap = await transaction.get(rsvpRef);
    const existing = rsvpSnap.exists ? (rsvpSnap.data() as EventRsvpDoc) : null;
    if (existing?.status !== 'going') return;

    transaction.set(rsvpRef, {
      eventId,
      userId: viewer.userId,
      status: 'cancelled',
      createdAt: existing.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      cancelledAt: FieldValue.serverTimestamp(),
    } satisfies EventRsvpDoc, { merge: true });
    transaction.update(eventRef, {
      rsvpCount: Math.max(0, Number(event.rsvpCount || 0) - 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const [event, rsvpSnap] = await Promise.all([
    getEventById(eventId, { tier: viewer.tier, isAdmin: viewer.isAdmin, userId: viewer.userId }),
    rsvpRef.get(),
  ]);

  if (!event) {
    throw new EventRsvpError('Event not found.', 'EVENT_NOT_FOUND');
  }

  return {
    event,
    rsvp: rsvpSnap.exists ? serializeRsvp(rsvpSnap.data() as EventRsvpDoc) : null,
  };
}

export async function listEventRsvps(eventId: string): Promise<EventRsvpRecord[]> {
  const eventRef = adminDb.collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) {
    throw new EventRsvpError('Event not found.', 'EVENT_NOT_FOUND');
  }

  const [rsvpSnap, attendanceSnap] = await Promise.all([
    eventRef.collection('rsvps').orderBy('updatedAt', 'desc').limit(500).get(),
    eventRef.collection('attendance').limit(500).get(),
  ]);
  const attendanceByUser = new Map<string, EventAttendanceDoc>();
  attendanceSnap.docs.forEach((doc) => {
    attendanceByUser.set(doc.id, doc.data() as EventAttendanceDoc);
  });

  return rsvpSnap.docs.map((doc) => serializeRsvp(doc.data() as EventRsvpDoc, attendanceByUser.get(doc.id) || null));
}

export async function markEventAttendance(eventId: string, userId: string, actorId: string): Promise<{ attendee: EventRsvpRecord }> {
  const eventRef = adminDb.collection('events').doc(eventId);
  const rsvpRef = eventRef.collection('rsvps').doc(userId);
  const attendanceRef = eventRef.collection('attendance').doc(userId);

  await adminDb.runTransaction(async (transaction) => {
    const [eventSnap, rsvpSnap] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(rsvpRef),
    ]);
    if (!eventSnap.exists) {
      throw new EventRsvpError('Event not found.', 'EVENT_NOT_FOUND');
    }
    if (!rsvpSnap.exists || (rsvpSnap.data() as EventRsvpDoc).status !== 'going') {
      throw new EventRsvpError('Only active RSVPs can be checked in.', 'EVENT_NOT_OPEN');
    }
    transaction.set(attendanceRef, {
      eventId,
      userId,
      status: 'attended',
      checkedInAt: FieldValue.serverTimestamp(),
      checkedInBy: actorId,
    } satisfies EventAttendanceDoc, { merge: true });
  });

  const [rsvpSnap, attendanceSnap] = await Promise.all([rsvpRef.get(), attendanceRef.get()]);
  return {
    attendee: serializeRsvp(
      rsvpSnap.data() as EventRsvpDoc,
      attendanceSnap.exists ? (attendanceSnap.data() as EventAttendanceDoc) : null
    ),
  };
}

export async function removeEventAttendance(eventId: string, userId: string): Promise<{ attendee: EventRsvpRecord }> {
  const eventRef = adminDb.collection('events').doc(eventId);
  const rsvpRef = eventRef.collection('rsvps').doc(userId);
  const attendanceRef = eventRef.collection('attendance').doc(userId);

  const rsvpSnap = await rsvpRef.get();
  if (!rsvpSnap.exists) {
    throw new EventRsvpError('RSVP not found.', 'EVENT_NOT_FOUND');
  }
  await attendanceRef.delete();
  return {
    attendee: serializeRsvp(rsvpSnap.data() as EventRsvpDoc, null),
  };
}

function getDefaultAnalyticsMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function roundRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export async function getEventAnalytics(month = getDefaultAnalyticsMonth()): Promise<EventAnalyticsSummary> {
  const events = await listEvents(
    { tier: 'elite', isAdmin: true },
    { month, status: 'all', includeDrafts: true, limit: 250 }
  );

  const rosters = await Promise.all(
    events.map(async (event) => ({
      event,
      attendees: await listEventRsvps(event.eventId),
    }))
  );

  const byType = new Map<EventType, { type: EventType; events: number; rsvps: number; attended: number }>();
  const byStatus = new Map<EventStatus, { status: EventStatus; events: number }>();

  let activeRsvps = 0;
  let cancelledRsvps = 0;
  let attended = 0;
  let capacity = 0;
  let replays = 0;

  const topEvents = rosters.map(({ event, attendees }) => {
    const active = attendees.filter((item) => item.status === 'going');
    const checkedIn = active.filter((item) => item.attendance?.status === 'attended').length;
    activeRsvps += active.length;
    cancelledRsvps += attendees.filter((item) => item.status === 'cancelled').length;
    attended += checkedIn;
    capacity += event.capacity || 0;
    if (event.replayUrl) replays += 1;

    const typeMetric = byType.get(event.eventType) || { type: event.eventType, events: 0, rsvps: 0, attended: 0 };
    typeMetric.events += 1;
    typeMetric.rsvps += active.length;
    typeMetric.attended += checkedIn;
    byType.set(event.eventType, typeMetric);

    const statusMetric = byStatus.get(event.status) || { status: event.status, events: 0 };
    statusMetric.events += 1;
    byStatus.set(event.status, statusMetric);

    return {
      eventId: event.eventId,
      title: event.title,
      eventType: event.eventType,
      status: event.status,
      startsAt: event.startsAt,
      rsvps: active.length,
      attended: checkedIn,
      attendanceRate: roundRate(checkedIn, active.length),
    };
  });

  const completed = events.filter((event) => event.status === 'completed').length;
  const totalRsvps = activeRsvps + cancelledRsvps;

  return {
    month,
    totals: {
      events: events.length,
      scheduled: events.filter((event) => event.status === 'scheduled').length,
      live: events.filter((event) => event.status === 'live').length,
      completed,
      cancelled: events.filter((event) => event.status === 'cancelled').length,
      rsvps: totalRsvps,
      activeRsvps,
      cancelledRsvps,
      attended,
      capacity,
      replays,
    },
    rates: {
      attendanceRate: roundRate(attended, activeRsvps),
      cancellationRate: roundRate(cancelledRsvps, totalRsvps),
      capacityUtilization: roundRate(activeRsvps, capacity),
      replayCoverage: roundRate(replays, completed),
    },
    byType: Array.from(byType.values()).sort((a, b) => b.rsvps - a.rsvps),
    byStatus: Array.from(byStatus.values()).sort((a, b) => b.events - a.events),
    topEvents: topEvents.sort((a, b) => b.rsvps - a.rsvps).slice(0, 6),
  };
}

function legacyStatusToEventStatus(status?: string): EventStatus {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'published') return 'completed';
  if (status === 'scheduled') return 'scheduled';
  if (status === 'draft' || status === 'editing') return 'draft';
  return 'draft';
}

export async function migrateLegacyEventModeScheduledPosts(options: { actorId: string; dryRun?: boolean; limit?: number }): Promise<LegacyEventMigrationResult> {
  const dryRun = options.dryRun === true;
  const limit = Math.min(Math.max(options.limit || 100, 1), 250);
  const snap = await adminDb
    .collection('scheduledPosts')
    .where('metadata.calendarMode', '==', 'events')
    .limit(limit)
    .get();

  const result: LegacyEventMigrationResult = {
    dryRun,
    scanned: snap.size,
    migrated: 0,
    skipped: 0,
    items: [],
  };

  for (const doc of snap.docs) {
    const legacy = doc.data() as LegacyScheduledEventDoc;
    const metadata = legacy.metadata || {};
    const scheduledPostId = legacy.scheduledPostId || doc.id;

    if (typeof metadata.migratedEventId === 'string' && metadata.migratedEventId) {
      result.skipped += 1;
      result.items.push({
        scheduledPostId,
        eventId: metadata.migratedEventId,
        action: 'skipped',
        reason: 'already_migrated',
      });
      continue;
    }

    if (!legacy.scheduledTime) {
      result.skipped += 1;
      result.items.push({
        scheduledPostId,
        action: 'skipped',
        reason: 'missing_scheduled_time',
      });
      continue;
    }

    const eventRef = adminDb.collection('events').doc();
    const title = sanitizeEventString(legacy.title || legacy.caption || 'Migrated live event', 160) || 'Migrated live event';
    const description = sanitizeEventText(legacy.notes || legacy.caption || 'Migrated from the legacy calendar event mode.', 5000) || 'Migrated from the legacy calendar event mode.';
    const startsAt = legacy.scheduledTime;
    const eventDoc = stripUndefined<EventDoc>({
      eventId: eventRef.id,
      title,
      description,
      eventType: 'live_class',
      status: legacyStatusToEventStatus(legacy.status),
      startsAt,
      endsAt: null,
      timezone: sanitizeEventString(legacy.timezone || 'UTC', 80) || 'UTC',
      hostId: legacy.ownerId,
      hostName: undefined,
      meetingProvider: 'none',
      visibility: 'all',
      allowedTiers: ['explorer', 'pro', 'elite'],
      capacity: null,
      rsvpCount: 0,
      seriesId: typeof metadata.seriesId === 'string' ? sanitizeEventString(metadata.seriesId, 160) || undefined : undefined,
      coverImageUrl: undefined,
      createdBy: legacy.ownerId || options.actorId,
      updatedBy: options.actorId,
      createdAt: legacy.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    result.migrated += 1;
    result.items.push({
      scheduledPostId,
      eventId: eventRef.id,
      action: 'migrated',
      title,
      startsAt: toIso(startsAt) ?? new Date().toISOString(),
    });

    if (!dryRun) {
      const batch = adminDb.batch();
      batch.set(eventRef, eventDoc);
      batch.set(doc.ref, {
        status: 'cancelled',
        metadata: {
          ...metadata,
          calendarMode: 'events',
          migratedEventId: eventRef.id,
          migratedToEventsAt: FieldValue.serverTimestamp(),
          migrationVersion: 'events-v1',
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await batch.commit();
    }
  }

  return result;
}
