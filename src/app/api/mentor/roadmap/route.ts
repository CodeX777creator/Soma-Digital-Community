import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { generatePersonalizedRoadmap } from '@/ai/flows/ai-mentor-personalized-roadmap-flow';
import { apiResponse, apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { admin, adminDb } from '@/lib/firebaseAdmin';

function buildFallbackRoadmap(businessGoals: string) {
  const focus = businessGoals.split('\n')[0]?.trim() || 'your business';
  return {
    roadmapTitle: `Your ${focus} Growth Roadmap`,
    primaryOpportunity: `Turn ${focus} into a clear, focused offer for a specific audience.`,
    fastestRevenuePath: 'Start with one simple paid offer, validate it with real conversations, and improve it from customer feedback.',
    aiGrowthForecast: 'Consistent publishing, follow-up, and weekly review can create measurable momentum over the next 30 days.',
    recommendedContentStrategy: 'Share practical lessons, customer questions, proof, and clear next steps across the channels your audience already uses.',
    monetizationStrategy: 'Begin with a focused service or product, then add repeatable digital offers as demand becomes clearer.',
    thirtyDayExecutionPlan: [
      { day: 'Days 1-3', task: 'Define your audience, problem, and first offer.', outcome: 'A clear message and offer to test.' },
      { day: 'Days 4-10', task: 'Create and publish helpful content around the problem you solve.', outcome: 'Early attention and customer conversations.' },
      { day: 'Days 11-20', task: 'Invite interested people to a call, trial, or purchase.', outcome: 'Real feedback and first opportunities.' },
      { day: 'Days 21-30', task: 'Review results, improve the offer, and repeat what worked.', outcome: 'A stronger, more repeatable growth process.' },
    ],
    steps: [
      { title: 'Clarify the opportunity', description: 'Choose one audience and one meaningful problem to solve.' },
      { title: 'Build the first offer', description: 'Package a simple outcome that is easy to explain and buy.' },
      { title: 'Create useful visibility', description: 'Publish practical content that earns trust with the right people.' },
      { title: 'Measure and improve', description: 'Track conversations, leads, sales, and lessons each week.' },
    ],
    source: 'fallback',
  };
}

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /mentor/roadmap] Received request');
    
    const entitlements = await requireSubscription(req as any, 'explorer');
    logger.info('[API /mentor/roadmap] Auth successful', { userId: entitlements.uid });
    
    const body = await req.json();
    
    // Validate goals input if provided
    if (body.goals !== undefined) {
      if (typeof body.goals !== 'string') {
        return apiError('Goals must be a string', { status: 400, code: 'INVALID_INPUT' });
      }
      if (body.goals.length > 2000) {
        return apiError('Goals too long (max 2000 characters)', { status: 400, code: 'INPUT_TOO_LONG' });
      }
    }

    const profileGoals = [
      entitlements.profile.goal,
      entitlements.profile.businessGoal,
      entitlements.profile.businessGoals,
      entitlements.profile.selectedIdentity,
      entitlements.profile.skillLevel ? `Skill level: ${entitlements.profile.skillLevel}` : '',
      entitlements.profile.industry ? `Industry: ${entitlements.profile.industry}` : '',
    ].filter(Boolean).join('\n');

    const businessGoals = (typeof body.goals === 'string' && body.goals.trim())
      ? body.goals.trim()
      : profileGoals;

    if (!businessGoals.trim()) {
      return apiError('Add a business goal to generate your roadmap.', { status: 400, code: 'MISSING_GOALS' });
    }

    let roadmap;
    let usedFallback = false;
    try {
      roadmap = await generatePersonalizedRoadmap({
        businessGoals,
        userId: entitlements.uid,
        existingContext: typeof body.existingContext === 'string' ? body.existingContext : undefined,
      });
    } catch (error) {
      logger.warn('[API /mentor/roadmap] Generation failed; returning fallback roadmap', {
        userId: entitlements.uid,
        error: error instanceof Error ? error.message : String(error),
      });
      roadmap = buildFallbackRoadmap(businessGoals);
      usedFallback = true;
    }

    try {
      await adminDb
        .collection('users')
        .doc(entitlements.uid)
        .collection('roadmaps')
        .doc('current')
        .set({
          ...roadmap,
          source: usedFallback ? 'dashboard_fallback' : 'dashboard_generation',
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch (error) {
      logger.warn('[API /mentor/roadmap] Roadmap persistence failed after generation', {
        userId: entitlements.uid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return apiResponse({ roadmap });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 3 },
    timeout: 45000,
  }
);

export const POST = handler;
