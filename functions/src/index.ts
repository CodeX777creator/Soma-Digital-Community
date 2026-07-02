import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logXPEvent } from './xp';

initializeApp();
const db = getFirestore();

const MISSION_TEMPLATES = [
  {
    title: 'Daily Learning',
    xp: 50,
    lockedForTier: null,
  },
  {
    title: 'Engage with Community',
    xp: 30,
    lockedForTier: null,
  },
  {
    title: 'Complete Strategy Review',
    xp: 100,
    lockedForTier: 'pro',
  },
];

function getYMDString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function hasTodayMissions(uid: string, dateString: string) {
  const missionsRef = db.collection('users').doc(uid).collection('missions');
  const snapshot = await missionsRef.where('dateString', '==', dateString).limit(1).get();
  return !snapshot.empty;
}

async function createMissionsForUser(uid: string, dateString: string, batch?: WriteBatch) {
  const userRef = db.collection('users').doc(uid);
  const missionsRef = userRef.collection('missions');

  const tasks = MISSION_TEMPLATES.map((template) => {
    const missionDoc = missionsRef.doc();
    const missionData = {
      title: template.title,
      xp: template.xp,
      completed: false,
      completedAt: null,
      lockedForTier: template.lockedForTier,
      dateString,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    if (batch) {
      batch.set(missionDoc, missionData);
      return null;
    }

    return missionDoc.set(missionData);
  });

  if (!batch) {
    await Promise.all(tasks);
  }
}

async function createDailyMissionsForAllUsers(dateString: string) {
  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs.map((doc) => doc.id);

  const batchSize = 250;
  const batches: WriteBatch[] = [];

  for (let index = 0; index < users.length; index += batchSize) {
    batches.push(db.batch());
  }

  for (let i = 0; i < users.length; i += 1) {
    const batchIndex = Math.floor(i / batchSize);
    const uid = users[i];
    const batch = batches[batchIndex];
    const missionsRef = db.collection('users').doc(uid).collection('missions');
    const missionQuery = await missionsRef.where('dateString', '==', dateString).limit(1).get();

    if (missionQuery.empty) {
      MISSION_TEMPLATES.forEach((template) => {
        const missionDoc = missionsRef.doc();
        batch.set(missionDoc, {
          title: template.title,
          xp: template.xp,
          completed: false,
          completedAt: null,
          lockedForTier: template.lockedForTier,
          dateString,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });
    }
  }

  const commits = batches.map((batch) => batch.commit());
  await Promise.all(commits);
}

export const assignDailyMissions = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'UTC' },
  async (event) => {
    const dateString = getYMDString(new Date());
    try {
      await createDailyMissionsForAllUsers(dateString);
    } catch (error) {
      console.error('assignDailyMissions failed:', error);
    }
  }
);

export const assignMissionsOnUserSignup = onDocumentCreated('users/{uid}', async (event) => {
  const uid = event.params.uid;
  if (!uid) {
    console.warn('assignMissionsOnUserSignup: missing uid');
    return;
  }

  const dateString = getYMDString(new Date());
  if (await hasTodayMissions(uid, dateString)) {
    return;
  }

  await createMissionsForUser(uid, dateString);
});

export const runDailyMissionsManually = onRequest(async (req, res) => {
  const dateString = getYMDString(new Date());

  try {
    await createDailyMissionsForAllUsers(dateString);
    res.status(200).send({ success: true, date: dateString });
  } catch (error) {
    console.error('runDailyMissionsManually failed:', error);
    res.status(500).send({ success: false, error: (error as Error).message });
  }
});

// PayPal subscription functions
export { createPayPalSubscription, paypalWebhook, cancelPayPalSubscription, checkSubscriptionStatus } from './paypal';
// Paystack subscription functions
export { createPaystackSubscription, paystackWebhook, cancelPaystackSubscription } from './paystack';
// Subscription sync and cleanup jobs
export { syncSubscriptions, runSubscriptionSync } from './subscriptionSync';
// XP event validation
export { logXPEvent } from './xp';
// AI mentor chat
export { mentorChat } from './mentorChat';
