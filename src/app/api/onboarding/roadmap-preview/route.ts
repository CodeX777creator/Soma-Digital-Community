import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { sanitizeString } from "@/lib/security";
import { generatePersonalizedRoadmap } from "@/ai/flows/ai-mentor-personalized-roadmap-flow";
import { logger } from "@/lib/logger";

function buildFallbackRoadmap(goalsText: string) {
  const focus = goalsText.toLowerCase().includes("creator")
    ? "content-led growth"
    : goalsText.toLowerCase().includes("agency")
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

export const POST = createAPIHandler(
  async (req) => {
    const body = await req.json().catch(() => ({}));
    const businessGoals = typeof body.businessGoals === "string"
      ? sanitizeString(body.businessGoals, 2000)
      : "";

    if (!businessGoals.trim()) {
      return apiError("Add your business goals to generate a roadmap.", {
        status: 400,
        code: "MISSING_GOALS",
      });
    }

    let roadmap;
    try {
      roadmap = await generatePersonalizedRoadmap({
        businessGoals,
        existingContext: "Source: controlled onboarding roadmap preview. Billing policy: free onboarding allowance.",
      });
    } catch (error) {
      logger.warn("[Onboarding] Roadmap generation failed, using fallback preview", {
        error: error instanceof Error ? error.message : String(error),
      });
      roadmap = buildFallbackRoadmap(businessGoals);
    }

    await adminDb.collection("onboardingEvents").add({
      event: "onboarding_roadmap_generated",
      metadata: {
        source: "onboarding_preview",
        allowance: "free_onboarding",
        hasRoadmap: true,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    return apiResponse({ roadmap }, { cache: { maxAge: 0, private: true } });
  },
  {
    rateLimit: { windowMs: 60 * 60 * 1000, maxRequests: 8 },
    timeout: 45000,
  }
);
