"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Clock, Wallet, ArrowRight, CheckCircle2, ChevronLeft } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { cn } from "@/lib/utils";

const timeOptions = [
  { id: 'side', label: 'Side Hustle', desc: '5-10 hours / week', icon: <Clock className="w-5 h-5" /> },
  { id: 'part', label: 'Part Time', desc: '15-25 hours / week', icon: <Clock className="w-5 h-5" /> },
  { id: 'full', label: 'Full Time', desc: '40+ hours / week', icon: <Clock className="w-5 h-5" /> }
];

const budgetOptions = [
  { id: 'zero', label: 'Low Budget', desc: '$0 - $500 to start', icon: <Wallet className="w-5 h-5" /> },
  { id: 'mid', label: 'Moderate', desc: '$500 - $2,500', icon: <Wallet className="w-5 h-5" /> },
  { id: 'high', label: 'Aggressive', desc: '$2,500+', icon: <Wallet className="w-5 h-5" /> }
];

export function FinalDetailsStep() {
  const { budget, setBudget, availableTime, setAvailableTime, nextStep, prevStep } = useOnboardingStore();

  const isComplete = !!budget && !!availableTime;

  return (
    <div className="flex flex-col gap-10">
      <button
        type="button"
        onClick={prevStep}
        className="w-fit flex items-center gap-2 text-white/30 hover:text-white transition-colors group"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-widest">Back</span>
      </button>

      <div className="text-center space-y-3">
        <h2 className="text-4xl md:text-5xl font-bold font-headline tracking-tight">Final Details</h2>
        <p className="text-muted-foreground text-xl">Help us calibrate your wealth roadmap.</p>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <p className="text-sm font-bold uppercase tracking-widest text-primary">Available Time</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {timeOptions.map(opt => (
              <GlassCard 
                key={opt.id} 
                onClick={() => setAvailableTime(opt.id)}
                className={cn(
                  "p-6 cursor-pointer border-2 transition-all duration-300",
                  availableTime === opt.id ? 'border-primary bg-primary/10' : 'border-white/5 hover:border-white/10'
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn("p-2 rounded-lg", availableTime === opt.id ? 'bg-primary text-white' : 'bg-white/5')}>
                    {opt.icon}
                  </div>
                  <p className="font-bold">{opt.label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </GlassCard>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm font-bold uppercase tracking-widest text-accent">Monthly Ad/Tool Budget</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {budgetOptions.map(opt => (
              <GlassCard 
                key={opt.id} 
                onClick={() => setBudget(opt.id)}
                className={cn(
                  "p-6 cursor-pointer border-2 transition-all duration-300",
                  budget === opt.id ? 'border-accent bg-accent/10' : 'border-white/5 hover:border-white/10'
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn("p-2 rounded-lg", budget === opt.id ? 'bg-accent text-black' : 'bg-white/5')}>
                    {opt.icon}
                  </div>
                  <p className="font-bold">{opt.label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-4">
        <Button 
          disabled={!isComplete}
          onClick={nextStep}
          className="h-14 px-12 rounded-full bg-primary hover:bg-primary/90 text-lg font-bold blue-glow group transition-all active:scale-95 disabled:opacity-30"
        >
          Initialize AI Strategy
          <ArrowRight className="ml-3 group-hover:translate-x-2 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
