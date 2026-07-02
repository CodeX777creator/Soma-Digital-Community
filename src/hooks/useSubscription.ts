"use client";

import { useCallback, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, auth } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { useUserStore, type UserTier } from "@/store/useUserStore";

type PaidSubscriptionPlan = "pro" | "elite";
export type SubscriptionPlan = "explorer" | PaidSubscriptionPlan;

interface CreatePayPalSubscriptionRequest {
  planId: PaidSubscriptionPlan;
  userId: string;
}

interface CreatePayPalSubscriptionResponse {
  approvalUrl: string;
}

interface InitializePaystackTransactionRequest {
  email: string;
  amount: number;
  plan?: string;
  metadata?: { userId: string; planId: string };
}

interface InitializePaystackTransactionResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface CheckSubscriptionStatusRequest {
  userId: string;
}

interface CheckSubscriptionStatusResponse {
  tier: string;
  expiresAt: Date | string | number | null | { seconds: number; nanoseconds?: number };
  status?: string;
  subscriptionId?: string;
  provider?: string;
}

interface CancelPayPalSubscriptionRequest {
  subscriptionId: string;
}

interface CancelPaystackSubscriptionRequest {
  subscriptionId: string;
}

interface CancelSubscriptionResponse {
  success?: boolean;
}

interface SubscriptionStatus {
  tier: string;
  expiresAt: Date | null;
}

interface UseSubscriptionResult {
  createPayPalSubscription: (planId: SubscriptionPlan) => Promise<{ approvalUrl: string }>;
  initializePaystackTransaction: (
    planId: SubscriptionPlan,
    email?: string
  ) => Promise<{ authorizationUrl: string }>;
  checkSubscriptionStatus: () => Promise<SubscriptionStatus>;
  cancelSubscription: (subscriptionId?: string) => Promise<void>;
  loading: boolean;
  paypalLoading: boolean;
  paystackLoading: boolean;
  statusLoading: boolean;
  cancelLoading: boolean;
  error: string | null;
  paypalError: string | null;
  paystackError: string | null;
  setPaypalError: (message: string | null) => void;
  setPaystackError: (message: string | null) => void;
  refreshUserToken: () => Promise<void>;
}

const PAYSTACK_PLAN_AMOUNTS: Record<PaidSubscriptionPlan, number> = {
  pro: Number(process.env.NEXT_PUBLIC_PAYSTACK_AMOUNT_PRO || 970000),
  elite: Number(process.env.NEXT_PUBLIC_PAYSTACK_AMOUNT_ELITE || 2970000),
};

function getFriendlyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return fallback;
}

function normalizeExpiresAt(value: CheckSubscriptionStatusResponse["expiresAt"]): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value.seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTier(tier: string): UserTier {
  if (tier === "pro" || tier === "elite") {
    return tier;
  }

  return "explorer";
}

function assertPaidPlan(planId: SubscriptionPlan): asserts planId is PaidSubscriptionPlan {
  if (planId !== "pro" && planId !== "elite") {
    throw new Error("Please choose Pro or Elite to start a paid subscription.");
  }
}

function redirectTo(url: string): void {
  if (typeof window !== "undefined") {
    window.location.href = url;
  }
}

