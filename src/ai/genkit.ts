import { genkit } from 'genkit';
import { executeMonetizedTextRequest } from '@/services/ai-platform';

const MODEL_TIERS = {
  SIMPLE: { id: 'moonshot-v1-8k', temp: 0.7, maxTokens: 512, costRank: 1 },
  BALANCED: { id: 'moonshot-v1-32k', temp: 0.7, maxTokens: 1024, costRank: 2 },
  STANDARD: { id: 'moonshot-v1-128k', temp: 0.7, maxTokens: 2048, costRank: 3 },
  SMART: { id: 'kimi-k2.5', temp: 1.0, maxTokens: 2048, costRank: 4 },
  MAX: { id: 'kimi-k2.6', temp: 0.7, maxTokens: 4096, costRank: 5 },
} as const;

const BUDGET_MODE = (process.env.KIMI_BUDGET_MODE || 'balanced') as 'strict' | 'balanced' | 'performance';

function normalizeMessages(messages: any[]) {
  return messages.map((message) => {
    const content = Array.isArray(message.content)
      ? message.content
          .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
          .join('')
      : message.content;

    return {
      role: message.role === 'system' || message.role === 'assistant' ? message.role : 'user',
      content,
    };
  });
}

async function generateWithAIPlatform(request: any) {
  const normalizedMessages = normalizeMessages(request.messages);
  const userId = request.config?.userId;
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Genkit AI requests require an authenticated userId for Creator Credit enforcement.');
  }

  const userTier = request.config?.userTier || 'pro';
  const result = await executeMonetizedTextRequest({
    task: 'mentor_chat',
    messages: normalizedMessages,
    userId,
    modelHint: request.config?.modelHint,
    qualityMode: request.config?.modelHint === 'cheap' ? 'economy' : request.config?.modelHint === 'smart' ? 'premium' : 'balanced',
    maxOutputTokens: request.config?.maxOutputTokens,
    topP: request.config?.topP,
    stopSequences: request.config?.stopSequences,
    userTier,
  }, {
    userId,
    task: 'mentor_chat',
    feature: 'mentor_chat',
    modality: 'text',
    message: normalizedMessages.map((message) => message.content).join('\n').slice(0, 2048),
    userTier,
    providerMode: 'hybrid',
    allowByok: true,
    requestId: `genkit_${Date.now()}`,
  });

  return {
    message: {
      role: 'model' as const,
      content: [{ text: result.text }],
    },
    custom: {
      modelUsed: result.plan.modelId,
      providerUsed: result.plan.providerId,
      reason: result.plan.reason,
      durationMs: result.durationMs,
    },
  };
}

const kimiModelInfo = {
  apiVersion: 'v2' as const,
  name: 'sdc-ai',
  label: 'SDC AI Gateway',
  supports: {
    multimodal: false,
    tools: false,
    systemRole: true,
  },
};

export const ai = genkit({ model: 'sdc-ai' });
ai.defineModel(kimiModelInfo, generateWithAIPlatform as any);

export const KIMI_MODELS = {
  FLASH: MODEL_TIERS.SIMPLE.id,
  BALANCED: MODEL_TIERS.BALANCED.id,
  STANDARD: MODEL_TIERS.STANDARD.id,
  SMART: MODEL_TIERS.SMART.id,
  PREMIUM: MODEL_TIERS.MAX.id,
} as const;

export { MODEL_TIERS, BUDGET_MODE };
