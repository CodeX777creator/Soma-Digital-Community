import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { sanitizeString } from "@/lib/security";
import { generatePersonalizedRoadmap } from "@/ai/flows/ai-mentor-personalized-roadmap-flow";

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

    const roadmap = await generatePersonalizedRoadmap({
      businessGoals,
      existingContext: "Source: controlled onboarding roadmap preview. Billing policy: free onboarding allowance.",
    });

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
    rateLimit: { windowMs: 60 * 60 * 1000, maxRequests: 2 },
    timeout: 45000,
  }
);
