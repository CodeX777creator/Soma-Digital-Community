import * as functions from 'firebase-functions';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';

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

function getFunctionsConfigValue(path: string, envKey: string): string {
  let value: unknown = undefined;

  try {
    const configFn = (functions as unknown as {
      config?: () => Record<string, unknown>;
    }).config;
    const config = typeof configFn === 'function' ? configFn() : {};
    value = path
      .split('.')
      .reduce<unknown>((acc, part) => {
        if (acc && typeof acc === 'object' && part in acc) {
          return (acc as Record<string, unknown>)[part];
        }
        return undefined;
      }, config);
  } catch {
    value = undefined;
  }

  return typeof value === 'string' && value.length > 0
    ? value
    : process.env[envKey] || '';
}

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

function extractResponseText(response: { text?: string | (() => string) }): string {
  if (typeof response.text === 'string') {
    return response.text.trim();
  }

  if (typeof response.text === 'function') {
    return response.text().trim();
  }

  return '';
}

export const mentorChat = onCall<MentorChatRequest>(
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

    const apiKey = getFunctionsConfigValue('gemini.api_key', 'GEMINI_API_KEY');

    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Gemini API key is not configured');
    }

    try {
      const threadRef = db.collection('users').doc(userId).collection('mentorHistory').doc(threadId);
      const messagesRef = threadRef.collection('messages');
      const historySnapshot = await messagesRef.orderBy('timestamp', 'asc').limit(40).get();
      const history = historySnapshot.docs
        .map((doc) => toMentorMessage(doc.data()))
        .filter((item): item is MentorMessage => item !== null);

      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        contents: buildPrompt(history, message),
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.7,
          maxOutputTokens: 900,
        },
      });

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
    } catch (error) {
      console.error('mentorChat failed:', error);
      throw new HttpsError('internal', 'The AI mentor could not respond right now. Please try again.');
    }
  }
);
