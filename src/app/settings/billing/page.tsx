"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PromoRedeemCard } from "@/components/promos/PromoRedeemCard";
import { useAuth } from "@/providers/AuthProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { useUserStore, type UserTier } from "@/store/useUserStore";
import { useToast } from "@/hooks/use-toast";
import { normalizeDate } from "@/lib/date-utils";
import {
  CreditCard,
  Shield,
  Zap,
  Crown,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
} from "lucide-react";

export default function BillingSettingsPage() {
  const { userData } = useAuth();
  const { cancelLoading, cancelSubscription } = useSubscription();
  const tier = useUserStore((state) => state.tier);
  const { toast } = useToast();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Derive subscription info from userData
  const currentPlan = tier;
  const isActive = currentPlan !== "explorer";
  
  // Get subscription period end from userData
  const currentPeriodEnd = useMemo(() => {
    if (!userData?.subscription) return null;
    const end = userData.subscription.expiresAt;
    if (!end) return null;
    return normalizeDate(end)?.toISOString() || null;
  }, [userData]);

  const handleCancel = async () => {
    try {
      await cancelSubscription();
      setShowCancelConfirm(false);
      toast({
        title: "Subscription cancelled",
        description: "Your subscription will remain active until the end of the billing period.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getPlanIcon = (plan: string) => {
    switch (plan) {
      case "elite":
        return <Crown className="w-6 h-6 text-yellow-400" />;
      case "pro":
        return <Zap className="w-6 h-6 text-cyan-400" />;
      default:
        return <Shield className="w-6 h-6 text-muted-foreground" />;
    }
  };

  const getPlanName = (plan: string) => {
    switch (plan) {
      case "elite":
        return "Elite Plan";
      case "pro":
        return "Pro Plan";
      default:
        return "Explorer (Free)";
    }
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="max-w-4xl mx-auto flex flex-col gap-8 animate-in fade-in duration-700 py-8">
          {/* Header */}
          <div className="flex flex-col gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors w-fit"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
            <div>
              <h1 className="text-4xl font-bold font-headline">Billing & Subscription</h1>
              <p className="text-muted-foreground mt-2">
                Manage your subscription, payment methods, and billing history.
              </p>
            </div>
          </div>

          {/* Current Plan */}
          <GlassCard className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                {getPlanIcon(currentPlan || "explorer")}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-2xl font-bold">{getPlanName(currentPlan || "explorer")}</h2>
                  <Badge
                    className={`text-[10px] uppercase ${
                      isActive
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-2">
                  {currentPlan === "explorer"
                    ? "You're on the free Explorer plan. Upgrade to unlock premium features."
                    : `You have access to all ${currentPlan} features and benefits.`}
                </p>

                {currentPeriodEnd && currentPlan !== "explorer" && (
                  <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Current period ends: {formatDate(currentPeriodEnd)}</span>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 mt-6">
                  {currentPlan === "explorer" ? (
                    <Link href="/dashboard?upgrade=pro">
                      <Button className="bg-primary hover:bg-primary/90">
                        <Zap className="w-4 h-4 mr-2" /> Upgrade to Pro
                      </Button>
                    </Link>
                  ) : (
                    <>
                      {!showCancelConfirm ? (
                        <Button
                          variant="outline"
                          onClick={() => setShowCancelConfirm(true)}
                          disabled={cancelLoading}
                        >
                          Cancel Subscription
                        </Button>
                      ) : (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                          <AlertCircle className="w-5 h-5 text-red-400" />
                          <div>
                            <p className="text-sm font-medium text-red-300">
                              Are you sure? You'll lose access at the end of this period.
                            </p>
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleCancel}
                                disabled={cancelLoading}
                              >
                                {cancelLoading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  "Yes, Cancel"
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setShowCancelConfirm(false)}
                              >
                                Keep Subscription
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {currentPlan !== "elite" && (
                        <Link href="/dashboard?upgrade=elite">
                          <Button variant="outline">
                            <Crown className="w-4 h-4 mr-2" /> Upgrade to Elite
                          </Button>
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>

          <PromoRedeemCard
            source="billing"
            surface="subscription_checkout"
            title="Have a plan or founder code?"
            description="Unlock eligible subscription benefits, founder access, Creator Credits, or Academy bonuses before checkout."
          />

          {/* Payment Method */}
          {currentPlan !== "explorer" && (
            <GlassCard className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                  <CreditCard className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">Payment Method</h2>
                  <p className="text-muted-foreground mt-1">
                    Your subscription is managed through {userData?.subscription?.provider === "paystack" ? "Paystack" : "PayPal"}.
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span>Payment method active and in good standing</span>
                  </div>
                </div>
              </div>
            </GlassCard>
          )}

          {/* Billing History */}
          <GlassCard className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">Billing History</h2>
                <p className="text-muted-foreground mt-1">
                  View your past invoices and payment history.
                </p>
                <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                  <p className="text-sm text-muted-foreground">
                    Billing history will be available here soon.
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* FAQ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlassCard className="p-5">
              <h3 className="font-bold mb-2">Can I change my plan?</h3>
              <p className="text-sm text-muted-foreground">
                Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.
              </p>
            </GlassCard>
            <GlassCard className="p-5">
              <h3 className="font-bold mb-2">What happens if I cancel?</h3>
              <p className="text-sm text-muted-foreground">
                You'll keep access until the end of your current billing period, then revert to the free Explorer plan.
              </p>
            </GlassCard>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
