import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Clock, Trophy, ArrowRight, CheckCircle2, ChevronLeft } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { cn } from "@/lib/utils";

const options = [
  { 
    id: 'stability', 
    label: 'Financial Stability', 
    icon: <ShieldCheck className="w-6 h-6" />, 
    desc: "Build your first dependable digital income stream." 
  },
  { 
    id: 'freedom', 
    label: 'Time Freedom', 
    icon: <Clock className="w-6 h-6" />, 
    desc: "Create scalable online income that gives you flexibility and independence." 
  },
  { 
    id: 'legacy', 
    label: 'Digital Legacy', 
    icon: <Trophy className="w-6 h-6" />, 
    desc: "Build automated wealth systems that grow beyond your time." 
  }
];

export function GoalsStep() {
  const { goal, setGoal, nextStep, prevStep } = useOnboardingStore();

  return (
    <div className="flex flex-col gap-8">
      <button
        type="button"
        onClick={prevStep}
        className="w-fit flex items-center gap-2 text-white/30 hover:text-white transition-colors group"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-widest">Back</span>
      </button>

      <div className="text-center space-y-3">
        <h2 className="text-4xl md:text-5xl font-bold font-headline tracking-tight">Define Your Next Level</h2>
        <p className="text-muted-foreground text-xl">What future are you stepping into?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {options.map(opt => {
          const isSelected = goal === opt.id;
          return (
            <GlassCard 
              key={opt.id} 
              onClick={() => setGoal(opt.id)}
              className={cn(
                "flex flex-col gap-5 p-8 cursor-pointer border-2 transition-all duration-500 group relative overflow-hidden",
                isSelected ? 'border-primary bg-primary/10 blue-glow scale-[1.05]' : 'border-white/5 hover:border-white/20'
              )}
            >
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                isSelected ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground group-hover:text-white'
              )}>
                {opt.icon}
              </div>
              <div className="space-y-2">
                <h3 className={cn(
                  "text-xl font-bold transition-colors leading-tight",
                  isSelected ? 'text-white' : 'text-muted-foreground group-hover:text-white'
                )}>{opt.label}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">{opt.desc}</p>
              </div>
              {isSelected && (
                <div className="absolute top-6 right-6 animate-in fade-in zoom-in">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>

      <div className="flex justify-center mt-8">
        <Button 
          disabled={!goal}
          onClick={nextStep}
          className="h-14 px-12 rounded-full bg-primary hover:bg-primary/90 text-lg font-bold blue-glow group transition-all active:scale-95 disabled:opacity-30"
        >
          Continue Journey
          <ArrowRight className="ml-3 group-hover:translate-x-2 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
