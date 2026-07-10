import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  PROVIDER_CATALOG,
  type AIProviderId,
  type AIRequestTask,
} from './catalog';
import { orchestrateAIRequest, type AIQualityMode } from './orchestrator';
import { aiPlatformConfig } from './config';

export interface PlatformMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIExecutionPlan {
  providerId: AIProviderId;
  modelId: string;
  fallbackPlans: Array<{ providerId: AIProviderId; modelId: string }>;
  reason: string;
  modality: 'text' | 'image' | 'video' | 'audio' | 'embedding' | 'rerank';
}

export interface AITextRequest {
  messages: Array<{ role: string; content: unknown }>;
  task?: AIRequestTask;
  userId?: string;
  userTier?: 'free' | 'explorer' | 'pro' | 'elite';
  modelHint?: 'cheap' | 'smart' | 'auto';
  qualityMode?: AIQualityMode;
  providerPreference?: AIProviderId;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface AITextResponse {
  text: string;
  plan: AIExecutionPlan;
  durationMs: number;
}

export interface AIImageRequest {
  prompt: string;
  task?: AIRequestTask;
  userId?: string;
  userTier?: 'free' | 'explorer' | 'pro' | 'elite';
  qualityMode?: AIQualityMode;
  providerPreference?: AIProviderId;
  aspectRatio?: '1:1' | '4:5' | '16:9' | '9:16' | '3:2' | '2:3';
  size?: '1024x1024' | '1024x1792' | '1792x1024';
  stylePreset?: string;
  negativePrompt?: string;
}

export interface AIImageResponse {
  plan: AIExecutionPlan;
  durationMs: number;
  imageBuffer: Buffer;
  mimeType: string;
  base64?: string;
  sourceUrl?: string;
}

export interface AIVideoRequest {
  prompt: string;
  task?: AIRequestTask;
  userId?: string;
  userTier?: 'free' | 'explorer' | 'pro' | 'elite';
  qualityMode?: AIQualityMode;
  providerPreference?: AIProviderId;
  aspectRatio?: '1:1' | '4:5' | '16:9' | '9:16' | '3:2' | '2:3';
  durationSeconds?: number;
  stylePreset?: string;
  negativePrompt?: string;
  captionsEnabled?: boolean;
  voiceoverScript?: string;
  renderNotes?: string;
}

export interface AIVideoResponse {
  plan: AIExecutionPlan;
  durationMs: number;
  videoBuffer?: Buffer;
  mimeType: string;
  base64?: string;
  sourceUrl?: string;
  jobId?: string;
  raw?: unknown;
}

export interface AIAudioRequest {
  prompt: string;
  task?: AIRequestTask;
  userId?: string;
  userTier?: 'free' | 'explorer' | 'pro' | 'elite';
  qualityMode?: AIQualityMode;
  providerPreference?: AIProviderId;
  voiceId?: string;
  voicePreset?: string;
  language?: string;
  narrationText: string;
  secondaryVoiceId?: string;
  speed?: number;
  stability?: number;
  similarityBoost?: number;
}

export interface AIAudioResponse {
  plan: AIExecutionPlan;
  durationMs: number;
  audioBuffer?: Buffer;
  mimeType: string;
  base64?: string;
  sourceUrl?: string;
  jobId?: string;
  raw?: unknown;
  voiceId?: string;
}

const clientCache = new Map<AIProviderId, OpenAI>();

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function getApiKey(providerId: AIProviderId): string | undefined {
  if (providerId === 'vercel-ai-gateway') {
    return aiPlatformConfig.gatewayApiKey;
  }

  if (providerId === 'elevenlabs') {
    const value = process.env.ELEVENLABS_API_KEY;
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  const apiKeyEnv = PROVIDER_CATALOG[providerId].apiKeyEnv;
  if (!apiKeyEnv) return undefined;

  const value = process.env[apiKeyEnv];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getProviderClient(providerId: AIProviderId): OpenAI {
  const cached = clientCache.get(providerId);
  if (cached) return cached;

  const provider = PROVIDER_CATALOG[providerId];
  if (provider.kind !== 'openai-compatible' || !provider.baseURL) {
    throw new Error(`Provider ${provider.label} is not configured for direct text execution`);
  }

  const apiKey = getApiKey(providerId);
  if (!apiKey) {
    throw new Error(`Missing API key for ${provider.label}`);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: provider.baseURL,
  });

  clientCache.set(providerId, client);
  return client;
}

export function createTextClient(providerId: AIProviderId): OpenAI {
  return getProviderClient(providerId);
}

export function createImageClient(providerId: AIProviderId): OpenAI {
  return getProviderClient(providerId);
}

export function resolveAIExecutionPlan(request: AITextRequest): AIExecutionPlan {
  const task = request.task || 'mentor_chat';
  const qualityMode: AIQualityMode = request.qualityMode
    || (request.modelHint === 'cheap' ? 'economy' : request.modelHint === 'smart' ? 'premium' : aiPlatformConfig.defaultQualityMode);

  const plan = orchestrateAIRequest({
    task,
    qualityMode,
    userTier: request.userTier,
    providerPreference: request.providerPreference,
    message: request.messages.map((message) => normalizeMessageContent(message.content)).join('\n'),
    history: request.messages.slice(0, -1).map((message) => normalizeMessageContent(message.content)),
  });

  return {
    providerId: plan.providerId,
    modelId: plan.modelId,
    fallbackPlans: plan.fallbackPlans,
    reason: plan.reason,
    modality: plan.modality,
  };
}

export async function executeTextCompletion(request: AITextRequest): Promise<AITextResponse> {
  const startTime = Date.now();
  const plan = resolveAIExecutionPlan(request);

  const client = getProviderClient(plan.providerId);
  const normalizedMessages: ChatCompletionMessageParam[] = request.messages.map((message) => ({
    role: message.role === 'system' || message.role === 'assistant' ? message.role : 'user',
    content: normalizeMessageContent(message.content),
  })) as ChatCompletionMessageParam[];

  const completion = await client.chat.completions.create({
    model: plan.modelId,
    messages: normalizedMessages,
    temperature: request.temperature ?? 0.7,
    top_p: request.topP ?? 0.9,
    max_tokens: request.maxOutputTokens ?? 2048,
    ...(request.stopSequences && request.stopSequences.length > 0 ? { stop: request.stopSequences } : {}),
  });

  const text = completion.choices[0]?.message?.content || '';
  if (!text) {
    throw new Error('AI Gateway returned an empty response');
  }

  return {
    text,
    plan,
    durationMs: Date.now() - startTime,
  };
}

export async function createTextStream(request: AITextRequest) {
  const plan = resolveAIExecutionPlan(request);
  const client = getProviderClient(plan.providerId);
  const normalizedMessages: ChatCompletionMessageParam[] = request.messages.map((message) => ({
    role: message.role === 'system' || message.role === 'assistant' ? message.role : 'user',
    content: normalizeMessageContent(message.content),
  })) as ChatCompletionMessageParam[];

  return client.chat.completions.create({
    model: plan.modelId,
    messages: normalizedMessages,
    temperature: request.temperature ?? 0.7,
    top_p: request.topP ?? 0.9,
    max_tokens: request.maxOutputTokens ?? 2048,
    stream: true,
    ...(request.stopSequences && request.stopSequences.length > 0 ? { stop: request.stopSequences } : {}),
  });
}

function resolveImageSize(request: Pick<AIImageRequest, 'aspectRatio' | 'size'>): NonNullable<AIImageRequest['size']> {
  if (request.size) return request.size;

  switch (request.aspectRatio) {
    case '16:9':
    case '3:2':
      return '1792x1024';
    case '9:16':
    case '4:5':
    case '2:3':
      return '1024x1792';
    case '1:1':
    default:
      return '1024x1024';
  }
}

function resolveVideoResolution(request: Pick<AIVideoRequest, 'aspectRatio'>): string {
  switch (request.aspectRatio) {
    case '16:9':
    case '3:2':
      return '1792x1024';
    case '9:16':
    case '4:5':
    case '2:3':
      return '1024x1792';
    case '1:1':
    default:
      return '1024x1024';
  }
}

async function readImagePayload(response: any): Promise<{ buffer: Buffer; mimeType: string; base64?: string; sourceUrl?: string }> {
  const first = response?.data?.[0] || response?.output?.[0] || response?.images?.[0] || response?.result?.[0];

  const base64 = first?.b64_json || first?.base64 || first?.image_base64 || first?.imageBase64;
  if (typeof base64 === 'string' && base64.length > 0) {
    const mimeType = typeof first?.mime_type === 'string'
      ? first.mime_type
      : typeof first?.content_type === 'string'
        ? first.content_type
        : 'image/png';
    return {
      buffer: Buffer.from(base64, 'base64'),
      mimeType,
      base64,
    };
  }

  const sourceUrl = typeof first?.url === 'string'
    ? first.url
    : typeof first?.image_url === 'string'
      ? first.image_url
      : typeof first?.imageUrl === 'string'
        ? first.imageUrl
        : undefined;

  if (sourceUrl) {
    const downloaded = await fetch(sourceUrl);
    if (!downloaded.ok) {
      throw new Error(`Failed to download generated image (${downloaded.status})`);
    }

    const arrayBuffer = await downloaded.arrayBuffer();
    const mimeType = downloaded.headers.get('content-type') || 'image/png';
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType,
      sourceUrl,
    };
  }

  throw new Error('AI image generation returned no image payload');
}

export async function executeImageGeneration(request: AIImageRequest): Promise<AIImageResponse> {
  const startTime = Date.now();
  const task = request.task || 'image_generation';
  const qualityMode = request.qualityMode || aiPlatformConfig.defaultQualityMode;
  const plan = orchestrateAIRequest({
    task,
    qualityMode,
    userTier: request.userTier,
    providerPreference: request.providerPreference,
    message: request.prompt,
    history: [],
  });

  const client = getProviderClient(plan.providerId);
  const imageResponse = await (client as any).images.generate({
    model: plan.modelId,
    prompt: request.prompt,
    size: resolveImageSize(request),
    n: 1,
    ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
  });

  const payload = await readImagePayload(imageResponse);
  return {
    plan,
    durationMs: Date.now() - startTime,
    imageBuffer: payload.buffer,
    mimeType: payload.mimeType,
    ...(payload.base64 ? { base64: payload.base64 } : {}),
    ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
  };
}

async function readVideoPayload(response: Response): Promise<{ buffer?: Buffer; mimeType: string; base64?: string; sourceUrl?: string; jobId?: string; raw?: unknown }> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('video/')) {
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: contentType,
    };
  }

  if (contentType.includes('application/json') || contentType.includes('text/json') || contentType.includes('+json')) {
    const raw = await response.json();
    const payload = raw as Record<string, any>;
    const first = payload?.data?.[0] || payload?.output?.[0] || payload?.videos?.[0] || payload?.result?.[0] || payload;
    const base64 = first?.b64_json || first?.base64 || first?.video_base64 || first?.videoBase64;
    if (typeof base64 === 'string' && base64.length > 0) {
      return {
        buffer: Buffer.from(base64, 'base64'),
        mimeType: first?.mime_type || first?.content_type || 'video/mp4',
        base64,
        raw,
      };
    }

    const sourceUrl = typeof first?.url === 'string'
      ? first.url
      : typeof first?.video_url === 'string'
        ? first.video_url
        : typeof first?.videoUrl === 'string'
          ? first.videoUrl
          : typeof first?.download_url === 'string'
            ? first.download_url
            : undefined;

    if (sourceUrl) {
      return {
        mimeType: first?.mime_type || first?.content_type || 'video/mp4',
        sourceUrl,
        jobId: typeof first?.id === 'string' ? first.id : typeof payload?.id === 'string' ? payload.id : undefined,
        raw,
      };
    }

    return {
      mimeType: first?.mime_type || first?.content_type || 'application/json',
      jobId: typeof first?.id === 'string' ? first.id : typeof payload?.id === 'string' ? payload.id : undefined,
      raw,
    };
  }

  const rawText = await response.text();
  return {
    mimeType: contentType || 'application/octet-stream',
    raw: rawText,
  };
}

