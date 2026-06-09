import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();
const ALLOWED_TYPES = ['mission', 'post', 'comment', 'mentor', 'profile', 'login', 'streak', 'other'] as const;

type XPEventType = (typeof ALLOWED_TYPES)[number];

export const logXPEvent = onCall(async (req) => {
  const uid = req.auth?.uid;
  const data = req.data as {
    userId?: string;
    type?: string;
    xp?: number;
    metadata?: Record<string, any> | null;
  };

  if (!uid) {
    return {
      status: 401,
      error: 'Authentication required to log XP events.',
    };
  }

  const targetUserId = data.userId || uid;
  if (targetUserId !== uid) {
    return {
      status: 403,
      error: 'Cannot log XP events for another user.',
    };
  }

  const xp = typeof data.xp === 'number' ? data.xp : NaN;
  const type = typeof data.type === 'string' ? data.type : '';
  const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : null;

  if (!ALLOWED_TYPES.includes(type as XPEventType)) {
    return {
      status: 400,
      error: `Invalid xp event type: ${type}`,
    };
  }

  if (!Number.isFinite(xp) || xp < 0) {
    return {
      status: 400,
      error: 'XP must be a non-negative number.',
    };
  }

  const eventRef = db.collection('users').doc(uid).collection('xpEvents').doc();
  await eventRef.set({
    xp,
    type,
    metadata,
    createdAt: Timestamp.now(),
  });

  return { success: true };
});
