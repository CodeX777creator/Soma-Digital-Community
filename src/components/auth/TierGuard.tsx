"use client";

import React from "react";
import { useUserStore, UserTier } from "@/store/useUserStore";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Lock, Zap, Shield, Trophy, ArrowRight } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";

interface TierGuardProps {
  children: React.ReactNode;
  minTier: UserTier;
  fallback?: React.ReactNode;
}

/**
 * TierGuard: Hard gate for routes or sections. 
 * If the user doesn't meet the tier, it shows a "Locked" placeholder or custom fallback.
 */
export const TierGuard = ({ children, minTier, fallback }: TierGuardProps) => {
  const { tier } = useUserStore();
  
  const tierWeights = { explorer: 0, pro: 1, elite: 2 };
  const hasAccess = tierWeights[tier] >= tierWeights[minTier];

  if (hasAccess) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div className="w-full py-12 px-6">
      <GlassCard className="max-w-2xl mx-auto p-12 text-center flex flex-col items-center gap-8 border-primary/20 bg-primary/5">
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center blue-glow">
          <Lock className="w-10 h-10 text-primary" />
        </div>
        
        <div className="space-y-4">
          <h2 className="text-3xl font-bold font-headline">Access Restricted</h2>
          <p className="text-muted-foreground text-lg">
            This feature is exclusive to <span className="text-white font-bold uppercase">{minTier}</span> members.
            Upgrade your membership to unlock the full potential of SOMA.
          </p>
        </div>

        <Link href="/#pricing">
          <Button className="h-14 px-8 rounded-full bg-primary hover:bg-primary/90 text-lg font-bold blue-glow group">
            Upgrade to {minTier}
            <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </GlassCard>
    </div>
  );
};

interface FeatureGateProps {
  children: React.ReactNode;
  featureId: string;
  preview?: React.ReactNode;
}

/**
 * FeatureGate: Soft gate for UI elements.
 * Shows a blurred preview with an "Unlock" overlay if the user doesn't have the feature.
 */
export const FeatureGate = ({ children, featureId, preview }: FeatureGateProps) => {
  const { unlockedFeatures } = useUserStore();
  const hasFeature = unlockedFeatures.includes(featureId);

  if (hasFeature) return <>{children}</>;

  return (
    <div className="relative group overflow-hidden rounded-[2rem]">
      <div className="blur-xl opacity-40 pointer-events-none grayscale select-none">
        {preview || children}
      </div>
      
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20 p-8 text-center bg-black/40 backdrop-blur-[2px]">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/30 cyan-glow">
            <Zap className="w-6 h-6 text-accent" />
          </div>
          <h4 className="text-xl font-bold font-headline">Premium Feature</h4>
          <p className="text-xs text-muted-foreground max-w-[200px]">
            Unlocked for Pro and Elite members.
          </p>
          <Link href="/#pricing">
            <Button size="sm" variant="outline" className="rounded-full border-accent/30 text-accent hover:bg-accent/10 mt-2">
              Learn More
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
};
