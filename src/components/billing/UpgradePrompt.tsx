"use client";

import { motion } from "framer-motion";
import { X, ArrowRight, Sparkles, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { UserTier } from "@/lib/credits";

interface UpgradePromptProps {
  currentTier: UserTier;
  feature: string;
  isOpen: boolean;
  onClose: () => void;
  onBuyCredits?: () => void;
}

export function UpgradePrompt({ 
  currentTier, 
  feature, 
  isOpen, 
  onClose, 
  onBuyCredits 
}: UpgradePromptProps) {
  if (!isOpen) return null;

  const isExplorer = currentTier === 'explorer';
  const isPro = currentTier === 'pro';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[400px] z-50"
    >
      <div className={cn(
        "p-5 rounded-2xl border shadow-2xl relative overflow-hidden",
        isExplorer 
          ? "bg-gradient-to-br from-cyan-950/90 to-black border-cyan-500/30" 
          : "bg-gradient-to-br from-yellow-950/90 to-black border-yellow-500/30"
      )}>
        {/* Background glow */}
        <div className={cn(
          "absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-20",
          isExplorer ? "bg-cyan-500" : "bg-yellow-500"
        )} />
        
        {/* Close button */}
        <button 
          onClick={onClose}
          aria-label="Close upgrade prompt"
          className="absolute top-3 right-3 text-white/40 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="relative z-10">
          {isExplorer ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  Pro Recommended
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mb-1">
                You've used your free {feature}
              </h3>
              <p className="text-sm text-white/70 mb-4">
                Your community access is free forever. Upgrade to Pro for AI mentor, resources, and live calls.
              </p>
              <div className="flex gap-2">
                {onBuyCredits && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={onBuyCredits}
                    className="flex-1 border-white/20 hover:bg-white/10"
                  >
                    Buy Credits
                  </Button>
                )}
                <Button 
                  size="sm"
                  asChild
                  className="flex-1 bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
                >
                  <Link href="/dashboard?upgrade=pro">
                    Upgrade to Pro
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-yellow-400" />
                <span className="text-xs font-bold text-yellow-400 uppercase tracking-wider">
                  Go Elite
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mb-1">
                Unlock unlimited growth
              </h3>
              <p className="text-sm text-white/70 mb-4">
                Community access is free. Elite adds unlimited AI, founder calls, and exclusive resources.
              </p>
              <Button 
                size="sm"
                asChild
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
              >
                <Link href="/dashboard?upgrade=elite">
                  Upgrade to Elite
                  <Sparkles className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Feature comparison */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex justify-between text-[10px]">
            <span className="text-white/40">Current: {currentTier}</span>
            <span className={isExplorer ? "text-cyan-400" : "text-yellow-400"}>
              {isExplorer ? "Get 10x more" : "Go unlimited"}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Simpler inline version for embedding in components
export function InlineUpgrade({ tier, feature }: { tier: UserTier; feature: string }) {
  if (tier === 'elite') return null;

  return (
    <div className={cn(
      "p-4 rounded-xl border mt-4",
      tier === 'explorer' 
        ? "bg-cyan-950/30 border-cyan-500/20" 
        : "bg-yellow-950/30 border-yellow-500/20"
    )}>
      <div className="flex items-center gap-3">
        {tier === 'explorer' ? (
          <Zap className="w-5 h-5 text-cyan-400" />
        ) : (
          <Crown className="w-5 h-5 text-yellow-400" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">
            {tier === 'explorer' 
              ? `Free ${feature} limit reached`
              : `Get unlimited ${feature}`
            }
          </p>
          <p className="text-xs text-white/60">
            {tier === 'explorer' 
              ? "Community is free forever. Pro unlocks AI, resources & calls."
              : "Elite adds unlimited AI, founder access & exclusive content."
            }
          </p>
        </div>
        <Button 
          size="sm" 
          asChild
          className={cn(
            tier === 'explorer'
              ? "bg-cyan-500 hover:bg-cyan-600 text-black"
              : "bg-yellow-500 hover:bg-yellow-600 text-black"
          )}
        >
          <Link href={`/dashboard?upgrade=${tier === 'explorer' ? 'pro' : 'elite'}`}>
            Upgrade
          </Link>
        </Button>
      </div>
    </div>
  );
}
