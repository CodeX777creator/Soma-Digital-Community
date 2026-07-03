// Jest setup file
import * as admin from 'firebase-admin';

// Mock admin.initializeApp to prevent actual initialization in tests
jest.mock('firebase-admin', () => {
  const mockApp = {
    name: '[DEFAULT]',
    options: {},
  };

  return {
    initializeApp: jest.fn(() => mockApp),
    app: jest.fn(() => mockApp),
    firestore: jest.fn(() => mockFirestore()),
    messaging: jest.fn(() => mockMessaging()),
    FieldValue: {
      serverTimestamp: jest.fn(() => new Date().toISOString()),
    },
  };
});

function mockFirestore() {
  const collection = jest.fn();
  const doc = jest.fn();
  const where = jest.fn();
  const limit = jest.fn();
  const startAfter = jest.fn();
  const get = jest.fn();
  const update = jest.fn();
  const add = jest.fn();

  const mockCollectionObj = {
    doc,
    where,
    add,
  };

  const mockQueryObj = {
    limit,
    startAfter,
    get,
  };

  collection.mockReturnValue(mockCollectionObj);
  doc.mockReturnValue(mockCollectionObj);
  where.mockReturnValue(mockQueryObj);
  limit.mockReturnValue(mockQueryObj);
  startAfter.mockReturnValue(mockQueryObj);

  return {
    collection,
    doc,
    where,
    limit,
    startAfter,
    get,
    update,
    add,
  };
}

function mockMessaging() {
  const send = jest.fn();
  const sendEach = jest.fn();

  return {
    send,
    sendEach,
  };
}
