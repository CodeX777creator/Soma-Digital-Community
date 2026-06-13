"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, X, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useAuth } from "@/providers/AuthProvider";
import { CREDIT_PACKAGES, CREDIT_PRICING, UserTier } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface CreditPurchaseProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchase: (credits: number, price: number) => Promise<void>;
}

export function CreditPurchase({ isOpen, onClose, onPurchase }: CreditPurchaseProps) {
  const { userData } = useAuth();
  const { toast } = useToast();
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const tier = (userData?.tier || 'explorer') as UserTier;
  const pricePerCredit = CREDIT_PRICING[tier] / 100;

  const handlePurchase = async () => {
    if (selectedPackage === null) return;
    
    const pkg = CREDIT_PACKAGES[selectedPackage];
    setIsProcessing(true);
    
    try {
      await onPurchase(pkg.credits, pkg.price);
      toast({
        title: "Credits Added!",
        description: `${pkg.credits} credits have been added to your account.`,
      });
      onClose();
    } catch (error) {
      toast({
        title: "Purchase Failed",
        description: "Unable to process payment. Please try again.",
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
                  <h2 className="text-lg font-bold text-white">Buy AI Credits</h2>
                  <p className="text-[10px] text-muted-foreground">
                    ${pricePerCredit.toFixed(2)} per credit
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
                  {tier}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-muted-foreground">Price per Credit</span>
                <span className="text-sm font-bold">${pricePerCredit.toFixed(2)}</span>
              </div>
              {tier === 'explorer' && (
                <p className="text-[10px] text-cyan-400 mt-3">
                  💡 Upgrade to Pro for 50% off credits!
                </p>
              )}
            </div>

            {/* Credit Packages */}
            <div className="space-y-3 mb-6">
              {CREDIT_PACKAGES
                .filter(pkg => pkg.tier === tier || (tier === 'pro' && pkg.tier === 'explorer'))
                .map((pkg, index) => {
                  const isSelected = selectedPackage === index;
                  const savings = calculateSavings(pkg);
                  
                  return (
                    <motion.button
                      key={index}
                      onClick={() => setSelectedPackage(index)}
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
                            ${(pkg.price / 100).toFixed(2)}
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
                ? `Buy for $${(CREDIT_PACKAGES[selectedPackage].price / 100).toFixed(2)}`
                : "Select a package"
              }
            </Button>

            <p className="text-[10px] text-center text-muted-foreground mt-4">
              Credits never expire. Secure payment processing.
            </p>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function calculateSavings(pkg: typeof CREDIT_PACKAGES[0]): number {
  const basePrice = pkg.credits * 10; // $0.10 per credit base
  const savings = ((basePrice - pkg.price) / basePrice) * 100;
  return Math.round(savings);
}
