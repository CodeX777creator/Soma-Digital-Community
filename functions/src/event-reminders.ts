import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sendNotificationWithPush } from './push-notifications';

const db = admin.firestore();

type EventStatus = 'draft' | 'scheduled' | 'live' | 'completed' | 'cancelled';

interface EventDoc {
  eventId?: string;
  title?: string;
  status?: EventStatus;
  startsAt?: admin.firestore.Timestamp;
  endsAt?: admin.firestore.Timestamp | null;
  timezone?: string;
  replayUrl?: string;
  reminders?: {
    dayBeforeSentAt?: admin.firestore.Timestamp;
    hourBeforeSentAt?: admin.firestore.Timestamp;
  };
  lifecycleAutomation?: {
    markedLiveAt?: admin.firestore.Timestamp;
    markedCompletedAt?: admin.firestore.Timestamp;
    lastRunAt?: admin.firestore.Timestamp;
  };
}

interface RsvpDoc {
  userId?: string;
  status?: 'going' | 'cancelled';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function formatEventTime(startsAt: admin.firestore.Timestamp, timezone = 'UTC'): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(startsAt.toDate());
}

async function getActiveRsvpUserIds(eventId: string): Promise<string[]> {
  const snap = await db
    .collection('events')
    .doc(eventId)
    .collection('rsvps')
    .where('status', '==', 'going')
    .limit(1000)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as RsvpDoc;
    return data.userId || doc.id;
  });
}

async function notifyRsvps(eventId: string, event: EventDoc, title: string, body: string) {
  const userIds = await getActiveRsvpUserIds(eventId);
  if (!userIds.length) return;

  await Promise.allSettled(
    userIds.map((userId) =>
      sendNotificationWithPush(
        userId,
        'event',
        title,
        body,
        `/events/${eventId}`
      )
    )
  );
}

async function claimEventMarker(eventId: string, fieldPath: string): Promise<boolean> {
  const ref = db.collection('events').doc(eventId);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return false;
    const event = snap.data() as EventDoc;
    const segments = fieldPath.split('.');
    let current: any = event;
    for (const segment of segments) {
      current = current?.[segment];
      if (current === undefined || current === null) break;
    }
    if (current) return false;

    transaction.update(ref, {
      [fieldPath]: admin.firestore.FieldValue.serverTimestamp(),
      'lifecycleAutomation.lastRunAt': admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function updateEventStatus(eventId: string, from: EventStatus, to: EventStatus, markerField: string): Promise<boolean> {
  const ref = db.collection('events').doc(eventId);
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return false;
    const event = snap.data() as EventDoc;
    if (event.status !== from) return false;

    transaction.update(ref, {
      status: to,
      [markerField]: admin.firestore.FieldValue.serverTimestamp(),
      'lifecycleAutomation.lastRunAt': admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function processEventSnapshot(doc: admin.firestore.QueryDocumentSnapshot, now: Date) {
  const eventId = doc.id;
  const event = doc.data() as EventDoc;
  const startsAt = event.startsAt;
  if (!startsAt) return;

  const startMs = startsAt.toDate().getTime();
  const nowMs = now.getTime();
  const title = event.title || 'SDC event';
  const timezone = event.timezone || 'UTC';

  if (event.status === 'scheduled') {
    const untilStart = startMs - nowMs;

    if (untilStart > 0 && untilStart <= DAY_MS && !event.reminders?.dayBeforeSentAt) {
      const claimed = await claimEventMarker(eventId, 'reminders.dayBeforeSentAt');
      if (claimed) {
        await notifyRsvps(
          eventId,
          event,
          `Reminder: ${title} is coming up`,
          `Your SDC event starts ${formatEventTime(startsAt, timezone)}.`
        );
      }
    }

    if (untilStart > 0 && untilStart <= HOUR_MS && !event.reminders?.hourBeforeSentAt) {
      const claimed = await claimEventMarker(eventId, 'reminders.hourBeforeSentAt');
      if (claimed) {
        await notifyRsvps(
          eventId,
          event,
          `${title} starts soon`,
          'Your SDC event starts in about an hour. Open the event page when you are ready.'
        );
      }
    }

    if (startMs <= nowMs) {
      const endsAtMs = event.endsAt?.toDate?.().getTime();
      if (!endsAtMs || endsAtMs > nowMs) {
        const updated = await updateEventStatus(eventId, 'scheduled', 'live', 'lifecycleAutomation.markedLiveAt');
        if (updated) {
          await notifyRsvps(
            eventId,
            { ...event, status: 'live' },
            `${title} is live now`,
            'Your SDC event has started. Join from the event page.'
          );
        }
      }
    }
  }

  if (event.status === 'live') {
    const endsAtMs = event.endsAt?.toDate?.().getTime();
    if (endsAtMs && endsAtMs <= nowMs) {
      const updated = await updateEventStatus(eventId, 'live', 'completed', 'lifecycleAutomation.markedCompletedAt');
      if (updated) {
        await notifyRsvps(
          eventId,
          { ...event, status: 'completed' },
          `${title} has ended`,
          event.replayUrl ? 'The replay is available on the event page.' : 'The event has been marked completed.'
        );
      }
    }
  }
}

export const processEventRemindersAndLifecycle = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'UTC', memory: '512MiB', timeoutSeconds: 300 },
  async () => {
    const now = new Date();
    const windowStart = admin.firestore.Timestamp.fromDate(new Date(now.getTime() - 6 * HOUR_MS));
    const windowEnd = admin.firestore.Timestamp.fromDate(new Date(now.getTime() + DAY_MS));

    const snap = await db
      .collection('events')
      .where('startsAt', '>=', windowStart)
      .where('startsAt', '<=', windowEnd)
      .orderBy('startsAt', 'asc')
      .limit(200)
      .get();

    const candidates = snap.docs.filter((doc) => {
      const status = (doc.data() as EventDoc).status;
      return status === 'scheduled' || status === 'live';
    });

    for (const doc of candidates) {
      try {
        await processEventSnapshot(doc, now);
      } catch (error) {
        console.error('processEventRemindersAndLifecycle event failed', {
          eventId: doc.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
);
