import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineBoolean, defineInt } from 'firebase-functions/params';
import { runScheduledJob } from './job-telemetry';
import { shouldQueueRefreshJob } from './job-guards';

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
    await runScheduledJob('queueSocialTokenRefreshJobs', async () => {
      if (!socialTokenRefreshEnabled.value()) return { enabled: false, checked: 0, queued: 0 };

      const windowDays = Math.max(1, socialTokenRefreshWindowDays.value());
      const cutoff = admin.firestore.Timestamp.fromDate(new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000));
      const cursorRef = db.collection('system').doc('social_token_refresh_cursor');
      const cursorSnap = await cursorRef.get();
      const cursorId = cursorSnap.exists ? cursorSnap.data()?.lastSocialAccountId as string | undefined : undefined;
      let accountsQuery = db
        .collection('socialAccounts')
        .where('connectionType', '==', 'oauth')
        .where('status', '==', 'connected')
        .orderBy('__name__')
        .limit(200);
      if (cursorId) {
        const cursorDoc = await db.collection('socialAccounts').doc(cursorId).get();
        if (cursorDoc.exists) accountsQuery = accountsQuery.startAfter(cursorDoc);
      }
      const snapshot = await accountsQuery.get();

      const candidates = snapshot.docs.map((doc) => {
        const data = doc.data() as SocialAccountDoc;
        const accountId = data.socialAccountId || doc.id;
        return { doc, data, accountId, jobRef: db.collection('socialTokenRefreshJobs').doc(`${accountId}_current`) };
      });
      const existingJobs = candidates.length > 0 ? await db.getAll(...candidates.map(({ jobRef }) => jobRef)) : [];
      const batch = db.batch();
      let queued = 0;

      candidates.forEach(({ doc, data, accountId, jobRef }, index) => {
        if (!data.hasCredentials || (data.expiresAt && data.expiresAt.toMillis() > cutoff.toMillis())) return;

        const existing = existingJobs[index];
        const existingData = existing.exists ? existing.data() as {
          status?: string;
          leaseExpiresAt?: admin.firestore.Timestamp | null;
          createdAt?: admin.firestore.Timestamp;
        } : undefined;
        const leaseExpiresAtMs = existingData?.leaseExpiresAt?.toMillis?.() ?? null;
        if (!shouldQueueRefreshJob(existingData?.status, leaseExpiresAtMs)) return;

        const queuedAt = admin.firestore.Timestamp.now();
        batch.set(jobRef, {
          socialTokenRefreshJobId: jobRef.id,
          socialAccountId: accountId,
          ownerId: data.ownerId,
          providerId: data.providerId,
          status: 'queued',
          reason: data.expiresAt ? 'credential expiring soon' : 'oauth account needs refresh review',
          expiresAt: data.expiresAt || null,
          refreshWindowDays: windowDays,
          leaseId: null,
          leaseExpiresAt: null,
          attempts: 0,
          lastError: null,
          createdAt: existingData?.createdAt || queuedAt,
          updatedAt: queuedAt,
        }, { merge: true });
        batch.set(doc.ref, {
          metadata: {
            ...(data.metadata || {}),
            tokenRefreshQueuedAt: queuedAt,
            tokenRefreshJobId: jobRef.id,
          },
          updatedAt: queuedAt,
        }, { merge: true });
        queued += 1;
      });

      if (queued > 0) await batch.commit();
      await cursorRef.set({
        lastSocialAccountId: snapshot.size === 200 ? snapshot.docs[snapshot.docs.length - 1].id : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return { enabled: true, checked: snapshot.size, queued };
    });
  }
);
