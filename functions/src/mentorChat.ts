import * as functions from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { defineSecret, defineString } from 'firebase-functions/params';

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
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const geminiModel = defineString('GEMINI_MODEL', { default: 'gemini-1.5-flash' });

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

function buildPrompt(history: MentorMessage[], message: string): string {
  const recentHistory = history.slice(-20);
  const transcript = recentHistory
    .map((item) => `${item.role === 'user' ? 'User' : 'Mentor'}: ${item.content}`)
    .join('\n\n');

  return [
    transcript ? `Conversation history:\n${transcript}` : 'Conversation history: none yet.',
    `Current user message:\n${message}`,
  ].join('\n\n');
}

function extractResponseText(response: any): string {
  console.log('Gemini response:', JSON.stringify(response, null, 2));
  
  if (typeof response.text === 'string') {
    return response.text.trim();
  }

  if (typeof response.text === 'function') {
    return response.text().trim();
  }
  
  // Handle candidates structure
  if (response.candidates && response.candidates[0]?.content?.parts) {
    const parts = response.candidates[0].content.parts;
    return parts.map((p: any) => p.text || '').join('').trim();
  }

  return '';
}

export const mentorChat = onCall<MentorChatRequest>(
  {
    cors: true,
    maxInstances: 10,
    memory: '256MiB',
    timeoutSeconds: 30,
    secrets: [geminiApiKey],
  },
  async (request): Promise<MentorChatResponse> => {
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

    const apiKey = geminiApiKey.value();
    const modelName = geminiModel.value();
    
    console.log('MentorChat called:', { 
      userId, 
      threadId, 
      messageLength: message.length,
      modelName,
      hasApiKey: !!apiKey 
    });

    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Gemini API key is not configured. Set GEMINI_API_KEY secret in Firebase.');
    }

    try {
      const threadRef = db.collection('users').doc(userId).collection('mentorHistory').doc(threadId);
      const messagesRef = threadRef.collection('messages');
      const historySnapshot = await messagesRef.orderBy('timestamp', 'asc').limit(40).get();
      const history = historySnapshot.docs
        .map((doc) => toMentorMessage(doc.data()))
        .filter((item): item is MentorMessage => item !== null);

      const ai = new GoogleGenAI({ apiKey });
      const prompt = buildPrompt(history, message);
      console.log('Calling Gemini with model:', modelName);
      
      const result = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.7,
          maxOutputTokens: 900,
        },
      });
      
      console.log('Gemini result received:', !!result);

      const responseText = extractResponseText(result);

      if (!responseText) {
        throw new Error('Gemini returned an empty response');
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
