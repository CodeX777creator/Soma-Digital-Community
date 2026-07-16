import { useEffect, useRef, useState } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { BrainCircuit, ChevronLeft } from "lucide-react";
import { trackOnboardingEvent } from "@/lib/onboarding-events";

export function AIRoadmapStep() {
  const { identities, goal, skillLevel, interests, plan, setRoadmap, nextStep, prevStep } = useOnboardingStore();
  const [isSynthesizing, setIsSynthesizing] = useState(true);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handleAISynthesis = async () => {
      const { identities, goal, skillLevel, budget, availableTime, setRoadmap, nextStep } = useOnboardingStore.getState();
      
      const goalsText = `
        Identities: ${identities.join(", ")}
        Goal: ${goal}
        Skill Level: ${skillLevel}
        Budget: ${budget}
        Available Time: ${availableTime}
      `;

      try {
        const response = await fetch("/api/onboarding/roadmap-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ businessGoals: goalsText }),
        });

        if (!response.ok) {
          throw new Error("Unable to generate onboarding roadmap preview");
        }

        const body = await response.json();
        const res = body.roadmap;
        if (!isActive) return;

        setRoadmap(res);
        await trackOnboardingEvent("onboarding_roadmap_generated", {
          source: "onboarding_preview",
          intendedPlan: plan || "explorer",
        });
        // Hold for dramatic effect
        timeoutId = setTimeout(() => {
          if (!isActive) return;
          setIsSynthesizing(false);
          nextStep();
        }, 2000);
      } catch (error) {
        if (!isActive) return;

        console.error("AI Error:", error);
        setIsSynthesizing(false);
        nextStep(); // Fallback to next step
      }
    };

    handleAISynthesis();

    return () => {
      isActive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [identities, goal, skillLevel, interests, plan, setRoadmap, nextStep]);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-8 h-[400px]">
      <button
        type="button"
        onClick={prevStep}
        disabled={isSynthesizing}
        className="absolute top-2 left-0 flex items-center gap-2 text-white/30 hover:text-white transition-colors group disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-widest">Back</span>
      </button>

      <div className="relative">
        <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center blue-glow animate-pulse">
           <BrainCircuit className="w-16 h-16 text-primary animate-spin-slow" />
        </div>
        <div className="absolute inset-0 border-4 border-dashed border-primary/30 rounded-full animate-spin-slow" />
      </div>
      <div className="space-y-2 text-center">
         <p className="text-primary font-bold uppercase tracking-[0.3em] text-sm animate-pulse">Creating Your Plan</p>
         <p className="text-muted-foreground text-sm italic">Our AI is creating your custom {plan} roadmap...</p>
      </div>
    </div>
  );
}
