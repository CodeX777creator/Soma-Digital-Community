import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/serverAuth';
import { apiResponse, apiError, createAPIHandler, withTimeout } from '@/lib/api-middleware';
import { logger } from '@/lib/logger';
import { sanitizePromptInput } from '@/lib/security';
import { aiMentorChatEnhanced, aiMentorChatStream } from '@/ai/flows/ai-mentor-chat-flow-enhanced';
import { createStreamingResponse, createSSEStream } from '@/ai/core/streaming-handler';

const handler = createAPIHandler(
  async (req, _context) => {
    const requestId = `chat_${Date.now()}`;
    logger.info('[API /mentor/chat] Received request', { requestId });
    
    const entitlements = await requireSubscription(req as any, 'explorer');
    logger.info('[API /mentor/chat] Auth successful', { userId: entitlements.uid, requestId });
    
    const body = await req.json();
    
    // Validate input
    if (typeof body.message !== 'string' || !body.message.trim()) {
      return apiError('Missing message text', { status: 400, code: 'INVALID_INPUT' });
    }

    if (body.message.length > 4000) {
      return apiError('Message too long (max 4000 characters)', { status: 400, code: 'INPUT_TOO_LONG' });
    }

    // Sanitize message
    const { sanitized, threats } = sanitizePromptInput(body.message);
    
    if (threats.length > 0) {
      logger.warn('[API /mentor/chat] Potential prompt injection detected', { 
        userId: entitlements.uid,
        threats,
        requestId,
      });
    }

    // Sanitize history
    const sanitizedHistory = Array.isArray(body.history) 
      ? body.history.map((msg: any) => ({
          role: msg.role,
          content: typeof msg.content === 'string' 
            ? sanitizePromptInput(msg.content).sanitized 
            : msg.content,
        }))
      : [];

    // Check if streaming is requested
    const enableStreaming = body.stream === true;

    logger.info('[API /mentor/chat] Processing request', { 
      messageLength: sanitized.length, 
      historyLength: sanitizedHistory.length,
      threatsDetected: threats.length,
      streaming: enableStreaming,
      requestId,
    });

    if (enableStreaming) {
      // Return streaming response
      const streamGenerator = aiMentorChatStream({
        history: sanitizedHistory,
        message: sanitized,
        userId: entitlements.uid,
        threadId: body.threadId || `thread_${Date.now()}`,
        userContext: {
          goals: entitlements.profile?.goal,
          skillLevel: entitlements.profile?.skillLevel,
          preferredTone: 'professional',
        },
        modelHint: body.modelHint || 'auto',
      });

      return createStreamingResponse(
        createSSEStream(streamGenerator, { maxDurationMs: 60000 }),
        { headers: { 'X-Request-ID': requestId } }
      ) as NextResponse;
    }

    // Non-streaming response
    const result = await withTimeout(
      aiMentorChatEnhanced({
        history: sanitizedHistory,
        message: sanitized,
        userId: entitlements.uid,
        threadId: body.threadId || `thread_${Date.now()}`,
        userContext: {
          goals: entitlements.profile?.goal,
          skillLevel: entitlements.profile?.skillLevel,
          preferredTone: 'professional',
        },
        modelHint: body.modelHint || 'auto',
      }),
      30000,
      'AI Mentor Chat'
    );
    
    logger.info('[API /mentor/chat] Response generated', { 
      requestId,
      responseLength: result.response.length,
      model: result.metadata.model,
      cost: result.metadata.cost,
      cached: result.metadata.cached,
    });

    return apiResponse({ 
      result: result.response,
      metadata: result.metadata,
    });
  },
  {
    timeout: 35000,
    rateLimit: { windowMs: 60 * 1000, maxRequests: 20 }, // Increased for streaming chunks
  }
);

export const POST = handler;
