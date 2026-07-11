import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineBoolean, defineInt } from 'firebase-functions/params';

const db = admin.firestore();
const socialTokenRefreshEnabled = defineBoolean('SOCIAL_TOKEN_REFRESH_ENABLED', { default: false });
const socialTokenRefreshWindowDays = defineInt('SOCIAL_TOKEN_REFRESH_WINDOW_DAYS', { default: 7 });

type SocialAccountDoc = {
  socialAccountId: string;
  ownerId: string;
  providerId: string;
  connectionType?: 'oauth' | 'manual' | 'imported';
  status: string;
  hasCredentials: boolean;
  expiresAt?: admin.firestore.Timestamp | null;
  lastSyncedAt?: admin.firestore.Timestamp | null;
  metadata?: Record<string, unknown>;
};

export const queueSocialTokenRefreshJobs = onSchedule(
  { schedule: '0 */6 * * *', timeZone: 'UTC' },
  async () => {
    if (!socialTokenRefreshEnabled.value()) {
      return;
    }

    const windowDays = Math.max(1, socialTokenRefreshWindowDays.value());
    const cutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000));
    const snapshot = await db
      .collection('socialAccounts')
      .where('connectionType', '==', 'oauth')
      .get();

    const batch = db.batch();
    let queued = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as SocialAccountDoc;
      if (!data.hasCredentials || data.status === 'disconnected') {
        return;
      }

      if (data.expiresAt && data.expiresAt.toMillis() > cutoff.toMillis()) {
        return;
      }

      const jobRef = db.collection('socialTokenRefreshJobs').doc();
      batch.set(jobRef, {
        socialTokenRefreshJobId: jobRef.id,
        socialAccountId: data.socialAccountId || doc.id,
        ownerId: data.ownerId,
        providerId: data.providerId,
        status: 'queued',
        reason: data.expiresAt ? 'credential expiring soon' : 'oauth account needs refresh review',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      queued += 1;
    });

    if (queued > 0) {
      await batch.commit();
      console.log(`queueSocialTokenRefreshJobs queued ${queued} jobs`);
    }
  }
);
