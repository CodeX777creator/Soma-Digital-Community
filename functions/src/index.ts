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
export { createPaystackSubscription, createPaystackAssetPurchase, paystackWebhook, cancelPaystackSubscription } from './paystack';
// Subscription sync and cleanup jobs
export { syncSubscriptions, runSubscriptionSync } from './subscriptionSync';
// XP event validation
export { logXPEvent } from './xp';
// AI mentor chat
export { mentorChat } from './mentorChat';

// Push notification functions
export { 
  sendPushNotification, 
  sendNotificationWithPush, 
  broadcastToAllUsers, 
  PushNotificationPayload 
} from './push-notifications';

// --- Trigger Functions ---

/**
 * Trigger: Send push notification when a comment is created.
 * Path assumes: users/{userId}/posts/{postId}/comments/{commentId}
 */
import { sendNotificationWithPush } from './push-notifications';

export const onCommentCreated = onDocumentCreated(
  'users/{userId}/posts/{postId}/comments/{commentId}',
  async (event) => {
    const commentData = event.data?.data();
    if (!commentData || !commentData.authorId) return;

    const { postId, userId: commenterId } = event.params;
    
    // Fetch post to get owner
    const postRef = event.data?.ref.parent.parent;
    if (!postRef) return;

    try {
      const postDoc = await postRef.get();
      if (!postDoc.exists || !postDoc.data()) return;
      
      const postOwnerId = postDoc.data()?.authorId;
      if (!postOwnerId || postOwnerId === commenterId) return;

      const text = commentData.text || commentData.content || 'New comment';
      
      await sendNotificationWithPush(
        postOwnerId,
        'comment_notification',
        'New Comment on Your Post',
        text.substring(0, 100),
        `/community/posts/${postId}`
      );
    } catch (error) {
      console.error('onCommentCreated failed:', error);
    }
  }
);

/**
 * Trigger: Send push notification when a user likes a post.
 * Path: users/{userId}/posts/{postId}/likes/{likeId}
 * Adjust path in onDocumentCreated if your structure differs.
 */
export const onLikeCreated = onDocumentCreated(
  'users/{userId}/posts/{postId}/likes/{likeId}',
  async (event) => {
    const likeData = event.data?.data();
    if (!likeData || !likeData.authorId) return;

    const { postId } = event.params;
    const likerId = likeData.authorId;
    
    // Fetch post to get owner
    const postRef = event.data?.ref.parent.parent;
    if (!postRef) return;

    try {
      const postDoc = await postRef.get();
      if (!postDoc.exists || !postDoc.data()) return;
      
      const postOwnerId = postDoc.data()?.authorId;
      if (!postOwnerId || postOwnerId === likerId) return;

      await sendNotificationWithPush(
        postOwnerId,
        'like_notification',
        'New Like on Your Post',
        'Your post received a new like!',
        `/community/posts/${postId}`
      );
    } catch (error) {
      console.error('onLikeCreated failed:', error);
    }
  }
);

// --- HTTP Endpoints ---
import { broadcastToAllUsers } from './push-notifications';

/**
 * HTTP Function: Manually trigger a notification to a specific user.
 * Useful for testing or admin actions.
 * Method: POST
 * Body: { userId, type, title, body, linkUrl }
 */
export const sendUserNotification = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { userId, type, title, body, linkUrl } = req.body;

  if (!userId || !title || !body) {
    res.status(400).json({ error: 'Missing required fields: userId, title, body' });
    return;
  }

  try {
    const result = await sendNotificationWithPush(
      userId,
      type || 'manual',
      title,
      body,
      linkUrl || '/notifications'
    );
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    console.error('Failed to send user notification:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * HTTP Function: Broadcast notification to all active users.
 * Note: Use with caution in production (rate limits).
 * Method: POST
 * Body: { title, body, url }
 */
export const broadcastNotification = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { title, body, url } = req.body;

  if (!title || !body) {
    res.status(400).json({ error: 'Missing required fields: title, body' });
    return;
  }

  try {
    console.log('Starting broadcast notification...');
    const result = await broadcastToAllUsers({
      title,
      body,
      data: { 
        url: url || '/notifications',
        type: 'broadcast' 
      },
    });
    
    console.log('Broadcast completed:', result);
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    console.error('Failed to broadcast notification:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Trigger: System Notification from Admin (e.g., ToS Update)
 * Path: system/notifications/{id}
 * Usage: Create a doc with { title, body, linkUrl, type: 'system' }
 */
export const onSystemNotificationCreated = onDocumentCreated(
  'systemNotifications/{notificationId}',
  async (event) => {
    const data = event.data?.data();
    if (!data || data.type !== 'system_broadcast') return;

    const { title, body, linkUrl, priority = 'high' } = data;

    if (!title || !body) {
      console.error('System notification missing title or body');
      return;
    }

    try {
      console.log(`Sending system notification: ${title}`);
      await broadcastToAllUsers({
        title,
        body,
        data: {
          url: linkUrl || '/notifications',
          type: 'system',
          priority: priority,
        },
        options: {
          // Optional: Set high priority for system messages
          highPriority: true,
        },
      });
      console.log('System notification broadcast successful');
    } catch (error) {
      console.error('System notification broadcast failed:', error);
    }
  }
);

/**
 * Trigger: Send push notification when a user is mentioned.
 * Path: users/{mentionedUserId}/mentions/{mentionId}
 * Expected Data: { sourceUserId, sourceType, sourceId, textSnippet, url }
 */
export const onMentionCreated = onDocumentCreated(
  'users/{mentionedUserId}/mentions/{mentionId}',
  async (event) => {
    const mentionData = event.data?.data();
    if (!mentionData) return;

    const { mentionedUserId } = event.params;
    const { sourceUserId, sourceType, sourceId, textSnippet, url } = mentionData;

    // Don't notify self if they mentioned themselves (optional logic)
    if (sourceUserId === mentionedUserId) return;

    try {
      const snippet = textSnippet ? `"${textSnippet.substring(0, 60)}..."` : '';
      await sendNotificationWithPush(
        mentionedUserId,
        'mention_notification',
        'You were mentioned!',
        `User mentioned you: ${snippet}`,
        url || `/community/posts/${sourceId}` || '/notifications'
      );
    } catch (error) {
      console.error('onMentionCreated failed:', error);
    }
  }
);
