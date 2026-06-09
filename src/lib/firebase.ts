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

function validateFirebaseConfig(): {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
} {
  // Required variables that must be explicitly set
  const apiKey = getRequiredEnvVar('NEXT_PUBLIC_FIREBASE_API_KEY');
  const projectId = getRequiredEnvVar('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  const messagingSenderId = getRequiredEnvVar('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  const appId = getRequiredEnvVar('NEXT_PUBLIC_FIREBASE_APP_ID');

  // Derive optional values from projectId if not explicitly set
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

// Initialize Firebase Client SDK with strict validation
let app: FirebaseApp;

try {
  if (getApps().length > 0) {
    app = getApp();
  } else {
    const firebaseConfig = validateFirebaseConfig();
    app = initializeApp(firebaseConfig);
  }
} catch (error: any) {
  // Re-throw with clear context for debugging
  throw new Error(`[Firebase Client] Initialization failed: ${error.message}`);
}

// Initialize services
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

try {
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} catch (error: any) {
  throw new Error(`[Firebase Client] Service initialization failed: ${error.message}`);
}

export { app, auth, db, storage };