export function useSubscription(): UseSubscriptionResult {
  const { user } = useAuth();
  const setTier = useUserStore((state) => state.setTier);

  const [paypalLoading, setPaypalLoading] = useState(false);
  const [paystackLoading, setPaystackLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [paystackError, setPaystackError] = useState<string | null>(null);

  const functions = useMemo(() => getFunctions(app), []);
  const loading = paypalLoading || paystackLoading || statusLoading || cancelLoading;

  const requireCurrentUser = useCallback(() => {
    if (!user?.uid) {
      throw new Error("Please sign in to manage your subscription.");
    }

    return user;
  }, [user]);

  const createPayPalSubscription = useCallback(
    async (planId: SubscriptionPlan): Promise<{ approvalUrl: string }> => {
      setPaypalLoading(true);
      setError(null);
      setPaypalError(null);

      try {
        assertPaidPlan(planId);
        const currentUser = requireCurrentUser();
        const createSubscription = httpsCallable<
          CreatePayPalSubscriptionRequest,
          CreatePayPalSubscriptionResponse
        >(functions, "createPayPalSubscription");

        const result = await createSubscription({
          planId,
          userId: currentUser.uid,
        });

        if (!result.data.approvalUrl) {
          throw new Error("PayPal did not return an approval link. Please try again.");
        }

        redirectTo(result.data.approvalUrl);
        return { approvalUrl: result.data.approvalUrl };
      } catch (err: unknown) {
        const message = getFriendlyErrorMessage(
          err,
          "We could not start your PayPal subscription. Please try again."
        );
        setError(message);
        setPaypalError(message);
        throw new Error(message);
      } finally {
        setPaypalLoading(false);
      }
    },
    [functions, requireCurrentUser]
  );

  const initializePaystackTransaction = useCallback(
    async (planId: SubscriptionPlan, email?: string): Promise<{ authorizationUrl: string }> => {
      setPaystackLoading(true);
      setError(null);
      setPaystackError(null);

      try {
        assertPaidPlan(planId);
        const currentUser = requireCurrentUser();
        const checkoutEmail = email || currentUser.email;

        if (!checkoutEmail) {
          throw new Error("Your account needs an email address before starting Paystack checkout.");
        }

        const amount = PAYSTACK_PLAN_AMOUNTS[planId];
        if (!Number.isFinite(amount) || amount <= 0) {
          throw new Error("This Paystack plan is not configured yet. Please try another payment method.");
        }

        const initializeTransaction = httpsCallable<
          InitializePaystackTransactionRequest,
          InitializePaystackTransactionResponse
        >(functions, "initializePaystackTransaction");

        const result = await initializeTransaction({
          email: checkoutEmail,
          amount,
          metadata: {
            userId: currentUser.uid,
            planId,
          },
        });

        if (!result.data.authorization_url) {
          throw new Error("Paystack did not return a checkout link. Please try again.");
        }

        redirectTo(result.data.authorization_url);
        return { authorizationUrl: result.data.authorization_url };
      } catch (err: unknown) {
        const message = getFriendlyErrorMessage(
          err,
          "We could not start your Paystack checkout. Please try again."
        );
        setError(message);
        setPaystackError(message);
        throw new Error(message);
      } finally {
        setPaystackLoading(false);
      }
    },
    [functions, requireCurrentUser]
  );

  const checkSubscriptionStatus = useCallback(async (): Promise<SubscriptionStatus> => {
    setStatusLoading(true);
    setError(null);

    try {
      const currentUser = requireCurrentUser();
      const checkStatus = httpsCallable<CheckSubscriptionStatusRequest, CheckSubscriptionStatusResponse>(
        functions,
        "checkSubscriptionStatus"
      );

      const result = await checkStatus({ userId: currentUser.uid });
      const status = {
        tier: result.data.tier,
        expiresAt: normalizeExpiresAt(result.data.expiresAt),
      };

      setTier(normalizeTier(status.tier));
      return status;
    } catch (err: unknown) {
      const message = getFriendlyErrorMessage(
        err,
        "We could not refresh your subscription status. Please try again."
      );
      setError(message);
      throw new Error(message);
    } finally {
      setStatusLoading(false);
    }
  }, [functions, requireCurrentUser, setTier]);

  const cancelSubscription = useCallback(async (subscriptionId?: string): Promise<void> => {
    setCancelLoading(true);
    setError(null);

    try {
      const currentUser = requireCurrentUser();
      
      // If no subscriptionId provided, check status first to find active subscription
      let targetSubscriptionId = subscriptionId;
      let provider = 'paypal';
      
      if (!targetSubscriptionId) {
        const checkStatus = httpsCallable<CheckSubscriptionStatusRequest, CheckSubscriptionStatusResponse>(
          functions,
          "checkSubscriptionStatus"
        );
        const statusResult = await checkStatus({ userId: currentUser.uid });
        targetSubscriptionId = statusResult.data.subscriptionId;
        provider = statusResult.data.provider || 'paypal';
      }

      if (!targetSubscriptionId) {
        throw new Error("No active subscription found to cancel.");
      }

      // Call provider-specific cancel function
      const cancelFunctionName = provider === 'paystack' 
        ? 'cancelPaystackSubscription' 
        : 'cancelPayPalSubscription';
      
      const cancel = httpsCallable<
        CancelPayPalSubscriptionRequest | CancelPaystackSubscriptionRequest, 
        CancelSubscriptionResponse
      >(functions, cancelFunctionName);

      await cancel({ subscriptionId: targetSubscriptionId });
      await checkSubscriptionStatus();
    } catch (err: unknown) {
      const message = getFriendlyErrorMessage(
        err,
        "We could not cancel your subscription. Please try again."
      );
      setError(message);
      throw new Error(message);
    } finally {
      setCancelLoading(false);
    }
  }, [checkSubscriptionStatus, functions, requireCurrentUser]);

  const refreshUserToken = useCallback(async (): Promise<void> => {
    try {
      await auth?.currentUser?.getIdToken(true);
      await checkSubscriptionStatus();
    } catch (err: unknown) {
      const message = getFriendlyErrorMessage(
        err,
        "We could not refresh your account access. Please try again."
      );
      setError(message);
      throw new Error(message);
    }
  }, [checkSubscriptionStatus]);

  return {
    createPayPalSubscription,
    initializePaystackTransaction,
    checkSubscriptionStatus,
    cancelSubscription,
    loading,
    paypalLoading,
    paystackLoading,
    statusLoading,
    cancelLoading,
    error,
    paypalError,
    paystackError,
    setPaypalError,
    setPaystackError,
    refreshUserToken,
  };
}
