"use client";

import { useState, useEffect } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Zap, 
  Rocket, 
  Target, 
  Users, 
  ArrowRight, 
  ShieldCheck, 
  Star, 
  BrainCircuit, 
  Sparkles, 
  CheckCircle2, 
  Loader2,
  Trophy,
  Palette,
  Terminal,
  Cpu
} from "lucide-react";
import { generatePersonalizedRoadmap, PersonalizedRoadmapOutput } from "@/ai/flows/ai-mentor-personalized-roadmap-flow";
import { cn } from "@/lib/utils";

const steps = [
  {
    id: 1,
    title: "The Legacy Begins",
    subtitle: "Select your entrepreneurial archetype.",
    options: [
      { id: 'saas', label: 'SaaS / AI Product', icon: <Rocket className="w-6 h-6" />, desc: "Building scalable software solutions." },
      { id: 'creator', label: 'Creator Economy', icon: <Star className="w-6 h-6" />, desc: "Monetizing attention and influence." },
      { id: 'agency', label: 'Digital Agency', icon: <Users className="w-6 h-6" />, desc: "Providing high-ticket services." },
      { id: 'ecom', label: 'E-commerce', icon: <Target className="w-6 h-6" />, desc: "Physical or digital product empires." }
    ]
  },
  {
    id: 2,
    title: "Target Revenue",
    subtitle: "Define the scale of your ambition.",
    options: [
      { id: 'launch', label: 'Validation Phase', icon: <Zap className="w-6 h-6" />, desc: "First $1k - $5k in revenue." },
      { id: '10k', label: 'Scale to $10k MRR', icon: <ShieldCheck className="w-6 h-6" />, desc: "Consistent high-performance growth." },
      { id: '100k', label: 'Elite Scaling', icon: <Trophy className="w-6 h-6" />, desc: "Building a 7-figure digital legacy." }
    ]
  },
  {
    id: 3,
    title: "Experience Level",
    subtitle: "Where are you on the path?",
    options: [
      { id: 'novice', label: 'Explorer', icon: <Cpu className="w-6 h-6" />, desc: "Fresh eyes, high hunger." },
      { id: 'builder', label: 'Architect', icon: <Terminal className="w-6 h-6" />, desc: "Existing products, seeking optimization." },
      { id: 'elite', label: 'Legacy Founder', icon: <BrainCircuit className="w-6 h-6" />, desc: "Exited before, scaling multiple hubs." }
    ]
  },
  {
    id: 4,
    title: "Primary Interests",
    subtitle: "Select modules for your AI Mentor.",
    isMulti: true,
    options: [
      { id: 'automation', label: 'AI Automation', icon: <BrainCircuit className="w-6 h-6" /> },
      { id: 'funnels', label: 'High-Ticket Funnels', icon: <Sparkles className="w-6 h-6" /> },
      { id: 'ads', label: 'Paid Acquisition', icon: <Zap className="w-6 h-6" /> },
      { id: 'branding', label: 'Luxury Branding', icon: <Palette className="w-6 h-6" /> }
    ]
  },
  {
    id: 5,
    title: "Intelligence Synthesis",
    subtitle: "AI is analyzing your trajectory...",
    isSpecial: true
  },
  {
    id: 6,
    title: "Your Legacy Roadmap",
    subtitle: "Strategic synchronization complete.",
    isFinal: true
  }
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selections, setSelections] = useState<Record<string, any>>({});
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [roadmap, setRoadmap] = useState<PersonalizedRoadmapOutput | null>(null);

  useEffect(() => {
    if (currentStep === 5) {
      handleAISynthesis();
    }
  }, [currentStep]);

  const handleAISynthesis = async () => {
    setIsSynthesizing(true);
    try {
      // Build a prompt context from selections
      const goalsText = `Archetype: ${selections[1]}, Goal: ${selections[2]}, Experience: ${selections[3]}, Interests: ${Array.isArray(selections[4]) ? selections[4].join(', ') : selections[4]}`;
      const res = await generatePersonalizedRoadmap({ businessGoals: goalsText });
      setRoadmap(res);
      // Hold for dramatic effect
      setTimeout(() => {
        setIsSynthesizing(false);
        setCurrentStep(6);
      }, 3000);
    } catch (error) {
      console.error("AI Error:", error);
      setIsSynthesizing(false);
      setCurrentStep(6); // Fallback
    }
  };

  const handleOptionSelect = (stepId: number, optionId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (step?.isMulti) {
      const current = selections[stepId] || [];
      const next = current.includes(optionId) 
        ? current.filter((id: string) => id !== optionId)
        : [...current, optionId];
      setSelections({ ...selections, [stepId]: next });
    } else {
      setSelections({ ...selections, [stepId]: optionId });
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      window.location.href = '/dashboard';
    }
  };

  const currentStepData = steps.find(s => s.id === currentStep);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col items-center justify-center p-6 md:p-12">
      {/* Cinematic Background */}
      <div className="animated-bg">
        <div className="glow-particle w-[800px] h-[800px] bg-primary top-[-30%] left-[-20%] opacity-20 animate-pulse-glow" />
        <div className="glow-particle w-[600px] h-[600px] bg-accent bottom-[-20%] right-[-10%] opacity-20 animate-pulse-glow" style={{ animationDelay: '2s' }} />
      </div>

      <div className="max-w-4xl w-full flex flex-col gap-12 relative z-10">
        
        {/* Progress Header */}
        <div className="flex flex-col items-center gap-6">
           <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center blue-glow animate-float">
             <Cpu className="text-white w-8 h-8" />
           </div>
           
           <div className="flex justify-center gap-3 w-full max-w-xs">
             {steps.map(s => (
               <div 
                 key={s.id} 
                 className={cn(
                   "h-1.5 rounded-full transition-all duration-700",
                   currentStep === s.id ? 'bg-primary w-12 blue-glow' : 
                   currentStep > s.id ? 'bg-primary/40 w-6' : 'bg-white/5 w-6'
                 )} 
               />
             ))}
           </div>
           
           <div className="text-center space-y-3">
             <h1 className="text-5xl md:text-7xl font-bold font-headline tracking-tighter animate-in fade-in slide-in-from-bottom-4 duration-700">
               {currentStepData?.title}
             </h1>
             <p className="text-muted-foreground text-xl md:text-2xl font-medium">
               {currentStepData?.subtitle}
             </p>
           </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">
          {currentStepData?.isSpecial ? (
            <div className="flex flex-col items-center justify-center py-20 gap-8">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center blue-glow animate-pulse">
                   <BrainCircuit className="w-16 h-16 text-primary animate-spin-slow" />
                </div>
                <div className="absolute inset-0 border-4 border-dashed border-primary/30 rounded-full animate-spin-slow" />
              </div>
              <div className="space-y-2 text-center">
                 <p className="text-primary font-bold uppercase tracking-[0.3em] text-sm animate-pulse">Processing Neural Nodes</p>
                 <p className="text-muted-foreground text-sm italic">Synchronizing your ambitions with market data...</p>
              </div>
            </div>
          ) : currentStepData?.isFinal ? (
            <div className="space-y-6 animate-in fade-in zoom-in duration-1000">
               <GlassCard className="p-8 border-primary/30 bg-primary/5 blue-glow">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                      <Sparkles className="text-white w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold">{roadmap?.roadmapTitle || "Custom Growth Sequence"}</h3>
                      <Badge className="bg-primary/20 text-primary border-none text-[10px] uppercase font-bold px-3">AI Synthesis v2.5</Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {roadmap?.steps.map((step, idx) => (
                      <div key={idx} className="p-5 rounded-2xl bg-white/5 border border-white/10 group hover:border-primary/50 transition-all">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-primary font-bold font-headline text-lg">{idx + 1}.</span>
                          <h4 className="font-bold text-white group-hover:text-primary transition-colors">{step.title}</h4>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                      </div>
                    ))}
                  </div>
               </GlassCard>
            </div>
          ) : (
            <div className={cn(
              "grid gap-4",
              currentStepData?.isMulti ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            )}>
              {currentStepData?.options?.map(opt => {
                const isSelected = Array.isArray(selections[currentStep]) 
                  ? selections[currentStep].includes(opt.id)
                  : selections[currentStep] === opt.id;
                
                return (
                  <GlassCard 
                    key={opt.id} 
                    onClick={() => handleOptionSelect(currentStep, opt.id)}
                    className={cn(
                      "flex flex-col gap-4 p-6 cursor-pointer border-2 transition-all duration-500 group relative overflow-hidden",
                      isSelected ? 'border-primary bg-primary/10 blue-glow scale-[1.02]' : 'border-white/5 hover:border-white/20'
                    )}
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500",
                      isSelected ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground group-hover:text-white'
                    )}>
                      {opt.icon}
                    </div>
                    <div>
                      <h3 className={cn(
                        "text-xl font-bold transition-colors",
                        isSelected ? 'text-white' : 'text-muted-foreground group-hover:text-white'
                      )}>{opt.label}</h3>
                      {'desc' in opt && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{opt.desc}</p>}
                    </div>
                    {isSelected && (
                      <div className="absolute top-4 right-4 animate-in fade-in zoom-in">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      </div>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        {!currentStepData?.isSpecial && (
          <div className="flex flex-col items-center gap-6 mt-8">
            <Button 
              disabled={!selections[currentStep] && !currentStepData?.isFinal}
              onClick={handleNext}
              className="h-16 px-16 rounded-full bg-primary hover:bg-primary/90 text-2xl font-bold blue-glow group transition-all active:scale-95 disabled:opacity-30"
            >
              {currentStep === steps.length ? 'Finalize Hub Setup' : 'Synchronize Path'}
              <ArrowRight className="ml-3 group-hover:translate-x-2 transition-transform" />
            </Button>
            
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-[0.2em] animate-pulse">
              {currentStepData?.isFinal ? "Strategic Protocol Ready" : `Node ${currentStep} of ${steps.length} • Initializing Legacy Hub`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
