'use client';

import { useEffect, useState } from 'react';
import { PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js';
import { useSubscription, type SubscriptionPlan } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface PayPalSubscribeButtonsProps {
  planId: SubscriptionPlan;
  planName: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

export function PayPalSubscribeButtons({
  planId,
  planName,
  onSuccess,
  onError,
  onCancel,
}: PayPalSubscribeButtonsProps) {
  const {
    createPayPalSubscription,
    checkSubscriptionStatus,
    paypalLoading: loading,
    paypalError: error,
    setPaypalError: setError,
    refreshUserToken,
  } = useSubscription();
  const { toast } = useToast();
  const [{ isPending }] = usePayPalScriptReducer();
  const [localError, setLocalError] = useState<string | null>(null);

  // Check for successful return from PayPal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionSuccess = params.get('subscription');
    
    if (subscriptionSuccess === 'success') {
      let attempts = 0;
      const confirm = async () => {
        attempts += 1;
        const status = await checkSubscriptionStatus();
        if (status.tier === planId) {
          toast({ title: 'Subscription activated!', description: `You are now on the ${planName} plan.` });
          window.history.replaceState({}, document.title, window.location.pathname);
          await refreshUserToken();
          onSuccess?.();
          return;
        }
        if (attempts < 5) {
          window.setTimeout(() => void confirm(), 2000);
          return;
        }
        setLocalError('PayPal is still confirming your payment. Please refresh shortly.');
      };
      void confirm().catch(() => setLocalError('PayPal is still confirming your payment. Please refresh shortly.'));
    } else if (subscriptionSuccess === 'cancelled') {
      setLocalError('Subscription was cancelled. Please try again.');
    }
  }, [checkSubscriptionStatus, planId, planName, onSuccess, refreshUserToken, toast]);

  const handleCreateSubscription = async () => {
    setLocalError(null);
    setError(null);

    try {
      const result = await createPayPalSubscription(planId);
      if (!result?.approvalUrl) throw new Error('Checkout link unavailable');
    } catch {
      const errorMsg = 'We could not start PayPal checkout. Please try again.';
      setLocalError(errorMsg);
      onError?.(errorMsg);
      toast({ title: 'Checkout failed', description: errorMsg, variant: 'destructive' });
    }
  };

  const displayError = localError || error;

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

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
          `Subscribe to ${planName}`
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        You will be redirected to PayPal to complete your subscription
      </p>
    </div>
  );
}
