import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { generatePersonalizedRoadmap } from '@/ai/flows/ai-mentor-personalized-roadmap-flow';
import { apiResponse, apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { admin, adminDb } from '@/lib/firebaseAdmin';

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

    const roadmap = await generatePersonalizedRoadmap({
      businessGoals,
      userId: entitlements.uid,
      existingContext: typeof body.existingContext === 'string' ? body.existingContext : undefined,
    });

    await adminDb
      .collection('users')
      .doc(entitlements.uid)
      .collection('roadmaps')
      .doc('current')
      .set({
        ...roadmap,
        source: 'dashboard_generation',
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

    return apiResponse({ roadmap });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 3 },
    timeout: 45000,
  }
);

export const POST = handler;