function resolveVoiceVoiceId(request: AIAudioRequest): string {
  return request.voiceId
    || process.env.ELEVENLABS_VOICE_ID
    || process.env.AI_VOICE_ID
    || '21m00Tcm4TlvDq8ikWAM';
}

function resolveAudioModel(request: AIAudioRequest): string {
  return process.env.ELEVENLABS_MODEL_ID
    || process.env.AI_MODEL_VOICE
    || 'eleven_multilingual_v2';
}

async function readAudioPayload(response: Response): Promise<{ buffer?: Buffer; mimeType: string; base64?: string; sourceUrl?: string; jobId?: string; raw?: unknown }> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('audio/')) {
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: contentType,
    };
  }

  if (contentType.includes('application/json') || contentType.includes('text/json') || contentType.includes('+json')) {
    const raw = await response.json();
    const payload = raw as Record<string, any>;
    const first = payload?.data?.[0] || payload?.output?.[0] || payload?.audios?.[0] || payload?.result?.[0] || payload;
    const base64 = first?.b64_json || first?.base64 || first?.audio_base64 || first?.audioBase64;
    if (typeof base64 === 'string' && base64.length > 0) {
      return {
        buffer: Buffer.from(base64, 'base64'),
        mimeType: first?.mime_type || first?.content_type || 'audio/mpeg',
        base64,
        raw,
      };
    }

    const sourceUrl = typeof first?.url === 'string'
      ? first.url
      : typeof first?.audio_url === 'string'
        ? first.audio_url
        : typeof first?.audioUrl === 'string'
          ? first.audioUrl
          : typeof first?.download_url === 'string'
            ? first.download_url
            : undefined;

    if (sourceUrl) {
      return {
        mimeType: first?.mime_type || first?.content_type || 'audio/mpeg',
        sourceUrl,
        jobId: typeof first?.id === 'string' ? first.id : typeof payload?.id === 'string' ? payload.id : undefined,
        raw,
      };
    }

    return {
      mimeType: first?.mime_type || first?.content_type || 'application/json',
      jobId: typeof first?.id === 'string' ? first.id : typeof payload?.id === 'string' ? payload.id : undefined,
      raw,
    };
  }

  const rawText = await response.text();
  return {
    mimeType: contentType || 'application/octet-stream',
    raw: rawText,
  };
}

