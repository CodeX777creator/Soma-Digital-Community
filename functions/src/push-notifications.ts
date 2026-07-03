import * as admin from 'firebase-admin';

const db = admin.firestore();
const messaging = admin.messaging();

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: {
    url?: string;
    [key: string]: string | undefined;
  };
  icon?: string;
  badge?: string;
  sound?: string;
  options?: {
    highPriority?: boolean;
  };
}

export interface BroadcastOptions {
  excludeUsers?: string[];
  batchSize?: number;
  maxBatchSize?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  rateLimitPerSecond?: number;
}

/**
 * Send a push notification to a specific user
 */
export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<string> {
  if (!userId) {
    throw new Error('Missing userId for push notification');
  }

  // Get user's FCM token
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    console.warn(`User ${userId} not found`);
    throw new Error('User not found');
  }

  const userData = userDoc.data();
  const pushSubscriptions = userData?.pushSubscriptions;

  if (!pushSubscriptions || !pushSubscriptions.web) {
    console.log(`User ${userId} has no push subscription`);
    return 'User has no push subscription';
  }

  const token = pushSubscriptions.web.fcmToken;
  
  if (!token || !pushSubscriptions.web.enabled) {
    console.log(`User ${userId} push notifications are disabled or token missing`);
    return 'Push notifications disabled';
  }

  // Prepare the message
  const message: admin.messaging.Message = {
    token,
    notification: {
      title: payload.title,
      body: payload.body,
      ...(payload.icon && { icon: payload.icon }),
      ...(payload.badge && { badge: payload.badge }),
      sound: payload.sound || 'default',
    } as any,
    data: {
      type: 'push_notification',
      url: payload.data?.url || '/notifications',
      ...payload.data,
    },
    webpush: {
      headers: {
        urgency: 'normal',
        ttl: '604800', // 7 days in seconds as string
      },
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.icon && { icon: payload.icon }),
        ...(payload.badge && { badge: payload.badge }),
        timestamp: new Date().toISOString(),
        tag: `notif-${userId}-${Date.now()}`,
        requireInteraction: false,
      } as any,
    },
  };

  try {
    const response = await messaging.send(message);
    console.log(`Successfully sent push notification to user ${userId}: ${response}`);
    return response;
  } catch (error: any) {
    console.error(`Failed to send push notification to user ${userId}:`, error);
    
    // Handle specific errors
    if (error.code === 'messaging/registration-token-not-registered') {
      // Token is invalid, disable it
      await db.collection('users').doc(userId).update({
        'pushSubscriptions.web.enabled': false,
      });
      console.log(`Disabled push notifications for user ${userId} due to invalid token`);
      return 'Invalid token - notifications disabled';
    }
    throw error;
  }
}

/**
 * Send push notifications to multiple users
 */
export async function sendPushNotificationToMultipleUsers(
  userIds: string[],
  payload: PushNotificationPayload
): Promise<{
  successCount: number;
  failureCount: number;
  results: { userId: string; status: string }[];
}> {
  if (userIds.length === 0) {
    throw new Error('No user IDs provided');
  }

  const messages: admin.messaging.Message[] = [];
  const userIdMap = new Map<string, string>(); // token -> userId
  
  // Collect all valid tokens
  for (const userId of userIds) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) continue;

      const userData = userDoc.data();
      const pushSubscriptions = userData?.pushSubscriptions;

      if (!pushSubscriptions || !pushSubscriptions.web || !pushSubscriptions.web.enabled) {
        continue;
      }

      const token = pushSubscriptions.web.fcmToken;
      if (!token) continue;

      messages.push({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
          ...(payload.icon && { icon: payload.icon }),
          ...(payload.badge && { badge: payload.badge }),
          sound: payload.sound || 'default',
        } as any,
        data: {
          type: 'push_notification',
          url: payload.data?.url || '/notifications',
          ...payload.data,
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            ...(payload.icon && { icon: payload.icon }),
            ...(payload.badge && { badge: payload.badge }),
            timestamp: new Date().toISOString(),
            tag: `notif-bulk-${Date.now()}-${userId}`,
          },
        } as any,
      });
      userIdMap.set(token, userId);
    } catch (error) {
      console.error(`Error fetching user ${userId} for bulk notification:`, error);
    }
  }

  if (messages.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      results: userIds.map(id => ({ userId: id, status: 'No active subscription' })),
    };
  }

  // Send in batches of 500 (Firebase limit)
  const BATCH_SIZE = 500;
  const results: { userId: string; status: string }[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    
    try {
      const response = await messaging.sendEach(batch);
      
      for (let index = 0; index < response.responses.length; index++) {
        const resp = response.responses[index];
        const originalToken = (batch[index] as admin.messaging.TokenMessage).token;
        const userId = userIdMap.get(originalToken) || 'unknown';
        
        if (resp.success) {
          successCount++;
          results.push({ userId, status: 'sent' });
        } else {
          failureCount++;
          const error = resp.error as any;
          
          if (error.code === 'messaging/registration-token-not-registered') {
            // Disable the token
            const userDoc = userId !== 'unknown' ? await db.collection('users').doc(userId).get() : null;
            if (userDoc?.exists) {
              await db.collection('users').doc(userId).update({
                'pushSubscriptions.web.enabled': false,
              });
            }
            results.push({ userId, status: 'invalid_token_disabled' });
          } else {
            results.push({ userId, status: `failed: ${error.message}` });
          }
        }
      }
    } catch (error: any) {
      console.error(`Error sending batch:`, error);
      // Mark all in this batch as failed
      for (const msg of batch) {
        const userId = userIdMap.get((msg as any).token) || 'unknown';
        failureCount++;
        results.push({ userId, status: `batch_failed: ${error.message}` });
      }
    }
  }

  return {
    successCount,
    failureCount,
    results,
  };
}

