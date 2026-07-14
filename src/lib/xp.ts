import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { authFetch } from '@/lib/clientApi';
import type { XPActionKey, XPEventType } from '@/lib/xp-policy';

export interface XPEvent {
  xp: number;
  type: XPEventType;
  action?: XPActionKey;
  resourceId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: any;
}

export interface WeeklyPerformancePoint {
  name: string;
  xp: number;
  date: string;
}

export async function awardXPAction(
  action: XPActionKey,
  options: {
    resourceId?: string | null;
    metadata?: Record<string, any> | null;
    xpOverride?: number;
  } = {}
) {
  const response = await authFetch('/api/xp/award', {
    method: 'POST',
    body: JSON.stringify({
      action,
      resourceId: options.resourceId || undefined,
      metadata: options.metadata || undefined,
      xpOverride: options.xpOverride,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Unable to award XP');
  }

  return response.json() as Promise<{ awarded: boolean; xp: number; eventId?: string; reason?: string }>;
}

export async function awardXP(
  userId: string,
  xp: number,
  type: XPEventType,
  metadata: Record<string, any> | null = null
) {
  const resourceId =
    typeof metadata?.missionId === 'string' ? metadata.missionId :
    typeof metadata?.postId === 'string' ? metadata.postId :
    typeof metadata?.commentId === 'string' ? metadata.commentId :
    type;
  const action: XPActionKey =
    type === 'post' ? 'community_post_created' :
    type === 'comment' ? 'community_comment_created' :
    type === 'reply' ? 'community_reply_created' :
    type === 'mission' ? 'mission_completed' :
    type === 'login' ? 'daily_login' :
    'growth_assessment_complete';

  return awardXPAction(action, { resourceId, metadata, xpOverride: xp });
}

export async function logXPEvent() {
  throw new Error('logXPEvent is deprecated. Use awardXPAction so XP totals and events stay consistent.');
}

export async function calculateWeeklyXP(userId: string): Promise<WeeklyPerformancePoint[]> {
  if (!userId || !db) return [];

  const since = new Date();
  since.setDate(since.getDate() - 6);
  since.setHours(0, 0, 0, 0);

  const xpEventsRef = collection(db, `users/${userId}/xpEvents`);
  const eventsQuery = query(
    xpEventsRef,
    where('createdAt', '>=', since),
    orderBy('createdAt', 'asc')
  );
  const eventsSnapshot = await getDocs(eventsQuery);

  const totalsByDay = new Map<string, number>();
  eventsSnapshot.docs.forEach((docSnap) => {
    const event = docSnap.data() as XPEvent;
    const date = event.createdAt?.toDate?.();
    const amount = typeof event.xp === 'number' ? event.xp : 0;
    if (!date || amount <= 0) return;
    const key = date.toISOString().slice(0, 10);
    totalsByDay.set(key, (totalsByDay.get(key) || 0) + amount);
  });

  const performance: WeeklyPerformancePoint[] = [];
  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);
    const key = date.toISOString().slice(0, 10);
    const name = date.toLocaleDateString('en-US', { weekday: 'short' });
    performance.push({
      name,
      xp: totalsByDay.get(key) || 0,
      date: date.toISOString(),
    });
  }

  return performance;
}
