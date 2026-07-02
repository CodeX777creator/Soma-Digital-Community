'use client';

import { useState } from 'react';
import { useSubscription, type SubscriptionPlan } from '@/hooks/useSubscription';
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
  const {
    initializePaystackTransaction,
    paystackLoading: loading,
    paystackError: error,
    setPaystackError: setError,
  } = useSubscription();
  const { toast } = useToast();
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setLocalError(null);
    setError(null);

    try {
      await initializePaystackTransaction(planId);
      // Redirect happens in the hook, success callback is handled on return
      onSuccess?.();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to initialize Paystack checkout. Please try again.';
      setLocalError(errorMsg);
      onError?.(errorMsg);
      toast({
        title: 'Checkout failed',
        description: errorMsg,
        variant: 'destructive',
      });
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
        onClick={handleSubscribe}
        disabled={loading}
        className="w-full h-12 bg-accent hover:bg-accent/90 font-bold text-lg rounded-xl"
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
        You will be redirected to Paystack to complete your subscription
      </p>
    </div>
  );
}
