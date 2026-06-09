import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  increment,
  runTransaction,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type XPEventType =
  | 'mission'
  | 'post'
  | 'comment'
  | 'mentor'
  | 'profile'
  | 'login'
  | 'streak'
  | 'other';

export interface XPEvent {
  xp: number;
  type: XPEventType;
  metadata?: Record<string, any> | null;
  createdAt: any;
}

export interface WeeklyPerformancePoint {
  name: string;
  xp: number;
  date: string;
}

const functions = getFunctions(getApp());
const logXPEventCallable = httpsCallable(functions, 'logXPEvent');

export async function logXPEvent(
  userId: string,
  type: XPEventType,
  xp: number,
  metadata: Record<string, any> | null = null
) {
  if (!userId) {
    throw new Error('Missing userId for XP logging');
  }

  await logXPEventCallable({ userId, type, xp, metadata });
}

export async function awardXP(
  userId: string,
  xp: number,
  type: XPEventType,
  metadata: Record<string, any> | null = null
) {
  if (!userId || xp <= 0) {
    return;
  }

  const userRef = doc(db, 'users', userId);

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) {
      tx.set(
        userRef,
        {
          xp,
          streak: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      tx.update(userRef, {
        xp: increment(xp),
      });
    }
  });

  await logXPEvent(userId, type, xp, metadata);
}

export async function calculateWeeklyXP(userId: string): Promise<WeeklyPerformancePoint[]> {
  if (!userId) return [];

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
