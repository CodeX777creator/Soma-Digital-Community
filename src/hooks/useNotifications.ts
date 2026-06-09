"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearAllNotifications as clearAllNotificationsFn,
  deleteNotification as deleteNotificationFn,
  markNotificationRead as markNotificationReadFn,
  NotificationRecord,
  subscribeToNotifications,
} from "@/lib/notifications";

export function useNotifications(userId?: string) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToNotifications(userId, (items) => {
      setNotifications(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId]);

  const unreadCount = notifications.filter((item) => !item.readAt).length;

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!userId) return;
      await markNotificationReadFn(userId, notificationId);
    },
    [userId]
  );

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!userId) return;
      await deleteNotificationFn(userId, notificationId);
    },
    [userId]
  );

  const clearAllNotifications = useCallback(async () => {
    if (!userId) return;
    await clearAllNotificationsFn(userId);
  }, [userId]);

  return {
    notifications,
    loading,
    unreadCount,
    markNotificationRead,
    deleteNotification,
    clearAllNotifications,
  };
}
