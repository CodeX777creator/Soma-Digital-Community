"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Zap, Sparkles, Rocket, Target, ShieldCheck } from "lucide-react";
import { PayPalSubscribeButtons } from "./PayPalSubscribeButtons";
import { PaystackSubscribeButtons } from "./PaystackSubscribeButtons";

const PLAN_PRICES = { pro: 97, elite: 297 } as const;

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialPlan?: 'pro' | 'elite' | null;
}

type PaymentProvider = 'paypal' | 'paystack';

export const UpgradeModal = ({ open, onOpenChange, onSuccess, initialPlan = null }: UpgradeModalProps) => {
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'elite' | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('paypal');

  useEffect(() => {
    if (open && initialPlan) {
      setSelectedPlan(initialPlan);
    }
  }, [initialPlan, open]);

  const handleSuccess = () => {
    setSelectedPlan(null);
    setPaymentProvider('paypal');
    onOpenChange(false);
    onSuccess?.();
  };

  const handleCancel = () => {
    setSelectedPlan(null);
    setPaymentProvider('paypal');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) handleCancel();
    onOpenChange(nextOpen);
  };

  const modalTitle = initialPlan
    ? `Upgrade to ${initialPlan === 'elite' ? 'Elite' : 'Pro'} Membership`
    : 'Choose Your Membership';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl bg-[#020617] border-white/10 p-0 overflow-hidden rounded-[2.5rem]">
        <div className="sr-only">
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>
            Choose the Soma Digital plan that fits your AI operating system needs.
          </DialogDescription>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left: Branding & Visual */}
          <div className="p-10 bg-gradient-to-br from-primary/20 via-accent/5 to-transparent flex flex-col justify-center relative">
             <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-grid-white/[0.05] bg-repeat mix-blend-overlay" />
             <Badge className="w-fit mb-6 bg-primary blue-glow border-none px-4 py-1">SDC MEMBERSHIP</Badge>
             <h2 className="text-4xl font-bold font-headline mb-4 leading-tight">Unlock Your <br /><span className="text-gradient">Success.</span></h2>
             <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
               Use the full power of Soma AI to save time, create faster, and grow with confidence.
             </p>
             <div className="space-y-4">
               {[
                 { icon: <Sparkles className="text-primary" />, text: "Full AI Coach Access" },
                 { icon: <Rocket className="text-accent" />, text: "Unlimited Resource Downloads" },
                 { icon: <Target className="text-purple-400" />, text: "Priority Support Sessions" },
                 { icon: <ShieldCheck className="text-green-400" />, text: "Private Group Access" }
               ].map((item, i) => (
                 <div key={i} className="flex items-center gap-3 text-xs font-medium text-white/80">
                   <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                     {item.icon}
                   </div>
                   {item.text}
                 </div>
               ))}
             </div>
          </div>

          {/* Right: Plans & CTA */}
          <div className="p-10 flex flex-col gap-6 justify-center">
             {selectedPlan === null ? (
               <>
                 <div className="space-y-4">
                    <button
                      onClick={() => setSelectedPlan('pro')}
                      className="w-full text-left p-6 rounded-2xl border-2 border-primary bg-primary/5 blue-glow transition-all flex items-center justify-between group hover:bg-primary/10"
                    >
                      <div>
                        <h4 className="font-bold text-lg">Pro Member</h4>
                        <p className="text-xs text-muted-foreground">Perfect for growing businesses.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${PLAN_PRICES.pro}</p>
                        <p className="text-[10px] uppercase font-bold text-primary">Monthly</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setSelectedPlan('elite')}
                      className="w-full text-left p-6 rounded-2xl border border-white/10 hover:border-accent/50 hover:bg-white/5 transition-all flex items-center justify-between group"
                    >
                      <div>
                        <h4 className="font-bold text-lg">Elite Soma</h4>
                        <p className="text-xs text-muted-foreground">For high-performance leaders.</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${PLAN_PRICES.elite}</p>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Monthly</p>
                      </div>
                    </button>
                 </div>

                 <div className="mt-4">
                   <p className="text-[10px] text-center text-muted-foreground">
                     Cancel anytime.
                   </p>
                 </div>
               </>
             ) : (
               <>
                 <Button
                   onClick={() => setSelectedPlan(null)}
                   variant="ghost"
                   className="w-fit text-primary hover:text-primary/80"
                 >
                   ← Back to Plans
                 </Button>

                 <div className="flex flex-col gap-2">
                   <h3 className="font-bold text-xl">
                     {selectedPlan === 'pro' ? 'Pro Member' : 'Elite Soma'}
                   </h3>
                   <p className="text-2xl font-bold">
                     {selectedPlan === 'pro' ? `$${PLAN_PRICES.pro}` : `$${PLAN_PRICES.elite}`}
                     <span className="text-sm font-normal text-muted-foreground ml-2">/month</span>
                   </p>
                 </div>

                 <div className="grid grid-cols-2 gap-3 mb-4">
                   <button
                     type="button"
                     onClick={() => setPaymentProvider('paypal')}
                     className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                       paymentProvider === 'paypal'
                         ? 'border-primary bg-primary/10 text-white'
                         : 'border-white/10 bg-white/5 text-muted-foreground'
                     }`}
                   >
                     PayPal
                   </button>
                   <button
                     type="button"
                     onClick={() => setPaymentProvider('paystack')}
                     className={`w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                       paymentProvider === 'paystack'
                         ? 'border-accent bg-accent/10 text-white'
                         : 'border-white/10 bg-white/5 text-muted-foreground'
                     }`}
                   >
                     Paystack
                   </button>
                 </div>

                 {paymentProvider === 'paypal' ? (
                   <PayPalSubscribeButtons
                     planId={selectedPlan}
                     planName={selectedPlan === 'pro' ? 'Pro Member' : 'Elite Soma'}
                     onSuccess={handleSuccess}
                     onCancel={handleCancel}
                   />
                 ) : (
                   <PaystackSubscribeButtons
                     planId={selectedPlan}
                     planName={selectedPlan === 'pro' ? 'Pro Member' : 'Elite Soma'}
                     onSuccess={handleSuccess}
                     onError={() => setSelectedPlan(null)}
                     onCancel={handleCancel}
                   />
                 )}
               </>
             )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
