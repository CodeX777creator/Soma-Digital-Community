import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Rocket, TrendingUp, Globe, ArrowRight, CheckCircle2, ChevronLeft } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { cn } from "@/lib/utils";

const options = [
  { 
    id: 'beginner', 
    label: 'Beginner Explorer', 
    icon: <Rocket className="w-6 h-6" />, 
    desc: "Just getting started with online income and digital marketing.",
    bestFor: ["total beginners", "curious learners", "side hustlers"]
  },
  { 
    id: 'growing', 
    label: 'Growing Entrepreneur', 
    icon: <TrendingUp className="w-6 h-6" />, 
    desc: "Already building online income and ready to scale smarter.",
    bestFor: ["affiliate marketers", "creators", "digital sellers", "people earning inconsistently"]
  },
  { 
    id: 'empire', 
    label: 'Digital Empire Builder', 
    icon: <Globe className="w-6 h-6" />, 
    desc: "Scaling systems, audiences, and multiple income streams.",
    bestFor: ["advanced marketers", "automation-focused entrepreneurs", "established online earners"]
  }
];

export function SkillLevelStep() {
  const { skillLevel, setSkillLevel, nextStep, prevStep } = useOnboardingStore();

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
        <h2 className="text-4xl md:text-5xl font-bold font-headline tracking-tight">Your Experience Level</h2>
        <p className="text-muted-foreground text-xl">Where are you currently in your digital journey?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {options.map(opt => {
          const isSelected = skillLevel === opt.id;
          return (
            <GlassCard 
              key={opt.id} 
              onClick={() => setSkillLevel(opt.id)}
              className={cn(
                "flex flex-col gap-5 p-8 cursor-pointer border-2 transition-all duration-500 group relative overflow-hidden h-full",
                isSelected ? 'border-primary bg-primary/10 blue-glow scale-[1.05]' : 'border-white/5 hover:border-white/20'
              )}
            >
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                isSelected ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground group-hover:text-white'
              )}>
                {opt.icon}
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className={cn(
                    "text-xl font-bold transition-colors leading-tight",
                    isSelected ? 'text-white' : 'text-muted-foreground group-hover:text-white'
                  )}>{opt.label}</h3>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed opacity-80">{opt.desc}</p>
                </div>
                
                <div className="space-y-2 pt-4 border-t border-white/5">
                  <p className="text-[10px] uppercase tracking-widest text-primary/80 font-bold">Best for:</p>
                  <ul className="space-y-1">
                    {opt.bestFor.map((item, idx) => (
                      <li key={idx} className="text-xs text-muted-foreground/70 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-primary/40" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
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
          disabled={!skillLevel}
          onClick={nextStep}
          className="h-14 px-12 rounded-full bg-primary hover:bg-primary/90 text-lg font-bold blue-glow group transition-all active:scale-95 disabled:opacity-30"
        >
          Generate Strategy
          <ArrowRight className="ml-3 group-hover:translate-x-2 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
