"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/providers/AuthProvider";
import { UserTier } from "@/lib/credits";
import { getPlanLabel } from "@/lib/plan-ui";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import {
  activeCreditBundles,
  CREATOR_CREDIT_RETAIL_VALUE_CENTS,
  CREATOR_CREDIT_RETAIL_VALUE_USD,
  CreatorCreditBundle,
  DEFAULT_CREATOR_CREDIT_CONFIG,
  normalizeCreatorCreditConfig,
} from "@/lib/creator-credit-config";

interface CreditPurchaseProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchase: (bundle: CreatorCreditBundle) => Promise<void>;
}

export function CreditPurchase({ isOpen, onClose, onPurchase }: CreditPurchaseProps) {
  const { userData } = useAuth();
  const { toast } = useToast();
  const [bundles, setBundles] = useState<CreatorCreditBundle[]>(activeCreditBundles(DEFAULT_CREATOR_CREDIT_CONFIG));
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const tier = (userData?.tier || 'explorer') as UserTier;

  useEffect(() => {
    if (!db) return;
    return onSnapshot(doc(db, "config", "creatorCredits"), (snap) => {
      const config = snap.exists() ? normalizeCreatorCreditConfig(snap.data()) : DEFAULT_CREATOR_CREDIT_CONFIG;
      setBundles(activeCreditBundles(config));
      setSelectedPackage((current) => current && activeCreditBundles(config).some((bundle) => bundle.id === current) ? current : null);
    });
  }, []);

  const handlePurchase = async () => {
    if (selectedPackage === null) return;
    
    const pkg = bundles.find((bundle) => bundle.id === selectedPackage);
    if (!pkg) return;
    setIsProcessing(true);
    
    try {
      await onPurchase(pkg);
      toast({
        title: "Credits Added!",
        description: `${pkg.credits} credits have been added to your account.`,
      });
      onClose();
    } catch (error) {
      toast({
        title: "Purchase Failed",
        description: error instanceof Error ? error.message : "Unable to process payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <GlassCard className="p-6 rounded-2xl border border-primary/20">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Buy Creator Credits</h2>
                  <p className="text-[10px] text-muted-foreground">
                    1 Creator Credit = ${CREATOR_CREDIT_RETAIL_VALUE_USD.toFixed(2)} retail value
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Current Status */}
            <div className="bg-white/[0.03] rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Your Tier</span>
                <span className={cn(
                  "text-sm font-bold capitalize",
                  tier === 'elite' && "text-yellow-400",
                  tier === 'pro' && "text-cyan-400",
                )}>
                  {getPlanLabel(tier)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-muted-foreground">Bundle Pricing</span>
                <span className="text-sm font-bold">Same for all plans</span>
              </div>
              {tier === 'explorer' && (
                <p className="text-[10px] text-cyan-400 mt-3">
                  Buy Creator Credits or upgrade when you want monthly included credits.
                </p>
              )}
              {tier === 'pro' && (
                <p className="text-[10px] text-violet-300 mt-3">
                  Top up anytime with the same universal Creator Credit bundles.
                </p>
              )}
            </div>

            {/* Credit Packages */}
            <div className="space-y-3 mb-6">
              {bundles
                .map((pkg) => {
                  const isSelected = selectedPackage === pkg.id;
                  const savings = calculateSavings(pkg);
                  
                  return (
                    <motion.button
                      key={pkg.id}
                      onClick={() => setSelectedPackage(pkg.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                        isSelected 
                          ? "bg-primary/10 border-primary/50" 
                          : "bg-white/[0.03] border-white/10 hover:border-white/20"
                      )}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          isSelected ? "bg-primary" : "bg-white/10"
                        )}>
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-sm">{pkg.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            ${(pkg.priceCents / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        {savings > 0 && (
                          <span className="text-[10px] text-green-400 block">
                            Save {savings}%
                          </span>
                        )}
                        {isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-primary ml-auto" />
                        )}
                      </div>
                    </motion.button>
                  );
                })}
            </div>

            {/* Actions */}
            <Button
              onClick={handlePurchase}
              disabled={selectedPackage === null || isProcessing}
              className="w-full bg-primary hover:bg-primary/90 h-12 text-lg font-bold"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Zap className="w-5 h-5 mr-2" />
              )}
              {selectedPackage !== null 
                ? `Buy for $${((bundles.find((bundle) => bundle.id === selectedPackage)?.priceCents || 0) / 100).toFixed(2)}`
                : "Select a package"
              }
            </Button>

            <p className="text-[10px] text-center text-muted-foreground mt-4">
                  Creator Credits power AI Studio, Mentor, Image, Video, Voice, and other premium generation tools.
                </p>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function calculateSavings(pkg: CreatorCreditBundle): number {
  const basePrice = pkg.credits * CREATOR_CREDIT_RETAIL_VALUE_CENTS;
  const savings = ((basePrice - pkg.priceCents) / basePrice) * 100;
  return Math.round(savings);
}
