import { useEffect, useRef, useState } from "react";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import { BrainCircuit, ChevronLeft } from "lucide-react";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { auth } from "@/lib/firebase";
import { dbService } from "@/lib/db";

const ROADMAP_CACHE_PREFIX = "sdc-onboarding-roadmap:";

function getRoadmapCacheKey(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0;
  }
  return `${ROADMAP_CACHE_PREFIX}${Math.abs(hash)}`;
}

function buildFallbackRoadmap(goalsText: string) {
  const focus = goalsText.includes("creator")
    ? "content-led growth"
    : goalsText.includes("agency")
      ? "service packaging and client acquisition"
      : "a focused digital business foundation";

  return {
    roadmapTitle: "Your SDC Business Launch Roadmap",
    primaryOpportunity: `Build momentum through ${focus}, then use Soma AI to turn that focus into repeatable weekly execution.`,
    fastestRevenuePath: "Start with one clear offer, publish useful content around the problem it solves, and invite interested people into a simple call, checkout, or community path.",
    recommendedContentStrategy: "Create practical content that teaches, proves, and invites. Use AI Studio for captions, scripts, emails, and repurposing so consistency does not depend on daily willpower.",
    monetizationStrategy: "Package your knowledge or service into a clear offer, validate it with your first audience, then use Marketplace, Scheduler, and community touchpoints to keep demand moving.",
    aiGrowthForecast: "Over the next 12 months, AI should reduce content production time, sharpen your roadmap, improve follow-up, and help you test offers faster.",
    thirtyDayExecutionPlan: [
      { day: "Days 1-7", task: "Clarify your niche, audience, and first offer.", outcome: "A simple business direction and message you can publish around." },
      { day: "Days 8-14", task: "Create your first content system in AI Studio.", outcome: "A repeatable weekly publishing rhythm." },
      { day: "Days 15-21", task: "Start conversations and collect feedback.", outcome: "Real market signals from prospects or community members." },
      { day: "Days 22-30", task: "Refine the offer and prepare a simple launch path.", outcome: "A practical route to first revenue or next revenue." },
    ],
    steps: [
      { title: "Define the business lane", description: "Choose the audience, problem, and outcome you want SDC to help you build around.", timeframe: "Today", resources: ["AI Mentor", "Business roadmap"] },
      { title: "Create the first content engine", description: "Use AI Studio to generate platform-specific content ideas, scripts, captions, and emails.", timeframe: "This week", resources: ["AI Studio", "Scheduler"] },
      { title: "Publish and learn", description: "Schedule content, watch engagement, and use feedback to adjust your offer and message.", timeframe: "Weeks 2-3", resources: ["Social Hub", "Scheduler analytics"] },
      { title: "Monetize the validated path", description: "Turn the strongest signal into a product, service, course, or marketplace offer.", timeframe: "Weeks 3-4", resources: ["Marketplace", "Academy", "Community"] },
    ],
  };
}

async function persistRoadmapDraft(roadmap: unknown) {
  const user = auth?.currentUser;
  if (!user || !roadmap) return;

  try {
    await dbService.saveRoadmap(user.uid, roadmap);
  } catch (error) {
    console.error("Non-critical roadmap draft save failed:", error);
  }
}

export function AIRoadmapStep() {
  const { identities, goal, skillLevel, interests, plan, roadmap, setRoadmap, nextStep, prevStep } = useOnboardingStore();
  const [isSynthesizing, setIsSynthesizing] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "saved-local">("idle");
  const hasStarted = useRef(false);

  async function saveRoadmapDraft(roadmapDraft: unknown, mode: "remote" | "local") {
    if (!roadmapDraft) return;

    if (mode === "remote") {
      const user = auth?.currentUser;
      if (!user) return;

      try {
        setSaveState("saving");
        await dbService.saveRoadmap(user.uid, roadmapDraft);
        setSaveState("saved");
      } catch (error) {
        console.error("Non-critical roadmap draft save failed:", error);
      }
      return;
    }

    setSaveState((current) => (current === "saved" ? current : "saved-local"));
  }

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
        if (roadmap) {
          timeoutId = setTimeout(() => {
            if (!isActive) return;
            setIsSynthesizing(false);
            nextStep();
          }, 900);
          return;
        }

        const cacheKey = getRoadmapCacheKey(goalsText);
        const cached = typeof window !== "undefined" ? window.localStorage.getItem(cacheKey) : null;
        if (cached) {
          const parsed = JSON.parse(cached);
          setRoadmap(parsed);
          void saveRoadmapDraft(parsed, auth?.currentUser ? "remote" : "local");
          timeoutId = setTimeout(() => {
            if (!isActive) return;
            setIsSynthesizing(false);
            nextStep();
          }, 900);
          return;
        }

        const response = await fetch("/api/onboarding/roadmap-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ businessGoals: goalsText }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            const fallback = buildFallbackRoadmap(goalsText);
            setRoadmap(fallback);
            void saveRoadmapDraft(fallback, auth?.currentUser ? "remote" : "local");
            if (typeof window !== "undefined") {
              window.localStorage.setItem(cacheKey, JSON.stringify(fallback));
            }
            timeoutId = setTimeout(() => {
              if (!isActive) return;
              setIsSynthesizing(false);
              nextStep();
            }, 1200);
            return;
          }
          throw new Error("Unable to generate onboarding roadmap preview");
        }

        const body = await response.json();
        const res = body.roadmap;
        if (!isActive) return;

        setRoadmap(res);
        void saveRoadmapDraft(res, auth?.currentUser ? "remote" : "local");
        if (typeof window !== "undefined") {
          window.localStorage.setItem(cacheKey, JSON.stringify(res));
        }
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
  }, [identities, goal, skillLevel, interests, plan, roadmap, setRoadmap, nextStep]);

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
         {saveState === "saving" ? (
           <p className="text-xs text-cyan-300/80">Saving roadmap to your profile...</p>
         ) : saveState === "saved" ? (
           <p className="text-xs text-emerald-300/80">Roadmap saved to your profile.</p>
         ) : saveState === "saved-local" ? (
           <p className="text-xs text-amber-300/80">Roadmap saved locally and will sync when your account is ready.</p>
         ) : null}
      </div>
    </div>
  );
}
