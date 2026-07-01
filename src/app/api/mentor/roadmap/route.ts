import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { generatePersonalizedRoadmap } from '@/ai/flows/ai-mentor-personalized-roadmap-flow';
import { apiResponse, apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /mentor/roadmap] Received request');
    
    const entitlements = await requireSubscription(req as any, 'pro');
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

    const roadmap = await generatePersonalizedRoadmap({
      businessGoals: body.goals ?? entitlements.profile.goal,
    });

    return apiResponse({ roadmap });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 3 },
    timeout: 45000,
  }
);

export const POST = handler;
