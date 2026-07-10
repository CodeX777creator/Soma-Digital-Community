import { aiPlatformConfig } from './config';

export type AIProviderId =
  | 'vercel-ai-gateway'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'meta'
  | 'mistral'
  | 'moonshot'
  | 'elevenlabs';

export type AIRequestTask =
  | 'mentor_chat'
  | 'strategic_advice'
  | 'roadmap_generation'
  | 'content_generation'
  | 'translation'
  | 'image_generation'
  | 'video_generation'
  | 'voice_generation'
  | 'summary'
  | 'analysis';

export type AIModality = 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'rerank';

export interface ProviderCatalogEntry {
  id: AIProviderId;
  label: string;
  kind: 'openai-compatible' | 'alias';
  baseURL?: string;
  apiKeyEnv?: string;
  supports: {
    text: boolean;
    image: boolean;
    video: boolean;
    audio: boolean;
    embeddings: boolean;
  };
}

export interface TaskCatalogEntry {
  task: AIRequestTask;
  modality: AIModality;
  preferredProvider: AIProviderId;
  preferredModel: string;
  fallbackProviders: AIProviderId[];
  fallbackModels: string[];
}

export function isProviderConfigured(providerId: AIProviderId): boolean {
  if (providerId === 'elevenlabs') {
    const value = process.env.ELEVENLABS_API_KEY;
    return typeof value === 'string' && value.trim().length > 0;
  }

  const provider = PROVIDER_CATALOG[providerId];
  if (provider.kind !== 'openai-compatible' || !provider.baseURL) return false;
  if (providerId === 'vercel-ai-gateway') {
    return typeof aiPlatformConfig.gatewayApiKey === 'string' && aiPlatformConfig.gatewayApiKey.length > 0;
  }

  if (!provider.apiKeyEnv) return false;
  const value = process.env[provider.apiKeyEnv];
  return typeof value === 'string' && value.trim().length > 0;
}

export function getConfiguredProviderOrder(): AIProviderId[] {
  return (Object.keys(PROVIDER_CATALOG) as AIProviderId[]).filter((providerId) => isProviderConfigured(providerId));
}

export const PROVIDER_CATALOG: Record<AIProviderId, ProviderCatalogEntry> = {
  'vercel-ai-gateway': {
    id: 'vercel-ai-gateway',
    label: 'Vercel AI Gateway',
    kind: 'openai-compatible',
    baseURL: aiPlatformConfig.gatewayBaseURL,
    apiKeyEnv: 'AI_GATEWAY_API_KEY',
    supports: {
      text: true,
      image: true,
      video: true,
      audio: true,
      embeddings: true,
    },
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai-compatible',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    supports: {
      text: true,
      image: true,
      video: false,
      audio: true,
      embeddings: true,
    },
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'alias',
    supports: {
      text: true,
      image: false,
      video: false,
      audio: false,
      embeddings: false,
    },
  },
  google: {
    id: 'google',
    label: 'Google',
    kind: 'alias',
    supports: {
      text: true,
      image: true,
      video: true,
      audio: true,
      embeddings: true,
    },
  },
  xai: {
    id: 'xai',
    label: 'xAI',
    kind: 'openai-compatible',
    baseURL: process.env.XAI_BASE_URL || 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
    supports: {
      text: true,
      image: false,
      video: false,
      audio: false,
      embeddings: false,
    },
  },
  meta: {
    id: 'meta',
    label: 'Meta',
    kind: 'alias',
    supports: {
      text: true,
      image: false,
      video: false,
      audio: false,
      embeddings: false,
    },
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai-compatible',
    baseURL: process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY',
    supports: {
      text: true,
      image: false,
      video: false,
      audio: false,
      embeddings: true,
    },
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot / Kimi',
    kind: 'openai-compatible',
    baseURL: process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1',
    apiKeyEnv: 'KIMI_API_KEY',
    supports: {
      text: true,
      image: false,
      video: false,
      audio: false,
      embeddings: false,
    },
  },
  elevenlabs: {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    kind: 'alias',
    apiKeyEnv: 'ELEVENLABS_API_KEY',
    supports: {
      text: false,
      image: false,
      video: false,
      audio: true,
      embeddings: false,
    },
  },
};

const textFallback = ['moonshot-kimi-k2.6', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'];

export const TASK_CATALOG: Record<AIRequestTask, TaskCatalogEntry> = {
  mentor_chat: {
    task: 'mentor_chat',
    modality: 'text',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_MENTOR_CHAT || 'gpt-4.1',
    fallbackProviders: ['moonshot'],
    fallbackModels: textFallback,
  },
  strategic_advice: {
    task: 'strategic_advice',
    modality: 'text',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_STRATEGIC_ADVICE || 'gpt-4.1',
    fallbackProviders: ['moonshot'],
    fallbackModels: textFallback,
  },
  roadmap_generation: {
    task: 'roadmap_generation',
    modality: 'text',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_ROADMAP || 'gpt-4.1',
    fallbackProviders: ['moonshot'],
    fallbackModels: textFallback,
  },
  content_generation: {
    task: 'content_generation',
    modality: 'text',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_CONTENT || 'claude-sonnet-4',
    fallbackProviders: ['moonshot'],
    fallbackModels: textFallback,
  },
  translation: {
    task: 'translation',
    modality: 'text',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_TRANSLATION || 'gemini-2.5-pro',
    fallbackProviders: ['google', 'moonshot'],
    fallbackModels: ['gemini-2.5-flash', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  },
  image_generation: {
    task: 'image_generation',
    modality: 'image',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_IMAGE || 'imagen-3.0',
    fallbackProviders: ['google'],
    fallbackModels: ['imagen-3.0-fast', 'image-fallback'],
  },
  video_generation: {
    task: 'video_generation',
    modality: 'video',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_VIDEO || 'veo-3',
    fallbackProviders: ['google'],
    fallbackModels: ['veo-3-fast', 'video-fallback'],
  },
  voice_generation: {
    task: 'voice_generation',
    modality: 'audio',
    preferredProvider: 'elevenlabs',
    preferredModel: process.env.AI_MODEL_VOICE || 'eleven_multilingual_v2',
    fallbackProviders: ['elevenlabs'],
    fallbackModels: ['eleven_turbo_v2', 'voice-fallback'],
  },
  summary: {
    task: 'summary',
    modality: 'text',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_SUMMARY || 'gpt-4.1-mini',
    fallbackProviders: ['moonshot'],
    fallbackModels: ['moonshot-v1-32k', 'moonshot-v1-8k'],
  },
  analysis: {
    task: 'analysis',
    modality: 'text',
    preferredProvider: 'vercel-ai-gateway',
    preferredModel: process.env.AI_MODEL_ANALYSIS || 'gpt-4.1',
    fallbackProviders: ['moonshot'],
    fallbackModels: textFallback,
  },
};
