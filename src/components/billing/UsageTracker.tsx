"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Download, Phone, Zap, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/providers/AuthProvider";
import { getUserCredits, UserCredits, FREE_QUOTAS } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { CreditPurchase } from "./CreditPurchase";
import Link from "next/link";
import { getUpgradeLabel, getUpgradeTarget } from "@/lib/plan-ui";

export function UsageTracker() {
  const { user, userData } = useAuth();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreditPurchase, setShowCreditPurchase] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    
    loadCredits();
    
    // Refresh every minute
    const interval = setInterval(loadCredits, 60000);
    return () => clearInterval(interval);
  }, [user?.uid]);

  const loadCredits = async () => {
    if (!user?.uid) return;
    try {
      const data = await getUserCredits(user.uid);
      setCredits(data);
    } catch (error) {
      console.error("Failed to load credits:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-4 rounded-2xl animate-pulse">
        <div className="h-4 bg-white/10 rounded w-1/3 mb-3" />
        <div className="h-2 bg-white/10 rounded w-full" />
      </GlassCard>
    );
  }

  if (!credits) return null;

  const tier = credits.tier;
  const isElite = tier === 'elite';
  const upgradeTarget = getUpgradeTarget(tier);
  const aiProgress = isElite ? 100 : (credits.usedThisMonth / credits.monthlyQuota) * 100;
  const isLowCredits = !isElite && credits.remainingFree < 3;

  return (
    <>
      <GlassCard className="p-4 rounded-2xl border-l-4 border-l-primary">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Premium Features</h3>
              <p className="text-[10px] text-muted-foreground capitalize">
                {tier} Plan
              </p>
            </div>
          </div>
          
          {upgradeTarget && (
            <Button size="sm" asChild className="h-7 text-[10px] bg-cyan-500 hover:bg-cyan-600 text-black">
              <Link href={`/dashboard?upgrade=${upgradeTarget}`}>{getUpgradeLabel(tier)}</Link>
            </Button>
          )}
        </div>

        {/* Community Notice */}
        <div className="bg-white/[0.03] rounded-lg p-3 mb-4">
          <p className="text-[10px] text-green-400 flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3" />
            Community access is FREE forever
          </p>
        </div>

        {/* AI Chats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-white">AI Mentor Chats</span>
            </div>
            <span className={cn(
              "text-xs font-bold",
              isLowCredits ? "text-red-400" : "text-white"
            )}>
              {isElite ? "∞" : `${credits.remainingFree}/${credits.monthlyQuota}`}
            </span>
          </div>
          
          {!isElite && (
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  aiProgress > 80 ? "bg-red-500" : "bg-primary"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${aiProgress}%` }}
              />
            </div>
          )}

          {/* Credits Info */}
          {credits.purchasedCredits > 0 && (
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Purchased Credits</span>
              <span className="text-primary font-bold">{credits.purchasedCredits} remaining</span>
            </div>
          )}

          {/* Low Credit Warning */}
          {isLowCredits && (
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCreditPurchase(true)}
                className="flex-1 h-8 text-[10px] border-primary/50"
              >
                <Plus className="w-3 h-3 mr-1" />
                Buy Credits
              </Button>
              {upgradeTarget ? (
                <Button
                  size="sm"
                  asChild
                  className="flex-1 h-8 text-[10px] bg-cyan-500 hover:bg-cyan-600 text-black"
                >
                  <Link href={`/dashboard?upgrade=${upgradeTarget}`}>{getUpgradeLabel(tier)}</Link>
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5">
          <div className="text-center">
            <Download className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">Resources</p>
            <p className="text-xs font-bold">
              {tier === 'elite' ? 'Unlimited' : tier === 'pro' ? 'Unlimited' : 'View Only'}
            </p>
          </div>
          <div className="text-center">
            <Phone className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">Live Calls</p>
            <p className="text-xs font-bold">
              {tier === 'elite' ? 'Unlimited' : tier === 'pro' ? 'Weekly' : 'Watch Only'}
            </p>
          </div>
        </div>
      </GlassCard>

      <CreditPurchase
        isOpen={showCreditPurchase}
        onClose={() => setShowCreditPurchase(false)}
        onPurchase={async (credits, price) => {
          // TODO: Implement actual purchase flow with payment provider
          console.log(`Purchasing ${credits} credits for $${price / 100}`);
          await loadCredits();
        }}
      />
    </>
  );
}

// Mini version for sidebar
export function UsageMini() {
  const { user, userData } = useAuth();
  const [credits, setCredits] = useState<UserCredits | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    getUserCredits(user.uid).then(setCredits);
  }, [user?.uid]);

  if (!credits || credits.tier === 'elite') return null;

  const percentage = (credits.remainingFree / credits.monthlyQuota) * 100;
  const isLow = percentage < 20;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className={isLow ? "text-red-400" : "text-muted-foreground"}>
          AI Chats: {credits.remainingFree}/{credits.monthlyQuota}
        </span>
        {isLow && <span className="text-red-400 font-bold">Low!</span>}
      </div>
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div 
          className={cn(
            "h-full rounded-full transition-all",
            isLow ? "bg-red-500" : "bg-primary"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
