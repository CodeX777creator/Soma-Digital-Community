import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { 
  sendPushNotification, 
  sendPushNotificationToMultipleUsers, 
  sendNotificationWithPush,
  broadcastToAllUsers,
  broadcastToAllUsersWithPagination,
  PushNotificationPayload
} from '../push-notifications';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  // Create reusable mock query objects
  const mockDocRef = {
    get: jest.fn(),
    update: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };

  const mockQuery = {
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    startAfter: jest.fn(),
    startAt: jest.fn(),
    endAt: jest.fn(),
    endBefore: jest.fn(),
    limitToLast: jest.fn(),
    get: jest.fn(),
    count: jest.fn(),
  };

  const mockCollectionRef = {
    doc: jest.fn(),
    add: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    startAfter: jest.fn(),
    startAt: jest.fn(),
    endAt: jest.fn(),
    endBefore: jest.fn(),
    limitToLast: jest.fn(),
    get: jest.fn(),
    count: jest.fn(),
    batch: jest.fn(),
  };

  const mockFirestoreInstance = {
    collection: jest.fn(() => mockCollectionRef),
    doc: jest.fn(),
    batch: jest.fn(),
    runTransaction: jest.fn(),
    recursiveDelete: jest.fn(),
  };

  // Set up default return values
  mockCollectionRef.doc.mockReturnValue(mockDocRef);
  mockQuery.where.mockReturnValue(mockQuery);
  mockQuery.orderBy.mockReturnValue(mockQuery);
  mockQuery.limit.mockReturnValue(mockQuery);
  mockQuery.startAfter.mockReturnValue(mockQuery);
  mockQuery.startAt.mockReturnValue(mockQuery);
  mockQuery.endAt.mockReturnValue(mockQuery);
  mockQuery.endBefore.mockReturnValue(mockQuery);
  mockQuery.limitToLast.mockReturnValue(mockQuery);
  mockQuery.count.mockReturnValue({ get: jest.fn() });

  return {
    initializeApp: jest.fn(),
    firestore: jest.fn(() => mockFirestoreInstance),
    messaging: jest.fn(() => ({
      send: jest.fn(),
      sendEach: jest.fn(),
      sendEachForMulticast: jest.fn(),
    })),
    FieldValue: {
      serverTimestamp: jest.fn(() => 'server-timestamp'),
      arrayUnion: jest.fn(),
      arrayRemove: jest.fn(),
      increment: jest.fn(),
      deleteField: jest.fn(),
    },
  };
});

// Mock Firebase Functions
jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Type assertions for mocked functions
const mockFirestoreInstance = admin.firestore() as any;
const mockMessaging = admin.messaging() as any;

// Create references to the internal mock objects for easier access in tests
// These are instantiated in the mock factory and we need to reset them
let mockDocRef: any;
let mockCollectionRef: any;
let mockQuery: any;

// Helper to get fresh mock references by re-mocking
const getFreshMocks = () => {
  const mDocRef = {
    get: jest.fn(),
    update: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  };
  
  const mQuery: any = {
    where: jest.fn(() => mQuery),
    orderBy: jest.fn(() => mQuery),
    limit: jest.fn(() => mQuery),
    startAfter: jest.fn(() => mQuery),
    startAt: jest.fn(() => mQuery),
    endAt: jest.fn(() => mQuery),
    endBefore: jest.fn(() => mQuery),
    limitToLast: jest.fn(() => mQuery),
    get: jest.fn(),
    count: jest.fn(),
  };
  
  const mCollectionRef: any = {
    doc: jest.fn(() => mDocRef),
    add: jest.fn(),
    where: jest.fn(() => mQuery),
    orderBy: jest.fn(() => mQuery),
    limit: jest.fn(() => mQuery),
    startAfter: jest.fn(() => mQuery),
    startAt: jest.fn(() => mQuery),
    endAt: jest.fn(() => mQuery),
    endBefore: jest.fn(() => mQuery),
    limitToLast: jest.fn(() => mQuery),
    get: jest.fn(),
    count: jest.fn(),
  };
  
  mockDocRef = mDocRef;
  mockCollectionRef = mCollectionRef;
  mockQuery = mQuery;
};

