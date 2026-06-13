import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// Check if we have all required config
const hasConfig = process.env.NEXT_PUBLIC_FIREBASE_API_KEY && 
                  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
                  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
                  process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

// Check if we're in SSG/build phase
const isSSG = typeof window === "undefined";

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
    
    console.log('[Firebase] Initialized successfully:', {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: storageBucket,
      hasAuth: !!auth,
      hasDb: !!db,
      hasStorage: !!storage,
      isClient: typeof window !== 'undefined',
    });
  } catch (e) {
    console.error("[Firebase] Init error:", e);
  }
} else if (!isSSG) {
  // Client-side with missing config - this is an error
  console.error("[Firebase] Missing environment variables on client side");
}

// Export with type assertions
export { app, auth, db, storage };