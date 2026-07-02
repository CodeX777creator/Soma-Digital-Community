import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { generateMentorContent } from '@/ai/flows/ai-mentor-content-gen-flow';
import { apiResponse, apiError, createAPIHandler } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /mentor/content] Received request');
    
    const entitlements = await requireSubscription(req as any, 'pro');
    logger.info('[API /mentor/content] Auth successful', { userId: entitlements.uid });
    
    const body = await req.json();
    
    // Validate input
    if (body.topic && typeof body.topic !== 'string') {
      return apiError('Invalid topic format', { status: 400, code: 'INVALID_INPUT' });
    }
    if (body.audience && typeof body.audience !== 'string') {
      return apiError('Invalid audience format', { status: 400, code: 'INVALID_INPUT' });
    }
    if (body.contentType && typeof body.contentType !== 'string') {
      return apiError('Invalid contentType format', { status: 400, code: 'INVALID_INPUT' });
    }

    // Length limits
    if (body.topic && body.topic.length > 1000) {
      return apiError('Topic too long (max 1000 characters)', { status: 400, code: 'INPUT_TOO_LONG' });
    }
    if (body.audience && body.audience.length > 1000) {
      return apiError('Audience too long (max 1000 characters)', { status: 400, code: 'INPUT_TOO_LONG' });
    }

    const content = await generateMentorContent({
      contentType: body.contentType || 'ad_copy',
      businessContext: body.topic,
      targetAudience: body.audience,
    });

    return apiResponse({ content });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 5 },
    timeout: 30000,
  }
);

export const POST = handler;
