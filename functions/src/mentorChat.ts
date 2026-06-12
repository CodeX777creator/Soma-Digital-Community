import * as functions from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import OpenAI from 'openai';
import { defineSecret } from 'firebase-functions/params';

/**
 * @deprecated This Firebase Function is deprecated. Use the Next.js API route /api/mentor/chat instead.
 * The API route uses the Genkit smart router with automatic model tier selection and fallback.
 * To be removed in a future release.
 */

interface MentorChatRequest {
  message: string;
  threadId: string;
  userId: string;
}

interface MentorChatResponse {
  response: string;
  messageId: string;
}

interface MentorMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: unknown;
}

const SYSTEM_PROMPT =
  'You are an expert business mentor and startup advisor. Help users with strategy, marketing, product development, and scaling. Be concise and actionable.';

const db = getFirestore();

// Define params
const kimiApiKey = defineSecret('KIMI_API_KEY');

function assertMentorChatRequest(data: Partial<MentorChatRequest>): asserts data is MentorChatRequest {
  if (typeof data.message !== 'string' || data.message.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Message is required');
  }

  if (typeof data.threadId !== 'string' || data.threadId.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'Thread ID is required');
  }

  if (typeof data.userId !== 'string' || data.userId.trim().length === 0) {
    throw new HttpsError('invalid-argument', 'User ID is required');
  }
}

function toMentorMessage(data: FirebaseFirestore.DocumentData): MentorMessage | null {
  const role = data.role;
  const content = data.content;

  if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
    return null;
  }

  return {
    role,
    content,
    timestamp: data.timestamp,
  };
}

/**
 * @deprecated Use /api/mentor/chat instead. This function will be removed in a future release.
 */
export const mentorChat = onCall<MentorChatRequest>(
  {
    cors: ['https://soma-digital-community.vercel.app', 'http://localhost:3000'],
    maxInstances: 10,
    memory: '256MiB',
    timeoutSeconds: 30,
    secrets: [kimiApiKey],
  },
  async (request): Promise<MentorChatResponse> => {
    console.warn('[DEPRECATED] mentorChat Firebase Function is deprecated. Use /api/mentor/chat instead.');
    
    const data = request.data as Partial<MentorChatRequest>;
    const authUid = request.auth?.uid;

    if (!authUid) {
      throw new HttpsError('unauthenticated', 'Please sign in to use the AI mentor');
    }

    assertMentorChatRequest(data);

    const message = data.message.trim();
    const threadId = data.threadId.trim();
    const userId = data.userId.trim();

    if (authUid !== userId) {
      throw new HttpsError('permission-denied', 'You can only chat in your own mentor threads');
    }

    const apiKey = kimiApiKey.value();
    
    console.log('MentorChat called:', { 
      userId, 
      threadId, 
      messageLength: message.length,
      hasApiKey: !!apiKey 
    });

    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Kimi API key is not configured. Set KIMI_API_KEY secret in Firebase.');
    }

    try {
      const threadRef = db.collection('users').doc(userId).collection('mentorHistory').doc(threadId);
      const messagesRef = threadRef.collection('messages');
      const historySnapshot = await messagesRef.orderBy('timestamp', 'asc').limit(40).get();
      const history = historySnapshot.docs
        .map((doc) => toMentorMessage(doc.data()))
        .filter((item): item is MentorMessage => item !== null);

      // Initialize Kimi (Moonshot AI) client
      const kimi = new OpenAI({
        apiKey,
        baseURL: 'https://api.moonshot.cn/v1',
      });

      // Build messages array for Kimi
      const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      // Add conversation history
      for (const item of history) {
        messages.push({
          role: item.role,
          content: item.content,
        });
      }

      // Add current message
      messages.push({
        role: 'user',
        content: message,
      });

      console.log('Calling Kimi API with', messages.length, 'messages');
      
      const completion = await kimi.chat.completions.create({
        model: 'moonshot-v1-8k',
        messages,
        temperature: 0.7,
        max_tokens: 900,
      });
      
      console.log('Kimi result received:', !!completion);

      const responseText = completion.choices[0]?.message?.content?.trim();

      if (!responseText) {
        throw new Error('Kimi returned an empty response');
      }

      const responseDoc = await messagesRef.add({
        role: 'assistant',
        content: responseText,
        timestamp: Timestamp.now(),
        type: 'text',
      });

      await threadRef.set(
        {
          title: message.slice(0, 60) || 'Mentor conversation',
          lastUpdated: Timestamp.now(),
          userId,
        },
        { merge: true }
      );

      return {
        response: responseText,
        messageId: responseDoc.id,
      };
    } catch (error: any) {
      console.error('mentorChat failed:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        status: error?.status,
        stack: error?.stack,
      });
      
      // Provide more specific error messages for common issues
      if (error?.message?.includes('API key') || error?.message?.includes('authentication')) {
        throw new HttpsError('failed-precondition', 'AI service authentication failed. Please contact support.');
      }
      if (error?.message?.includes('model') || error?.message?.includes('not found')) {
        throw new HttpsError('failed-precondition', 'AI model configuration error. Please contact support.');
      }
      if (error?.message?.includes('quota') || error?.message?.includes('rate limit')) {
        throw new HttpsError('resource-exhausted', 'AI service quota exceeded. Please try again later.');
      }
      if (error?.message?.includes('billing')) {
        throw new HttpsError('failed-precondition', 'AI service billing issue. Please contact support.');
      }
      
      throw new HttpsError('internal', `AI mentor error: ${error?.message || 'Unknown error'}`);
    }
  }
);
