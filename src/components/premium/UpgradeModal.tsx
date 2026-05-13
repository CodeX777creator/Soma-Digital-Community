"use client";

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

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const UpgradeModal = ({ open, onOpenChange }: UpgradeModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-[#020617] border-white/10 p-0 overflow-hidden rounded-[2.5rem]">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Left: Branding & Visual */}
          <div className="p-10 bg-gradient-to-br from-primary/20 via-accent/5 to-transparent flex flex-col justify-center relative">
             <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://picsum.photos/seed/texture/600/600')] bg-cover mix-blend-overlay" />
             <Badge className="w-fit mb-6 bg-primary blue-glow border-none px-4 py-1">PRO MEMBERSHIP</Badge>
             <h2 className="text-4xl font-bold font-headline mb-4 leading-tight">Unlock Your <br /><span className="text-gradient">Digital Legacy.</span></h2>
             <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
               Join the elite tier of founders leveraging the full intelligence of Legacy Hub. Reclaim your time and scale with precision.
             </p>
             <div className="space-y-4">
               {[
                 { icon: <Sparkles className="text-primary" />, text: "Full AI Mentor Logic Access" },
                 { icon: <Rocket className="text-accent" />, text: "Infinite Downloads in The Vault" },
                 { icon: <Target className="text-purple-400" />, text: "Priority Strategy Sessions" },
                 { icon: <ShieldCheck className="text-green-400" />, text: "Vetted Networking Access" }
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
             <div className="space-y-4">
                <button className="w-full text-left p-6 rounded-2xl border-2 border-primary bg-primary/5 blue-glow transition-all flex items-center justify-between group">
                  <div>
                    <h4 className="font-bold text-lg">Pro Founder</h4>
                    <p className="text-xs text-muted-foreground">Perfect for scaling builders.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">$97</p>
                    <p className="text-[10px] uppercase font-bold text-primary">Monthly</p>
                  </div>
                </button>

                <button className="w-full text-left p-6 rounded-2xl border border-white/10 hover:border-accent/50 hover:bg-white/5 transition-all flex items-center justify-between group">
                  <div>
                    <h4 className="font-bold text-lg">Elite Legacy</h4>
                    <p className="text-xs text-muted-foreground">High-performance leadership.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">$297</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Quarterly</p>
                  </div>
                </button>
             </div>

             <div className="mt-4">
               <Button className="w-full h-14 rounded-xl bg-primary hover:bg-primary/90 text-lg font-bold blue-glow mb-4">
                 Upgrade My Account
               </Button>
               <p className="text-[10px] text-center text-muted-foreground">
                 Cancel anytime. 30-day high-performance guarantee.
               </p>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
