'use client';

import { useState, useEffect } from 'react';
import { useSubscription, type SubscriptionPlan } from '@/hooks/useSubscription';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface PaystackSubscribeButtonsProps {
  planId: SubscriptionPlan;
  planName: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export function PaystackSubscribeButtons({
  planId,
  planName,
  onSuccess,
  onError,
  onCancel,
}: PaystackSubscribeButtonsProps) {
  const { initializePaystackTransaction, refreshUserToken, paystackLoading: loading, paystackError: error, setPaystackError: setError } =
    useSubscription();
  const { user } = useAuth();
  const { toast } = useToast();
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionSuccess = params.get('subscription');

    if (subscriptionSuccess === 'success') {
      toast({
        title: 'Subscription activated!',
        description: `You are now on the ${planName} plan.`,
      });
      window.history.replaceState({}, document.title, window.location.pathname);
      refreshUserToken().then(() => {
        onSuccess?.();
      });
    } else if (subscriptionSuccess === 'cancelled') {
      setLocalError('Subscription was cancelled. Please try again.');
      onCancel?.();
    }
  }, [planName, onSuccess, onCancel, refreshUserToken, toast]);

  const handleCreateSubscription = async () => {
    setLocalError(null);
    setError(null);

    const result = await initializePaystackTransaction(planId, user?.email || undefined);
    if (!result?.authorizationUrl) {
      const errorMsg = error || 'Failed to create subscription. Please try again.';
      setLocalError(errorMsg);
      onError?.(errorMsg);
    }
  };

  const displayError = localError || error;

  return (
    <div className="flex flex-col gap-4">
      {displayError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400">{displayError}</p>
        </div>
      )}

      <Button
        onClick={handleCreateSubscription}
        disabled={loading}
        className="w-full h-12 bg-primary hover:bg-primary/90 font-bold text-lg rounded-xl blue-glow"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          `Subscribe with Paystack`
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        You will be redirected to Paystack to complete your subscription.
      </p>
    </div>
  );
}