async function postToElevenLabsAudioEndpoint(
  voiceId: string,
  body: Record<string, unknown>
): Promise<Response> {
  const baseURL = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1';
  const apiKey = getApiKey('elevenlabs');
  if (!apiKey) {
    throw new Error('Missing API key for ElevenLabs');
  }

  const url = `${baseURL.replace(/\/$/, '')}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg, application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function executeAudioGeneration(request: AIAudioRequest): Promise<AIAudioResponse> {
  const startTime = Date.now();
  const plan = orchestrateAIRequest({
    task: request.task || 'voice_generation',
    qualityMode: request.qualityMode || aiPlatformConfig.defaultQualityMode,
    userTier: request.userTier,
    providerPreference: request.providerPreference as AIProviderId | undefined,
    message: request.prompt,
    history: [],
  });

  const voiceId = resolveVoiceVoiceId(request);
  const modelId = resolveAudioModel(request);
  const requestBody = {
    text: request.narrationText,
    model_id: modelId,
    voice_settings: {
      stability: request.stability ?? 0.45,
      similarity_boost: request.similarityBoost ?? 0.8,
      style: 0.35,
      use_speaker_boost: true,
    },
  };

  const response = await postToElevenLabsAudioEndpoint(voiceId, requestBody);
  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`Audio generation failed (${response.status}): ${bodyText || response.statusText}`);
  }

  const payload = await readAudioPayload(response);
  return {
    plan,
    durationMs: Date.now() - startTime,
    ...(payload.buffer ? { audioBuffer: payload.buffer } : {}),
    mimeType: payload.mimeType,
    ...(payload.base64 ? { base64: payload.base64 } : {}),
    ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
    ...(payload.jobId ? { jobId: payload.jobId } : {}),
    ...(payload.raw !== undefined ? { raw: payload.raw } : {}),
    voiceId,
  };
}

async function postToProviderVideoEndpoint(
  providerId: AIProviderId,
  path: string,
  body: Record<string, unknown>
): Promise<Response> {
  const provider = PROVIDER_CATALOG[providerId];
  if (provider.kind !== 'openai-compatible' || !provider.baseURL) {
    throw new Error(`Provider ${provider.label} does not support direct video generation`);
  }

  const apiKey = getApiKey(providerId);
  if (!apiKey) {
    throw new Error(`Missing API key for ${provider.label}`);
  }

  const baseURL = provider.baseURL.endsWith('/') ? provider.baseURL : `${provider.baseURL}/`;
  return fetch(`${baseURL}${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

export async function executeVideoGeneration(request: AIVideoRequest): Promise<AIVideoResponse> {
  const startTime = Date.now();
  const plan = orchestrateAIRequest({
    task: request.task || 'video_generation',
    qualityMode: request.qualityMode || aiPlatformConfig.defaultQualityMode,
    userTier: request.userTier,
    providerPreference: request.providerPreference,
    message: request.prompt,
    history: [],
  });

  const requestBody = {
    model: plan.modelId,
    prompt: request.prompt,
    resolution: resolveVideoResolution(request),
    duration_seconds: request.durationSeconds || 10,
    negative_prompt: request.negativePrompt,
    captions_enabled: request.captionsEnabled ?? true,
    voiceover_script: request.voiceoverScript,
    render_notes: request.renderNotes,
    style: request.stylePreset,
  };

  const endpointCandidates = ['videos/generations', 'video/generations'];
  let lastError: Error | null = null;

  for (const endpoint of endpointCandidates) {
    try {
      const response = await postToProviderVideoEndpoint(plan.providerId, endpoint, requestBody);
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        const error = new Error(`Video generation request failed (${response.status}): ${bodyText || response.statusText}`);
        if (response.status === 404 || response.status === 405) {
          lastError = error;
          continue;
        }
        throw error;
      }

      const payload = await readVideoPayload(response);
      return {
        plan,
        durationMs: Date.now() - startTime,
        ...(payload.buffer ? { videoBuffer: payload.buffer } : {}),
        mimeType: payload.mimeType,
        ...(payload.base64 ? { base64: payload.base64 } : {}),
        ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
        ...(payload.jobId ? { jobId: payload.jobId } : {}),
        ...(payload.raw !== undefined ? { raw: payload.raw } : {}),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('Video generation failed');
}