/**
 * Send both in-app notification and push notification
 */
export async function sendNotificationWithPush(
  userId: string,
  type: string,
  title: string,
  body: string,
  linkUrl = '/dashboard'
): Promise<{ inApp: string; push: string }> {
  // First, create the in-app notification
  const inAppRef = await db.collection('users').doc(userId).collection('notifications').add({
    type,
    title,
    body,
    linkUrl,
    readAt: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Then send push notification
  const pushResult = await sendPushNotification(userId, {
    title,
    body,
    data: {
      url: linkUrl,
    },
  });

  return {
    inApp: inAppRef.id,
    push: pushResult,
  };
}

/**
 * Broadcast to all users or a specific segment with pagination, retry logic, and rate limiting
 */
export async function broadcastToAllUsers(
  payload: PushNotificationPayload,
  excludeUsers: string[] = []
): Promise<{
  totalUsers: number;
  sent: number;
  failed: number;
}> {
  return broadcastToAllUsersWithPagination(payload, { excludeUsers });
}

/**
 * Broadcast with pagination, retry logic, and rate limiting
 */
export async function broadcastToAllUsersWithPagination(
  payload: PushNotificationPayload,
  options: BroadcastOptions = {}
): Promise<{
  totalUsers: number;
  sent: number;
  failed: number;
}> {
  // Default configuration
  const config: BroadcastOptions = {
    excludeUsers: options.excludeUsers || [],
    batchSize: options.batchSize || 1000,
    maxBatchSize: options.maxBatchSize || 5000,
    retryAttempts: options.retryAttempts || 3,
    retryDelayMs: options.retryDelayMs || 1000,
    rateLimitPerSecond: options.rateLimitPerSecond || 10,
  };

  // Rate limiter state
  const minDelayBetweenRequests = 1000 / (config.rateLimitPerSecond || 10);
  let lastRequestTime = 0;

  // Paginated query
  let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let totalUsers = 0;
  let sent = 0;
  let failed = 0;
  const maxTotalUsers = 50000; // Safety limit

  do {
    // Build query
    let query: admin.firestore.Query = db
      .collection('users')
      .where('pushSubscriptions.web.enabled', '==', true);

    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    query = query.limit(Math.min(config.batchSize || 1000, config.maxBatchSize || 5000));

    // Execute query
    const usersSnapshot = await query.get();
    totalUsers += usersSnapshot.size;

    if (usersSnapshot.empty) {
      break;
    }

    lastDoc = usersSnapshot.docs[usersSnapshot.docs.length - 1];

    // Filter excluded users and prepare batch
    const userIds = usersSnapshot.docs
      .map(doc => doc.id)
      .filter(id => !config.excludeUsers!.includes(id));

    if (userIds.length === 0) {
      continue;
    }

    // Process with retry logic and rate limiting
    const results = await sendWithRetryAndRateLimit(
      userIds, 
      payload, 
      config, 
      minDelayBetweenRequests,
      lastRequestTime
    );

    sent += results.successCount;
    failed += results.failureCount;
    lastRequestTime = results.lastRequestTime;

  } while (lastDoc && totalUsers < maxTotalUsers);

  return {
    totalUsers,
    sent,
    failed,
  };
}

/**
 * Send notifications to a batch with retry logic and rate limiting
 */
async function sendWithRetryAndRateLimit(
  userIds: string[],
  payload: PushNotificationPayload,
  config: BroadcastOptions,
  minDelayBetweenRequests: number,
  lastRequestTime: number
): Promise<{
  successCount: number;
  failureCount: number;
  lastRequestTime: number;
}> {
  let successCount = 0;
  let failureCount = 0;

  for (const userId of userIds) {
    let attempt = 0;
    let success = false;

    while (attempt < config.retryAttempts!) {
      // Rate limiting
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      if (timeSinceLastRequest < minDelayBetweenRequests) {
        await new Promise(resolve => setTimeout(resolve, minDelayBetweenRequests - timeSinceLastRequest));
      }

      try {
        await sendPushNotification(userId, payload);
        success = true;
        successCount++;
        lastRequestTime = Date.now();
        break;
      } catch (error: any) {
        attempt++;
        
        if (attempt === config.retryAttempts!) {
          failureCount++;
          lastRequestTime = Date.now();
          console.error(`Failed to send notification to ${userId} after ${attempt} attempts:`, error.message);
        } else {
          // Exponential backoff
          const delay = config.retryDelayMs! * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  return {
    successCount,
    failureCount,
    lastRequestTime,
  };
}
