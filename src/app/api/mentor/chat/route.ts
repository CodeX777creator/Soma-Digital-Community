import { requireSubscription } from '@/lib/serverAuth';
import { aiMentorChat } from '@/ai/flows/ai-mentor-chat-flow';
import { apiResponse, apiError, createAPIHandler, withTimeout } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { sanitizePromptInput } from '@/lib/security';

const handler = createAPIHandler(
  async (req) => {
    logger.info('[API /mentor/chat] Received request');
    
    const entitlements = await requireSubscription(req as any, 'explorer');
    logger.info('[API /mentor/chat] Auth successful', { userId: entitlements.uid });
    
    const body = await req.json();
    
    if (typeof body.message !== 'string' || !body.message.trim()) {
      return apiError('Missing message text', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.message.length > 4000) {
      return apiError('Message too long (max 4000 characters)', { status: 400, code: 'INPUT_TOO_LONG' });
    }

    // Sanitize message to prevent prompt injection
    const { sanitized, threats } = sanitizePromptInput(body.message);
    
    if (threats.length > 0) {
      logger.warn('[API /mentor/chat] Potential prompt injection detected', { 
        userId: entitlements.uid,
        threats,
        originalLength: body.message.length 
      });
      // Continue with sanitized input but log the attempt
    }

    // Sanitize history if provided
    let sanitizedHistory: any[] = [];
    if (Array.isArray(body.history)) {
      sanitizedHistory = body.history.map((msg: any) => {
        if (typeof msg.content === 'string') {
          const { sanitized: sanitizedContent } = sanitizePromptInput(msg.content);
          return { ...msg, content: sanitizedContent };
        }
        return msg;
      });
    }

    logger.info('[API /mentor/chat] Calling aiMentorChat', { 
      messageLength: sanitized?.length, 
      historyLength: sanitizedHistory?.length,
      threatsDetected: threats.length
    });

    const response = await withTimeout(
      aiMentorChat({
        history: sanitizedHistory,
        message: sanitized,
        userGoals: entitlements.profile?.goal,
        skillLevel: entitlements.profile?.skillLevel,
      }),
      30000,
      'AI Mentor Chat'
    );
    
    logger.info('[API /mentor/chat] aiMentorChat completed', { responseLength: response?.length });

    return apiResponse({ result: response });
  },
  {
    timeout: 35000,
    rateLimit: { windowMs: 60 * 1000, maxRequests: 10 },
  }
);

export const POST = handler;
