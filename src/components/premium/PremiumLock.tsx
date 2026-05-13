"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, Zap } from "lucide-react";
import { UpgradeModal } from "./UpgradeModal";
import { useState } from "react";

interface PremiumLockProps {
  children?: React.ReactNode;
  feature?: string;
  description?: string;
  className?: string;
}

export const PremiumLock = ({ children, feature = "Elite Insight", description = "This high-performance asset is reserved for Pro and Elite members.", className }: PremiumLockProps) => {
  const [showUpgrade, setShowUpgrade] = useState(false);

  return (
    <div className={`relative group ${className}`}>
      {/* Blurred Content Background */}
      <div className="filter blur-md opacity-40 pointer-events-none select-none grayscale">
        {children}
      </div>

      {/* Lock Overlay */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <GlassCard className="max-w-[280px] p-6 text-center border-primary/30 bg-black/60 backdrop-blur-xl animate-in fade-in zoom-in duration-500 blue-glow">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4 border border-primary/40">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <h4 className="font-bold text-lg mb-2 flex items-center justify-center gap-2">
            {feature} <Sparkles className="w-3.5 h-3.5 text-accent" />
          </h4>
          <p className="text-[10px] text-muted-foreground leading-relaxed mb-5 px-2">
            {description}
          </p>
          <Button 
            onClick={() => setShowUpgrade(true)}
            className="w-full bg-primary hover:bg-primary/90 rounded-xl h-10 text-xs font-bold blue-glow transition-all active:scale-95"
          >
            <Zap className="w-3.5 h-3.5 mr-2 fill-white" /> Upgrade to Unlock
          </Button>
        </GlassCard>
      </div>
      
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} />
    </div>
  );
};
