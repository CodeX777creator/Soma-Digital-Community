"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getMessaging, 
  Messaging, 
  getToken, 
  onMessage,
  deleteToken,
  isSupported,
  MessagePayload
} from "firebase/messaging";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "./firebase";
import { logger } from "./logger";

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY as string;

if (!VAPID_KEY) {
  logger.warn("FCM VAPID key not configured. Push notifications will not work.");
}

let messaging: Messaging | null = null;

// Initialize Firebase Messaging
export function getMessagingInstance(): Messaging | null {
  if (typeof window === "undefined") return null;
  
  if (messaging) return messaging;

  if (getApps().length === 0) {
    const app = initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebasestorage.app`,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
    messaging = getMessaging(app);
  } else {
    const app = getApp();
    messaging = getMessaging(app);
  }
  return messaging;
}

// Request permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    logger.warn("Notifications not supported in this browser");
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

// Get FCM token
export async function getFCMToken(): Promise<string | null> {
  try {
    if (!VAPID_KEY) {
      logger.error("VAPID key not configured");
      return null;
    }

    const messagingInstance = getMessagingInstance();
    if (!messagingInstance) {
      logger.error("Messaging instance not available");
      return null;
    }

    if (Notification.permission !== "granted") {
      const permissionGranted = await requestNotificationPermission();
      if (!permissionGranted) {
        logger.warn("Notification permission denied");
        return null;
      }
    }

    let registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    
    const token = await getToken(messagingInstance, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      logger.info("[FCM] Token retrieved successfully", { tokenLength: token.length });
      return token;
    }
    return null;
  } catch (error) {
    logger.error("[FCM] Error getting token", error instanceof Error ? error : undefined);
    return null;
  }
}

// Save token to Firestore
export async function saveFCMTokenToFirestore(token: string): Promise<void> {
  const user = auth?.currentUser;
  if (!user || !db) {
    logger.warn("No user logged in or Firestore not available");
    return;
  }

  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);

  const subscription = {
    fcmToken: token,
    lastUpdated: new Date(),
    platform: 'web' as const,
    enabled: true,
  };

  if (userDoc.exists() && userDoc.data()?.pushSubscriptions) {
    const existing = userDoc.data().pushSubscriptions as Record<string, any>;
    existing['web'] = subscription;
    await updateDoc(userRef, { pushSubscriptions: existing });
  } else {
    await setDoc(userRef, {
      pushSubscriptions: { web: subscription },
    }, { merge: true });
  }
  logger.info("[FCM] Token saved to Firestore");
}

// Remove token from Firestore
export async function removeFCMTokenFromFirestore(): Promise<void> {
  const user = auth?.currentUser;
  if (!user || !db) return;

  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists() && userDoc.data()?.pushSubscriptions) {
    const existing = userDoc.data().pushSubscriptions as Record<string, any>;
    delete existing['web'];
    await updateDoc(userRef, { pushSubscriptions: existing });
    logger.info("[FCM] Token removed from Firestore");
  }
}

// Get current subscription status
export async function getFCMSubscriptionStatus(): Promise<any | null> {
  const user = auth?.currentUser;
  if (!user || !db) return null;

  const userRef = doc(db, 'users', user.uid);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists() && userDoc.data()?.pushSubscriptions) {
    return userDoc.data().pushSubscriptions['web'] || null;
  }
  return null;
}

// Listen for foreground messages
export function onForegroundMessage(callback: (payload: MessagePayload) => void): (() => void) | null {
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    logger.warn("[FCM] Cannot listen for messages - no messaging instance");
    return null;
  }

  return onMessage(messagingInstance, (payload) => {
    logger.info("[FCM] Foreground message received", { ...payload });
    callback(payload);
  });
}

// Check if push is supported
export async function isPushSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const supported = await isSupported();
  return supported && 'Notification' in window && 'serviceWorker' in navigator;
}

export function getVapidKey(): string | undefined {
  return VAPID_KEY;
}
