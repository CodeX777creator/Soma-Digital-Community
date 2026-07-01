import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, FirebaseStorage, connectStorageEmulator } from "firebase/storage";
import { logger } from "./logger";

// Check if we have all required config
const hasConfig = process.env.NEXT_PUBLIC_FIREBASE_API_KEY && 
                  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
                  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
                  process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

// Check if we're in SSG/build phase
const isSSG = typeof window === "undefined";
const isDevelopment = process.env.NODE_ENV === "development";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

if (hasConfig) {
  try {
    // Use the correct storage bucket format
    // Newer Firebase projects use .firebasestorage.app instead of .appspot.com
    const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET 
      || `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`;
    
    app = getApps().length > 0 ? getApp() : initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
      authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
      storageBucket: storageBucket,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    });
    
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    
    // Enable offline persistence for Firestore in browser
    if (typeof window !== 'undefined' && db) {
      import('firebase/firestore').then(({ enableIndexedDbPersistence }) => {
        enableIndexedDbPersistence(db!).catch((err) => {
          if (err.code === 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab at a time
            logger.warn('Firestore persistence failed: Multiple tabs open');
          } else if (err.code === 'unimplemented') {
            // Browser doesn't support persistence
            logger.warn('Firestore persistence not supported in this browser');
          }
        });
      });
    }
    
    // Connect to emulators in development if configured
    if (isDevelopment && typeof window !== 'undefined') {
      const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
      if (useEmulator) {
        connectAuthEmulator(auth, 'http://localhost:9099');
        connectFirestoreEmulator(db!, 'localhost', 8080);
        connectStorageEmulator(storage!, 'localhost', 9199);
        logger.info('Connected to Firebase emulators');
      }
    }
    
    logger.info('[Firebase] Initialized successfully', {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: storageBucket,
      hasAuth: !!auth,
      hasDb: !!db,
      hasStorage: !!storage,
      isClient: typeof window !== 'undefined',
    });
  } catch (e) {
    logger.error('[Firebase] Init error', e instanceof Error ? e : new Error(String(e)));
    
    // In production, this is critical - we should fail fast
    if (!isDevelopment && !isSSG) {
      throw new Error('Firebase initialization failed in production');
    }
  }
} else if (!isSSG) {
  // Client-side with missing config - this is an error
  logger.error('[Firebase] Missing environment variables on client side');
  
  if (!isDevelopment) {
    throw new Error('Firebase configuration missing');
  }
}

// Export with type assertions
export { app, auth, db, storage };

// Helper function to check if Firebase is initialized
export function isFirebaseInitialized(): boolean {
  return !!app && !!auth && !!db;
}

// Helper to safely access Firebase services
export function getFirebaseServices() {
  if (!isFirebaseInitialized()) {
    throw new Error('Firebase not initialized. Check your environment variables.');
  }
  return { app: app!, auth: auth!, db: db!, storage: storage! };
}
