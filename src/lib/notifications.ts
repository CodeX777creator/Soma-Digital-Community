import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "like"
  | "comment"
  | "reply"
  | "mission"
  | "mentor"
  | "subscription"
  | "event"
  | "welcome";

export interface NotificationPayload {
  title: string;
  body: string;
  linkUrl?: string;
  type: NotificationType;
  createdBy?: string;
  readAt?: any;
  createdAt?: any;
}

export interface NotificationRecord extends NotificationPayload {
  id: string;
  readAt?: any;
  createdAt: any;
}

const notificationsCollection = (userId: string) => {
  if (!db) throw new Error('Database not initialized');
  return collection(db, "users", userId, "notifications");
};

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  linkUrl = "/dashboard",
  createdBy?: string
) {
  if (!userId) {
    throw new Error("Missing userId for notification");
  }

  await addDoc(notificationsCollection(userId), {
    type,
    title,
    body,
    linkUrl,
    ...(createdBy ? { createdBy } : {}),
    readAt: null,
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  if (!userId) {
    throw new Error("Missing userId for notification");
  }
  if (!db) throw new Error('Database not initialized');

  const notificationRef = doc(db, "users", userId, "notifications", notificationId);
  await updateDoc(notificationRef, {
    readAt: serverTimestamp(),
  });
}

export async function deleteNotification(userId: string, notificationId: string) {
  if (!userId) {
    throw new Error("Missing userId for notification");
  }
  if (!db) throw new Error('Database not initialized');

  const notificationRef = doc(db, "users", userId, "notifications", notificationId);
  await deleteDoc(notificationRef);
}

export async function clearAllNotifications(userId: string) {
  if (!userId) {
    throw new Error("Missing userId for notification");
  }
  if (!db) throw new Error('Database not initialized');

  const firestore = db;
  const collectionRef = notificationsCollection(userId);
  const snapshot = await getDocs(query(collectionRef, orderBy("createdAt", "desc")));
  if (snapshot.empty) {
    return;
  }

  const batch = writeBatch(firestore);
  snapshot.docs.forEach((docSnapshot) => {
    batch.delete(doc(firestore, "users", userId, "notifications", docSnapshot.id));
  });
  await batch.commit();
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: NotificationRecord[]) => void
) {
  const q = query(notificationsCollection(userId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...(docSnapshot.data() as NotificationPayload),
    })) as NotificationRecord[];
    callback(notifications);
  });
}

