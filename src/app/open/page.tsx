"use client";

import { useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useOnboardingStore, PlanType } from "@/store/useOnboardingStore";
import { WelcomeStep } from "@/components/onboarding/WelcomeStep";
import { IdentityStep } from "@/components/onboarding/IdentityStep";
import { GoalsStep } from "@/components/onboarding/GoalsStep";
import { SkillLevelStep } from "@/components/onboarding/SkillLevelStep";
import { FinalDetailsStep } from "@/components/onboarding/FinalDetailsStep";
import { AIRoadmapStep } from "@/components/onboarding/AIRoadmapStep";
import { AccountCreationStep } from "@/components/onboarding/AccountCreationStep";
import { ActivationStep } from "@/components/onboarding/ActivationStep";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

function OnboardingController() {
  const searchParams = useSearchParams();
  const { currentStep, setPlan, plan, setStep, reset, identities, goal, skillLevel, budget, availableTime } = useOnboardingStore();
  const handledEntryPlan = useRef<string | null>(null);

  useEffect(() => {
    const planParam = searchParams.get("plan");
    const stepParam = searchParams.get("step");
    const hasCompletedRequiredSteps =
      identities.length > 0 && !!goal && !!skillLevel && !!budget && !!availableTime;

    if (
      planParam &&
      ["explorer", "pro", "elite"].includes(planParam) &&
      handledEntryPlan.current !== planParam
    ) {
      handledEntryPlan.current = planParam;
      reset();
      setPlan(planParam as PlanType);
      setStep(1);
      return;
    }

    if (stepParam === "signup" && hasCompletedRequiredSteps) {
      setStep(7); // Jump to account creation
    }

    if (currentStep >= 7 && !hasCompletedRequiredSteps) {
      setStep(1);
    }
  }, [
    availableTime,
    budget,
    currentStep,
    goal,
    identities.length,
    reset,
    searchParams,
    setPlan,
    setStep,
    skillLevel,
  ]);

  // Framer Motion variants for page transitions
  const variants = {
    initial: { opacity: 0, x: 50, scale: 0.95 },
    animate: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: -50, scale: 0.95 },
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <WelcomeStep />;
      case 2: return <IdentityStep />;
      case 3: return <GoalsStep />;
      case 4: return <SkillLevelStep />;
      case 5: return <FinalDetailsStep />;
      case 6: return <AIRoadmapStep />;
      case 7: return <AccountCreationStep />;
      case 8: return <ActivationStep />;
      default: return <WelcomeStep />;
    }
  };

  const TOTAL_STEPS = 8;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col items-center justify-center p-6 md:p-12">
      {/* Cinematic Background */}
      <div className="animated-bg">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="glow-particle w-[800px] h-[800px] bg-primary top-[-30%] left-[-20%] opacity-20 animate-pulse-glow" />
        <div className="glow-particle w-[600px] h-[600px] bg-accent bottom-[-20%] right-[-10%] opacity-20 animate-pulse-glow animation-delay-2000" />
        <div className="glow-particle w-[500px] h-[500px] bg-purple-500 top-[20%] right-[-5%] opacity-10 animate-pulse-glow animation-delay-4000" />
      </div>

      <div className="max-w-4xl w-full flex flex-col gap-12 relative z-10">

        {/* Progress Header */}
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center blue-glow animate-float">
            <Cpu className="text-white w-8 h-8" />
          </div>

          <div className="flex justify-center gap-2 w-full max-w-md">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
              const stepNum = i + 1;
              return (
                <div
                  key={stepNum}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-700 flex-1",
                    currentStep === stepNum ? 'bg-primary blue-glow scale-105' :
                      currentStep > stepNum ? 'bg-primary/40' : 'bg-white/5'
                  )}
                />
              );
            })}
          </div>
          {plan && (
            <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest text-primary/80">
              {plan} Plan Selected
            </div>
          )}
        </div>

        {/* Step Content */}
        <div className="min-h-[400px] relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              variants={variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="w-full"
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function OpenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-primary animate-pulse">Loading...</div>}>
      <OnboardingController />
    </Suspense>
  );
}
