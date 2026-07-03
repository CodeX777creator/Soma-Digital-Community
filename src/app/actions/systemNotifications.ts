"use server";

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export interface SystemNotificationInput {
  title: string;
  body: string;
  linkUrl: string;
}

export async function createSystemNotification(data: SystemNotificationInput) {
  // TODO: Add actual admin verification check here
  // if (!isAdminUser()) throw new Error("Unauthorized");

  const db = getFirestore();
  
  const notificationData = {
    title: data.title,
    body: data.body,
    linkUrl: data.linkUrl,
    type: 'system_broadcast',
    priority: 'high',
    createdAt: Timestamp.now(),
  };

  try {
    // Generate a unique ID based on timestamp
    const notifId = `sys_${Timestamp.now().seconds}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Write to the 'systemNotifications' collection
    await db.collection('systemNotifications').doc(notifId).set(notificationData);
    
    return { success: true, message: 'Notification broadcast initiated.' };
  } catch (error: any) {
    console.error('Failed to create system notification:', error);
    return { success: false, error: error.message || 'Failed to send notification' };
  }
}