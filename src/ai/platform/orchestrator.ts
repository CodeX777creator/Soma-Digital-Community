import { aiPlatformConfig } from './config';
import {
  PROVIDER_CATALOG,
  TASK_CATALOG,
  getConfiguredProviderOrder,
  isProviderConfigured,
  type AIProviderId,
  type AIRequestTask,
  type AIModality,
} from './catalog';
import { selectModel } from '@/ai/core/model-router';

export type AIQualityMode = 'economy' | 'balanced' | 'premium' | 'cinematic' | 'auto';
export type AIExecutionStrategy = 'gateway' | 'direct' | 'queued';

export interface OrchestrationContext {
  task: AIRequestTask;
  qualityMode?: AIQualityMode;
  userTier?: 'free' | 'explorer' | 'pro' | 'elite';
  providerPreference?: AIProviderId;
  allowGatewayFallback?: boolean;
  message?: string;
  history?: string[];
}

export interface OrchestrationPlan {
  providerId: AIProviderId;
  modelId: string;
  fallbackPlans: Array<{ providerId: AIProviderId; modelId: string }>;
  modality: AIModality;
  qualityMode: AIQualityMode;
  executionStrategy: AIExecutionStrategy;
  reason: string;
  task: AIRequestTask;
}

const TASK_PRIORITY_MODELS: Record<AIRequestTask, Record<Exclude<AIQualityMode, 'auto'>, { providerId: AIProviderId; modelId: string }>> = {
  mentor_chat: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1-mini' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
  },
  strategic_advice: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1-mini' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
  },
  roadmap_generation: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1-mini' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
  },
  content_generation: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'claude-3.5-haiku' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'claude-sonnet-4' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'claude-sonnet-4' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'claude-sonnet-4' },
  },
  translation: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'gemini-2.5-flash' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'gemini-2.5-pro' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'gemini-2.5-pro' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'gemini-2.5-pro' },
  },
  image_generation: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'imagen-3.0-fast' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'imagen-3.0' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'imagen-3.0' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'imagen-3.0' },
  },
  video_generation: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'veo-3-fast' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'veo-3' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'veo-3' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'veo-3' },
  },
  voice_generation: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'elevenlabs-turbo-v2' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'elevenlabs-v2' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'elevenlabs-v2' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'elevenlabs-v2' },
  },
  summary: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1-mini' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1-mini' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
  },
  analysis: {
    economy: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1-mini' },
    balanced: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    premium: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
    cinematic: { providerId: 'vercel-ai-gateway', modelId: 'gpt-4.1' },
  },
};

function normalizeQualityMode(mode?: AIQualityMode): Exclude<AIQualityMode, 'auto'> {
  return mode && mode !== 'auto' ? mode : aiPlatformConfig.defaultQualityMode === 'economy'
    ? 'economy'
    : aiPlatformConfig.defaultQualityMode === 'premium'
      || aiPlatformConfig.defaultQualityMode === 'cinematic'
        ? 'premium'
      : 'balanced';
}

function selectDirectFallback(task: AIRequestTask, qualityMode: Exclude<AIQualityMode, 'auto'>): { providerId: AIProviderId; modelId: string } {
  if (task === 'voice_generation' && isProviderConfigured('elevenlabs')) {
    return {
      providerId: 'elevenlabs',
      modelId: qualityMode === 'economy' ? 'eleven_turbo_v2' : 'eleven_multilingual_v2',
    };
  }

  if (isProviderConfigured('openai')) {
    if (task === 'content_generation') {
      return { providerId: 'openai', modelId: qualityMode === 'economy' ? 'gpt-4.1-mini' : 'gpt-4.1' };
    }

    if (task === 'translation') {
      return { providerId: 'openai', modelId: qualityMode === 'economy' ? 'gpt-4.1-mini' : 'gpt-4.1' };
    }

    return { providerId: 'openai', modelId: qualityMode === 'economy' ? 'gpt-4.1-mini' : 'gpt-4.1' };
  }

  return {
    providerId: 'moonshot',
    modelId: qualityMode === 'economy' ? 'moonshot-v1-8k' : qualityMode === 'premium' ? 'kimi-k2.6' : 'moonshot-v1-32k',
  };
}

function buildFallbackPlans(task: AIRequestTask, qualityMode: Exclude<AIQualityMode, 'auto'>): Array<{ providerId: AIProviderId; modelId: string }> {
  const fallbackPlans: Array<{ providerId: AIProviderId; modelId: string }> = [];

  if (isProviderConfigured('vercel-ai-gateway')) {
    const taskModel = TASK_PRIORITY_MODELS[task][qualityMode];
    const gatewayFallback = qualityMode === 'economy'
      ? taskModel.modelId
      : TASK_PRIORITY_MODELS[task].balanced.modelId;
    fallbackPlans.push({
      providerId: 'vercel-ai-gateway',
      modelId: gatewayFallback,
    });
  }

  const directFallback = selectDirectFallback(task, qualityMode);
  fallbackPlans.push(directFallback);

  if (qualityMode !== 'economy' && directFallback.providerId === 'moonshot') {
    fallbackPlans.push({ providerId: 'moonshot', modelId: 'moonshot-v1-8k' });
  }

  return fallbackPlans;
}

export function orchestrateAIRequest(context: OrchestrationContext): OrchestrationPlan {
  const qualityMode = normalizeQualityMode(context.qualityMode);
  const taskModels = TASK_PRIORITY_MODELS[context.task];
  const classified = selectModel(
    context.message || '',
    {
      budgetMode: qualityMode === 'economy' ? 'strict' : qualityMode === 'premium' ? 'performance' : 'balanced',
      userTier: context.userTier === 'elite' ? 'elite' : context.userTier === 'pro' ? 'pro' : 'explorer',
      history: context.history,
    }
  );

  const preferred = taskModels[qualityMode];
  const directFallback = selectDirectFallback(context.task, qualityMode);
  const providerMode = aiPlatformConfig.providerMode;
  const preferredProviderConfigured = context.providerPreference && isProviderConfigured(context.providerPreference)
    ? context.providerPreference
    : null;
  const gatewayConfigured = isProviderConfigured('vercel-ai-gateway');
  const providerId =
    providerMode === 'direct'
      ? directFallback.providerId
      : preferredProviderConfigured
        || (providerMode === 'gateway' && gatewayConfigured ? preferred.providerId : null)
        || (gatewayConfigured ? preferred.providerId : null)
        || directFallback.providerId;

  const modelId = providerId === preferred.providerId
    ? preferred.modelId
    : directFallback.modelId;

  const fallbackPlans = buildFallbackPlans(context.task, qualityMode).filter((candidate, index, self) => (
    self.findIndex((item) => item.providerId === candidate.providerId && item.modelId === candidate.modelId) === index
  ));

  return {
    providerId,
    modelId,
    fallbackPlans,
    modality: TASK_CATALOG[context.task].modality,
    qualityMode,
    executionStrategy: providerId === 'vercel-ai-gateway' ? 'gateway' : 'direct',
    reason: `${context.task} routed to ${providerId}/${modelId} (${classified.reasoning})`,
    task: context.task,
  };
}
