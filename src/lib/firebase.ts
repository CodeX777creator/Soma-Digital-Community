import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

/**
 * Required Firebase client configuration environment variables:
 * - NEXT_PUBLIC_FIREBASE_API_KEY
 * - NEXT_PUBLIC_FIREBASE_PROJECT_ID
 * - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 * - NEXT_PUBLIC_FIREBASE_APP_ID
 * 
 * Optional:
 * - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN (auto-derived if not set)
 * - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET (auto-derived if not set)
 */

function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `[Firebase Client] Missing required environment variable: ${name}\n` +
      `Please add it to your .env.local file or deployment environment.\n` +
      `See: https://firebase.google.com/docs/web/setup#config-object`
    );
  }
  return value.trim();
}

function createFirebaseConfig() {
  const apiKey = getRequiredEnvVar('NEXT_PUBLIC_FIREBASE_API_KEY');
  const projectId = getRequiredEnvVar('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  const messagingSenderId = getRequiredEnvVar('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  const appId = getRequiredEnvVar('NEXT_PUBLIC_FIREBASE_APP_ID');

  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || `${projectId}.appspot.com`;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

// Lazy initialization — only runs when first accessed
let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

function getAppInstance(): FirebaseApp {
  if (typeof window === 'undefined') {
    throw new Error('[Firebase Client] Firebase client SDK should not be initialized on the server side. Use Firebase Admin SDK for server operations.');
  }
  
  if (!appInstance) {
    if (getApps().length > 0) {
      appInstance = getApp();
    } else {
      const firebaseConfig = createFirebaseConfig();
      appInstance = initializeApp(firebaseConfig);
    }
  }
  return appInstance;
}

export function getAuthInstance(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getAppInstance());
  }
  return authInstance;
}

export function getDbInstance(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getAppInstance());
  }
  return dbInstance;
}

export function getStorageInstance(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(getAppInstance());
  }
  return storageInstance;
}

// Backward-compatible exports that lazy-initialize on first access
// This prevents build-time crashes while keeping existing imports working
export const app = new Proxy({} as FirebaseApp, {
  get(_, prop) {
    return (getAppInstance() as any)[prop];
  },
});

export const auth = new Proxy({} as Auth, {
  get(_, prop) {
    return (getAuthInstance() as any)[prop];
  },
});

export const db = new Proxy({} as Firestore, {
  get(_, prop) {
    return (getDbInstance() as any)[prop];
  },
});

export const storage = new Proxy({} as FirebaseStorage, {
  get(_, prop) {
    return (getStorageInstance() as any)[prop];
  },
});