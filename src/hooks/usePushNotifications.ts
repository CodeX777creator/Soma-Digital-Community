"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  isPushSupported,
  requestNotificationPermission,
  getFCMToken,
  saveFCMTokenToFirestore,
  removeFCMTokenFromFirestore,
  getFCMSubscriptionStatus,
  onForegroundMessage,
} from '@/lib/fcm';
import { useToast } from '@/hooks/use-toast';
import { MessagePayload } from 'firebase/messaging';

interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'default',
    isSubscribed: false,
    token: null,
    isLoading: true,
    error: null,
  });

  const { toast } = useToast();

  // Initialize on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const supported = await isPushSupported();
        if (!mounted) return;

        setState((prev) => ({ ...prev, isSupported: supported }));

        if (!supported) {
          setState((prev) => ({ ...prev, isLoading: false }));
          return;
        }

        const permission = typeof window !== 'undefined' && 'Notification' in window 
          ? Notification.permission 
          : 'default';
        if (!mounted) return;

        setState((prev) => ({ ...prev, permission }));

        const subscription = await getFCMSubscriptionStatus();
        if (!mounted) return;

        setState((prev) => ({
          ...prev,
          isSubscribed: !!subscription?.enabled,
          token: subscription?.fcmToken || null,
          isLoading: false,
        }));
      } catch (error) {
        console.error('Error initializing push notifications:', error);
        if (mounted) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize',
          }));
        }
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (state.isSupported && state.permission === 'granted') {
      const unsubscribe = onForegroundMessage((payload: MessagePayload) => {
        toast({
          title: payload.notification?.title || 'Notification',
          description: payload.notification?.body || '',
        });
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
    return undefined;
  }, [state.isSupported, state.permission, toast]);

  const requestPermission = useCallback(async () => {
    try {
      const granted = await requestNotificationPermission();
      setState((prev) => ({ ...prev, permission: granted ? 'granted' : 'denied' }));

      if (granted) {
        toast({ title: 'Permission granted', description: 'Notifications enabled' });
      } else {
        toast({ title: 'Permission denied', description: 'Please enable notifications in your browser settings' });
      }
      return granted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to request permission';
      setState((prev) => ({ ...prev, error: errorMessage }));
      toast({ title: 'Error', description: errorMessage });
      return false;
    }
  }, [toast]);

  const subscribe = useCallback(async () => {
    if (state.permission !== 'granted') {
      const granted = await requestPermission();
      if (!granted) return null;
    }

    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const token = await getFCMToken();
      
      if (token) {
        await saveFCMTokenToFirestore(token);
        setState((prev) => ({
          ...prev,
          isSubscribed: true,
          token,
          isLoading: false,
        }));
        toast({ title: 'Success', description: 'Push notifications enabled!' });
        return token;
      } else {
        throw new Error('Failed to generate push token');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to subscribe';
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
      toast({ title: 'Error', description: errorMessage });
      return null;
    }
  }, [state.permission, requestPermission, toast]);

  const unsubscribe = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      await removeFCMTokenFromFirestore();
      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        token: null,
        isLoading: false,
      }));
      toast({ title: 'Success', description: 'Push notifications disabled' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unsubscribe';
      setState((prev) => ({ ...prev, isLoading: false, error: errorMessage }));
      toast({ title: 'Error', description: errorMessage });
    }
  }, [toast]);

  return {
    ...state,
    requestPermission,
    subscribe,
    unsubscribe,
    enable: subscribe,
    disable: unsubscribe,
  };
}