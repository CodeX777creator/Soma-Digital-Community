'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { auth } from '@/lib/firebase';
import { httpsCallable, getFunctions } from 'firebase/functions';

export type SubscriptionPlan = 'explorer' | 'pro' | 'elite';

export interface PayPalSubscriptionData {
  subscriptionId: string;
  userId: string;
  planId: SubscriptionPlan;
  status: 'approval_pending' | 'created' | 'active' | 'cancelled' | 'expired' | 'user_cancelled';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  createdAt: Date;
  cancelledAt?: Date;
}

export function usePayPalSubscription() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const functions = getFunctions();
  const createSubscription = httpsCallable(
    functions,
    'createPayPalSubscription'
  ) as any;
  const cancelSubscription = httpsCallable(functions, 'cancelPayPalSubscription') as any;

  const initializeSubscription = useCallback(
    async (planId: SubscriptionPlan) => {
      if (!user?.uid) {
        setError('User not authenticated');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await createSubscription({
          planId,
          userId: user.uid,
        });

        return {
          subscriptionId: result.data.subscriptionId,
          approvalUrl: result.data.approvalUrl,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create subscription';
        setError(message);
        console.error('initializeSubscription error:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user?.uid, createSubscription]
  );

  const cancel = useCallback(
    async (subscriptionId: string) => {
      setLoading(true);
      setError(null);

      try {
        await cancelSubscription({ subscriptionId });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel subscription';
        setError(message);
        console.error('cancel error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [cancelSubscription]
  );

  const refreshUserToken = useCallback(async () => {
    try {
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
        console.log('User token refreshed');
      }
    } catch (err) {
      console.error('Failed to refresh user token:', err);
    }
  }, []);

  return {
    initializeSubscription,
    cancel,
    refreshUserToken,
    loading,
    error,
    setError,
  };
}
