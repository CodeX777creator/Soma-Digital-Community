import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, ChevronLeft } from "lucide-react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { useRouter } from "next/navigation";

export function WelcomeStep() {
  const { nextStep, plan } = useOnboardingStore();
  const router = useRouter();

  return (
    <div className="flex flex-col items-center text-center space-y-8 py-10">
      <div className="space-y-4">
        <h1 className="text-4xl md:text-6xl font-bold font-headline tracking-tight">
          Welcome to <span className="text-primary glow-text">Soma</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          You're about to set up your {plan === 'elite' ? 'Elite' : plan === 'pro' ? 'Pro' : 'Explorer'} account. 
          Our AI is ready to map out your exact path to success in the digital business world.
        </p>
      </div>

      {/* Exit Button */}
      <button 
        onClick={() => router.push('/')}
        className="absolute top-10 left-10 flex items-center gap-2 text-white/30 hover:text-white transition-colors group"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-widest">Exit to Home</span>
      </button>

      <div className="pt-8">
        <Button 
          onClick={nextStep}
          className="h-16 px-12 rounded-full bg-primary hover:bg-primary/90 text-xl font-bold blue-glow group transition-all active:scale-95"
        >
          Begin Your Setup
          <ArrowRight className="ml-3 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
}