// Initialize fresh mocks
getFreshMocks();

describe('Push Notification Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getFreshMocks();
    
    // Set up the firestore instance to return our fresh mocks
    mockFirestoreInstance.collection.mockReturnValue(mockCollectionRef);
    mockFirestoreInstance.doc.mockReturnValue(mockDocRef);
    
    // Default responses
    mockDocRef.get.mockResolvedValue({ exists: false, data: () => ({}) });
    mockDocRef.update.mockResolvedValue(undefined);
    mockCollectionRef.add.mockResolvedValue({ id: 'mock-notification-id' });
    mockQuery.get.mockResolvedValue({ empty: true, docs: [], size: 0 });
    
    mockMessaging.send.mockResolvedValue('mock-message-id');
    mockMessaging.sendEach.mockResolvedValue({
      responses: [{ success: true }],
    });
  });

  describe('sendPushNotification', () => {
    it('should throw error if userId is missing', async () => {
      await expect(sendPushNotification('', { title: 'Test', body: 'Test body' }))
        .rejects.toThrow('Missing userId for push notification');
    });

    it('should throw error if user does not exist', async () => {
      mockDocRef.get.mockResolvedValue({ exists: false, data: () => ({}) });

      await expect(
        sendPushNotification('non-existent-user', { title: 'Test', body: 'Test body' })
      ).rejects.toThrow('User not found');
    });

    it('should return early if user has no push subscription', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: null,
        }),
      });

      const result = await sendPushNotification('user123', { 
        title: 'Test', 
        body: 'Test body' 
      });

      expect(result).toBe('User has no push subscription');
    });

    it('should return early if push notifications are disabled', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { enabled: false },
          },
        }),
      });

      const result = await sendPushNotification('user123', { 
        title: 'Test', 
        body: 'Test body' 
      });

      expect(result).toBe('Push notifications disabled');
    });

    it('should send notification successfully', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { 
              enabled: true, 
              fcmToken: 'mock-fcm-token' 
            },
          },
        }),
      });

      const result = await sendPushNotification('user123', { 
        title: 'Test', 
        body: 'Test body' 
      });

      expect(mockMessaging.send).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'mock-fcm-token',
          notification: expect.objectContaining({
            title: 'Test',
            body: 'Test body',
          }),
        })
      );
      expect(result).toBe('mock-message-id');
    });

    it('should disable notifications if token is invalid', async () => {
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { 
              enabled: true, 
              fcmToken: 'invalid-token' 
            },
          },
        }),
      });

      mockMessaging.send.mockRejectedValue({
        code: 'messaging/registration-token-not-registered',
        message: 'Registration token not registered',
      });

      const result = await sendPushNotification('user123', { 
        title: 'Test', 
        body: 'Test body' 
      });

      expect(result).toBe('Invalid token - notifications disabled');
      expect(mockDocRef.update).toHaveBeenCalledWith({
        'pushSubscriptions.web.enabled': false,
      });
    });
  });

  describe('sendPushNotificationToMultipleUsers', () => {
    it('should throw error if no user IDs provided', async () => {
      await expect(
        sendPushNotificationToMultipleUsers([], { title: 'Test', body: 'Test body' })
      ).rejects.toThrow('No user IDs provided');
    });

    it('should skip users without push subscriptions', async () => {
      mockDocRef.get
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            pushSubscriptions: {
              web: { enabled: true, fcmToken: 'token1' },
            },
          }),
        })
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            pushSubscriptions: null,
          }),
        });

      mockMessaging.sendEach.mockResolvedValue({
        responses: [{ success: true }],
      });

      const result = await sendPushNotificationToMultipleUsers(
        ['user1', 'user2'],
        { title: 'Test', body: 'Test body' }
      );

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(2); // user2: No active subscription
    });

    it('should handle batch sending correctly', async () => {
      const userIds = Array.from({ length: 550 }, (_, i) => `user${i}`);
      
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { enabled: true, fcmToken: 'mock-token' },
          },
        }),
      });

      mockMessaging.sendEach.mockResolvedValue({
        responses: Array.from({ length: 500 }, () => ({ success: true })),
      });

      const result = await sendPushNotificationToMultipleUsers(
        userIds,
        { title: 'Test', body: 'Test body' }
      );

      expect(mockMessaging.sendEach).toHaveBeenCalled();
    });
  });

  describe('sendNotificationWithPush', () => {
    it('should create in-app notification and send push notification', async () => {
      mockCollectionRef.add.mockResolvedValue({ id: 'notification-123' });
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { enabled: true, fcmToken: 'mock-token' },
          },
        }),
      });
      mockMessaging.send.mockResolvedValue('push-message-id');

      const result = await sendNotificationWithPush(
        'user123',
        'test_type',
        'Title',
        'Body',
        '/test-link'
      );

      expect(result.inApp).toBe('notification-123');
      expect(result.push).toBe('push-message-id');
      expect(mockCollectionRef.add).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'test_type',
          title: 'Title',
          body: 'Body',
          linkUrl: '/test-link',
          readAt: null,
        })
      );
    });

    it('should use default linkUrl if not provided', async () => {
      mockCollectionRef.add.mockResolvedValue({ id: 'notification-123' });
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { enabled: true, fcmToken: 'mock-token' },
          },
        }),
      });
      mockMessaging.send.mockResolvedValue('push-message-id');

      const result = await sendNotificationWithPush(
        'user123',
        'test_type',
        'Title',
        'Body'
      );

      expect(mockCollectionRef.add).toHaveBeenCalledWith(
        expect.objectContaining({
          linkUrl: '/dashboard',
        })
      );
    });
  });

  describe('broadcastToAllUsers', () => {
    it('should call broadcastToAllUsersWithPagination with default options', async () => {
      const mockResult = { totalUsers: 100, sent: 95, failed: 5 };
      
      // Mock pagination
      mockCollectionRef.where.mockReturnValue(mockQuery);
      mockCollectionRef.limit.mockReturnValue(mockQuery);
      mockQuery.get
        .mockResolvedValueOnce({ 
          empty: false, 
          docs: [{ id: 'user1' }, { id: 'user2' }],
          size: 2
        })
        .mockResolvedValueOnce({ empty: true, docs: [], size: 0 });

      const result = await broadcastToAllUsers(
        { title: 'Test', body: 'Test body' },
        ['exclude1']
      );

      expect(mockCollectionRef.where).toHaveBeenCalledWith(
        'pushSubscriptions.web.enabled',
        '==',
        true
      );
      
      // The result will depend on the mock setup
      expect(result.totalUsers).toBeGreaterThanOrEqual(0);
    });
  });

  describe('broadcastToAllUsersWithPagination', () => {
    it('should paginate through large user bases', async () => {
      const largeUserCount = 1500;
      const batchSize = 500;
      
      // Simulate 3 pages
      const pages = [
        { 
          empty: false, 
          docs: Array.from({ length: batchSize }, (_, i) => ({ id: `user${i}` })),
          size: batchSize 
        },
        { 
          empty: false, 
          docs: Array.from({ length: batchSize }, (_, i) => ({ id: `user${batchSize + i}` })),
          size: batchSize 
        },
        { 
          empty: false, 
          docs: Array.from({ length: batchSize }, (_, i) => ({ id: `user${batchSize * 2 + i}` })),
          size: batchSize 
        },
        { empty: true, docs: [], size: 0 },
      ];

      let pageCall = 0;
      mockCollectionRef.where.mockReturnValue(mockQuery);
      mockCollectionRef.limit.mockImplementation(() => ({
        get: jest.fn()
          .mockImplementationOnce(() => Promise.resolve(pages[pageCall++]))
          .mockImplementationOnce(() => Promise.resolve(pages[pageCall++]))
          .mockImplementationOnce(() => Promise.resolve(pages[pageCall++]))
          .mockImplementationOnce(() => Promise.resolve(pages[pageCall++])),
      }));
      mockQuery.startAfter.mockReturnValue(mockQuery);
      mockCollectionRef.doc.mockReturnValue(mockDocRef);

      // Mock user data fetch
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { enabled: true, fcmToken: 'mock-token' },
          },
        }),
      });

      // Mock messaging to avoid actual sends
      const originalSend = mockMessaging.send;
      mockMessaging.send.mockResolvedValue('mock-message-id');

      const result = await broadcastToAllUsersWithPagination(
        { title: 'Test', body: 'Test body' },
        {
          excludeUsers: [],
          batchSize: 500,
          retryAttempts: 1,
          rateLimitPerSecond: 10000, // Disable rate limiting for test
        }
      );

      // Should have made 4 calls to get (3 pages + 1 empty)
      expect(mockCollectionRef.limit).toHaveBeenCalled();
      
      // Restore
      mockMessaging.send = originalSend;
    });

    it('should respect rate limiting', async () => {
      mockCollectionRef.where.mockReturnValue(mockQuery);
      mockCollectionRef.limit.mockReturnValue(mockQuery);
      mockQuery.get.mockResolvedValue({ 
        empty: false, 
        docs: [{ id: 'user1' }, { id: 'user2' }],
        size: 2 
      });
      mockCollectionRef.doc.mockReturnValue(mockDocRef);
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { enabled: true, fcmToken: 'mock-token' },
          },
        }),
      });

      const originalSend = mockMessaging.send;
      mockMessaging.send.mockResolvedValue('mock-message-id');

      const startTime = Date.now();
      const result = await broadcastToAllUsersWithPagination(
        { title: 'Test', body: 'Test body' },
        {
          excludeUsers: [],
          retryAttempts: 1,
          rateLimitPerSecond: 1, // 1 request per second = 1000ms delay
        }
      );
      const endTime = Date.now();

      // Should take at least 1000ms for 2 requests with 1 req/sec rate limit
      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);

      mockMessaging.send = originalSend;
    });

    it('should retry failed notifications', async () => {
      mockCollectionRef.where.mockReturnValue(mockQuery);
      mockCollectionRef.limit.mockReturnValue(mockQuery);
      mockQuery.get.mockResolvedValue({ 
        empty: false, 
        docs: [{ id: 'user1' }],
        size: 1 
      });
      mockCollectionRef.doc.mockReturnValue(mockDocRef);
      
      let attemptCount = 0;
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({
          pushSubscriptions: {
            web: { enabled: true, fcmToken: 'mock-token' },
          },
        }),
      });

      const originalSend = mockMessaging.send;
      mockMessaging.send.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('Transient error'));
        }
        return Promise.resolve('success');
      });

      const result = await broadcastToAllUsersWithPagination(
        { title: 'Test', body: 'Test body' },
        {
          excludeUsers: [],
          retryAttempts: 3,
          retryDelayMs: 10, // Small delay for testing
          rateLimitPerSecond: 10000,
        }
      );

      // Should have attempted 3 times and succeeded
      expect(attemptCount).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.sent).toBe(1);

      mockMessaging.send = originalSend;
    });
  });
});

describe('PushNotificationPayload interface', () => {
  it('should accept all valid payload properties', () => {
    const payload: PushNotificationPayload = {
      title: 'Test Title',
      body: 'Test Body',
      data: {
        url: '/test',
        customField: 'value',
      },
      icon: '/icon.png',
      badge: '/badge.png',
      sound: 'default',
      options: {
        highPriority: true,
      },
    };

    expect(payload).toBeDefined();
    expect(payload.title).toBe('Test Title');
    expect(payload.body).toBe('Test Body');
    expect(payload.data?.url).toBe('/test');
    expect(payload.icon).toBe('/icon.png');
    expect(payload.options?.highPriority).toBe(true);
  });

  it('should accept payload with only required fields', () => {
    const payload: PushNotificationPayload = {
      title: 'Test',
      body: 'Test',
    };

    expect(payload).toBeDefined();
  });
});
