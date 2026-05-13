"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Rocket, Target, Users, ArrowRight, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";

const steps = [
  {
    id: 1,
    title: "Welcome to the Hub",
    description: "What's the primary focus of your digital legacy?",
    options: [
      { id: 'saas', label: 'SaaS / AI Product', icon: <Rocket className="w-5 h-5" /> },
      { id: 'creator', label: 'Creator Economy', icon: <Star className="w-5 h-5" /> },
      { id: 'agency', label: 'Digital Agency', icon: <Users className="w-5 h-5" /> },
      { id: 'ecom', label: 'E-commerce', icon: <Target className="w-5 h-5" /> }
    ]
  },
  {
    id: 2,
    title: "Set Your Target",
    description: "What is your primary revenue goal for this quarter?",
    options: [
      { id: 'launch', label: 'Market Validation / Launch', icon: <Zap className="w-5 h-5" /> },
      { id: '10k', label: '$10k - $30k MRR', icon: <ShieldCheck className="w-5 h-5" /> },
      { id: '100k', label: '$100k+ MRR Scaling', icon: <Target className="w-5 h-5" /> }
    ]
  }
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selections, setSelections] = useState<Record<number, string>>({});

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      window.location.href = '/dashboard';
    }
  };

  const currentStepData = steps.find(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col items-center justify-center p-4">
      <div className="animated-bg">
        <div className="glow-particle w-[600px] h-[600px] bg-primary top-[-20%] left-[-10%] opacity-20" />
        <div className="glow-particle w-[400px] h-[400px] bg-accent bottom-[-10%] right-[0%] opacity-20" />
      </div>

      <div className="max-w-xl w-full flex flex-col gap-12 relative z-10">
        <div className="text-center space-y-2">
           <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center blue-glow mx-auto mb-6">
             <Zap className="text-white fill-white" />
           </div>
           <div className="flex justify-center gap-2 mb-6">
             {steps.map(s => (
               <div key={s.id} className={`h-1 rounded-full transition-all duration-500 ${currentStep >= s.id ? 'bg-primary w-8' : 'bg-white/10 w-4'}`} />
             ))}
           </div>
           <h1 className="text-4xl md:text-5xl font-bold font-headline tracking-tight">{currentStepData?.title}</h1>
           <p className="text-muted-foreground text-lg">{currentStepData?.description}</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {currentStepData?.options.map(opt => (
            <GlassCard 
              key={opt.id} 
              onClick={() => setSelections({...selections, [currentStep]: opt.id})}
              className={`flex items-center gap-5 p-6 cursor-pointer border-2 transition-all ${selections[currentStep] === opt.id ? 'border-primary bg-primary/10' : 'border-white/5 hover:border-white/20'}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selections[currentStep] === opt.id ? 'bg-primary text-white blue-glow' : 'bg-white/5 text-muted-foreground'}`}>
                {opt.icon}
              </div>
              <span className={`text-xl font-bold ${selections[currentStep] === opt.id ? 'text-white' : 'text-muted-foreground'}`}>{opt.label}</span>
            </GlassCard>
          ))}
        </div>

        <Button 
          disabled={!selections[currentStep]}
          onClick={handleNext}
          className="h-16 rounded-full bg-primary hover:bg-primary/90 text-xl font-bold blue-glow group mt-4"
        >
          {currentStep === steps.length ? 'Finalize Hub Setup' : 'Continue'}
          <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" />
        </Button>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Step {currentStep} of {steps.length} • Setting up your personalized AI Mentor
        </p>
      </div>
    </div>
  );
}
