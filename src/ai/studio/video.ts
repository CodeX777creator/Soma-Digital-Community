import { createHash } from 'crypto';
import { admin, adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/logger';
import { sanitizeString } from '@/lib/security';
import { detectInjection } from '@/ai/guardrails';
import { estimateTokenCount } from '@/ai/core/tokenizer';
import { recordUsage } from '@/ai/analytics';
import { extractJsonObject } from '@/ai/platform';
import { executeMonetizedTextRequest, executeMonetizedVideoRequest, normalizeRoutingPlan } from '@/services/ai-platform';
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_STYLE_PRESETS,
  type VideoAspectRatio,
  type VideoAssetRecord,
  type VideoGenerationInput,
  type VideoGenerationResult,
  type VideoScene,
  type VideoStylePreset,
} from './types';
import { buildVideoPrompt } from './prompts';

function normalizeAspectRatio(aspectRatio?: string): VideoAspectRatio {
  return (VIDEO_ASPECT_RATIOS as readonly string[]).includes(aspectRatio || '')
    ? (aspectRatio as VideoAspectRatio)
    : '16:9';
}

function normalizeStylePreset(stylePreset?: string): VideoStylePreset {
  return (VIDEO_STYLE_PRESETS as readonly string[]).includes(stylePreset || '')
    ? (stylePreset as VideoStylePreset)
    : 'cinematic';
}

function buildStoragePath(ownerId: string, assetId: string): string {
  return `generated-assets/${ownerId}/videos/${assetId}.mp4`;
}

function buildBundlePath(ownerId: string, assetId: string): string {
  return `generated-assets/${ownerId}/videos/${assetId}.json`;
}

function buildThumbnailPrompt(input: VideoGenerationInput, scenes: VideoScene[]): string {
  const firstScene = scenes[0]?.visualDescription || input.prompt;
  return [
    `Create a cinematic thumbnail for a video about: ${input.prompt}`,
    input.brandName ? `Brand: ${input.brandName}` : '',
    input.brandTemplate?.name ? `Template: ${input.brandTemplate.name}` : '',
    `First scene: ${firstScene}`,
    `Style: ${input.stylePreset || 'cinematic'}`,
    `Aspect ratio: ${input.aspectRatio || '16:9'}`,
    `Make the thumbnail high contrast, clear, and business focused.`,
  ].filter(Boolean).join('\n');
}

async function saveBufferToStorage(buffer: Buffer, storagePath: string, contentType: string, ownerId: string): Promise<string> {
  const bucket = adminStorage.bucket();
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: {
        uploadedBy: ownerId,
        storagePath,
      },
    },
    resumable: false,
    validation: false,
  });

  const [downloadUrl] = await file.getSignedUrl({
    action: 'read',
    expires: '03-01-2500',
  });

  return downloadUrl;
}

async function saveJsonBundle(storagePath: string, ownerId: string, payload: Record<string, unknown>): Promise<string> {
  const buffer = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  return saveBufferToStorage(buffer, storagePath, 'application/json', ownerId);
}

async function persistVideoAsset(record: VideoAssetRecord): Promise<void> {
  await adminDb.collection('generatedAssets').doc(record.assetId).set({
    ...record,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: record.ownerId,
    updatedBy: record.ownerId,
    version: 1,
  });
}

async function persistVideoJob(input: {
  jobId: string;
  ownerId: string;
  provider: string;
  model: string;
  status: 'queued' | 'completed' | 'failed';
  queue: string;
  attempts: number;
  renderState: 'queued' | 'completed' | 'failed';
  assetId: string;
  plan: string;
  startedAt: number;
  completedAt?: number;
}): Promise<void> {
  await adminDb.collection('aiJobs').doc(input.jobId).set({
    jobId: input.jobId,
    type: 'video_generation',
    priority: 'normal',
    status: input.status,
    provider: input.provider,
    model: input.model,
    attempts: input.attempts,
    queue: input.queue,
    assetId: input.assetId,
    plan: input.plan,
    startedAt: admin.firestore.Timestamp.fromMillis(input.startedAt),
    completedAt: input.completedAt ? admin.firestore.Timestamp.fromMillis(input.completedAt) : null,
    ownerId: input.ownerId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function normalizeScenariosToScenes(raw: any, defaultDuration: number): VideoScene[] {
  const scenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
  const safeScenes: VideoScene[] = scenes.map((scene: any, index: number) => ({
    sceneNumber: typeof scene?.sceneNumber === 'number' ? scene.sceneNumber : index + 1,
    durationSeconds: typeof scene?.durationSeconds === 'number' ? scene.durationSeconds : Math.max(3, Math.round(defaultDuration / Math.max(scenes.length || 1, 1))),
    visualDescription: typeof scene?.visualDescription === 'string' ? scene.visualDescription : typeof scene?.visual === 'string' ? scene.visual : 'Business-focused scene',
    narration: typeof scene?.narration === 'string' ? scene.narration : '',
    onScreenText: typeof scene?.onScreenText === 'string' ? scene.onScreenText : '',
    cameraDirection: typeof scene?.cameraDirection === 'string' ? scene.cameraDirection : undefined,
    transition: typeof scene?.transition === 'string' ? scene.transition : undefined,
  }));

  if (safeScenes.length > 0) return safeScenes;

  return [
    {
      sceneNumber: 1,
      durationSeconds: Math.max(3, Math.floor(defaultDuration / 3)),
      visualDescription: 'Opening scene with a polished business setting and strong visual hook.',
      narration: 'Introduce the core message and value proposition.',
      onScreenText: 'Start here',
    },
    {
      sceneNumber: 2,
      durationSeconds: Math.max(3, Math.floor(defaultDuration / 3)),
      visualDescription: 'Middle scene showing the transformation, proof, or workflow.',
      narration: 'Show the benefit or process in action.',
      onScreenText: 'The opportunity',
    },
    {
      sceneNumber: 3,
      durationSeconds: Math.max(3, Math.ceil(defaultDuration / 3)),
      visualDescription: 'Closing scene with a clear call to action and brand finish.',
      narration: 'End with a direct invitation to take the next step.',
      onScreenText: 'Take action',
    },
  ];
}

async function planVideoBlueprint(input: VideoGenerationInput) {
  const prompt = buildVideoPrompt({
    prompt: input.prompt,
    promptEdits: input.promptEdits,
    negativePrompt: input.negativePrompt,
    stylePreset: input.stylePreset,
    aspectRatio: input.aspectRatio,
    durationSeconds: input.durationSeconds,
    captionsEnabled: input.captionsEnabled,
    voiceoverTone: input.voiceoverTone,
    brandName: input.brandName,
    brandTemplateName: input.brandTemplate?.name,
    brandTemplateNotes: input.brandTemplate?.notes,
    conversationSummary: input.conversationSummary,
  });

  const completion = await executeMonetizedTextRequest({
    task: 'content_generation',
    userId: input.userId,
    userTier: normalizeRoutingPlan(input.userTier || 'pro'),
    qualityMode: 'premium',
    messages: [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userPrompt },
    ],
    maxOutputTokens: 2200,
  }, {
    userId: input.userId || 'anonymous',
    task: 'content_generation',
    feature: 'content_generation',
    modality: 'text',
    message: prompt.userPrompt,
    userTier: input.userTier || 'pro',
    providerMode: 'hybrid',
    allowByok: true,
    requestId: `video_plan_${Date.now()}`,
  });

  const parsed = extractJsonObject<Record<string, any>>(completion.text);
  const durationSeconds = Math.max(6, Math.min(180, input.durationSeconds || 30));
  const scenes = normalizeScenariosToScenes(parsed, durationSeconds);
  const renderPrompt = typeof parsed.renderPrompt === 'string'
    ? parsed.renderPrompt
    : `${input.prompt} | ${input.brandName || input.brandTemplate?.name || ''} | ${input.stylePreset || 'cinematic'} | ${input.aspectRatio || '16:9'}`;

  return {
    prompt,
    parsed,
    durationSeconds,
    scenes,
    renderPrompt,
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : (input.title?.trim() || 'Generated video'),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    voiceoverScript: typeof parsed.voiceoverScript === 'string'
      ? parsed.voiceoverScript
      : scenes.map((scene) => scene.narration).join(' '),
    captions: Array.isArray(parsed.captions) ? parsed.captions.filter((item: unknown): item is string => typeof item === 'string') : scenes.map((scene) => scene.onScreenText).filter(Boolean),
    thumbnailPrompt: typeof parsed.thumbnailPrompt === 'string' ? parsed.thumbnailPrompt : buildThumbnailPrompt(input, scenes),
    renderNotes: typeof parsed.renderNotes === 'string' ? parsed.renderNotes : 'No additional render notes supplied.',
    script: typeof parsed.script === 'string' ? parsed.script : scenes.map((scene) => `${scene.sceneNumber}. ${scene.narration}`).join('\n'),
  };
}

export async function generateVideoStudioAsset(
  input: VideoGenerationInput
): Promise<VideoGenerationResult> {
  const startedAt = Date.now();
  const ownerId = input.userId || 'anonymous';
  const normalizedPrompt = sanitizeString(input.prompt, 4000);
  const normalizedEdits = input.promptEdits ? sanitizeString(input.promptEdits, 2000) : undefined;
  const normalizedNegative = input.negativePrompt ? sanitizeString(input.negativePrompt, 1000) : undefined;
  const normalizedBrandName = input.brandName ? sanitizeString(input.brandName, 200) : undefined;
  const normalizedSummary = input.conversationSummary ? sanitizeString(input.conversationSummary, 2000) : undefined;
  const aspectRatio = normalizeAspectRatio(input.aspectRatio);
  const stylePreset = normalizeStylePreset(input.stylePreset);
  const durationSeconds = Math.max(6, Math.min(180, Math.floor(input.durationSeconds || 30)));
  const assetId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const injectionCheck = detectInjection([
    normalizedPrompt,
    normalizedEdits || '',
    normalizedNegative || '',
    normalizedBrandName || '',
    normalizedSummary || '',
  ].join(' '));

  if (!injectionCheck.passed && injectionCheck.confidence >= 0.8) {
    throw new Error('Invalid prompt detected');
  }

  const blueprint = await planVideoBlueprint({
    ...input,
      prompt: injectionCheck.sanitized || normalizedPrompt,
    promptEdits: normalizedEdits,
    negativePrompt: normalizedNegative,
    brandName: normalizedBrandName,
    conversationSummary: normalizedSummary,
    aspectRatio,
    stylePreset,
    durationSeconds,
  });

  const renderInput = {
    prompt: blueprint.renderPrompt,
    task: 'video_generation' as const,
    userId: ownerId,
    userTier: input.userTier || 'pro',
    providerPreference: input.providerPreference as any,
    aspectRatio,
    durationSeconds,
    stylePreset,
    negativePrompt: normalizedNegative,
    captionsEnabled: input.captionsEnabled ?? true,
    voiceoverScript: blueprint.voiceoverScript,
    renderNotes: blueprint.renderNotes,
  };

  let videoBuffer: Buffer | undefined;
  let mimeType = 'video/mp4';
  let downloadUrl: string | undefined;
  let renderState: 'completed' | 'queued' | 'failed' = 'queued';
  let jobStatus: 'queued' | 'completed' | 'failed' = 'queued';
  let actualStoragePath = '';
  let rawPlan: Record<string, any> = blueprint.parsed;
  let providerId = 'vercel-ai-gateway';
  let modelId = 'veo-3';
  let queue = 'video-studio';
  let jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  try {
    const generation = await executeMonetizedVideoRequest(renderInput, {
      userId: ownerId,
      task: 'video_generation',
      feature: 'video_generation',
      modality: 'video',
      message: renderInput.prompt,
      userTier: input.userTier || 'pro',
      providerPreference: input.providerPreference as any,
      providerMode: 'hybrid',
      allowByok: false,
      requestId: `vid_${assetId}`,
    });
    providerId = generation.plan.providerId;
    modelId = generation.plan.modelId;
    rawPlan = {
      ...rawPlan,
      renderJobId: generation.jobId,
      raw: generation.raw,
    };

    if (generation.videoBuffer) {
      videoBuffer = generation.videoBuffer;
      mimeType = generation.mimeType || 'video/mp4';
      actualStoragePath = buildStoragePath(ownerId, assetId);
      downloadUrl = await saveBufferToStorage(videoBuffer, actualStoragePath, mimeType, ownerId);
      renderState = 'completed';
      jobStatus = 'completed';
    } else if (generation.sourceUrl) {
      const response = await fetch(generation.sourceUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        videoBuffer = Buffer.from(arrayBuffer);
        mimeType = response.headers.get('content-type') || generation.mimeType || 'video/mp4';
        actualStoragePath = buildStoragePath(ownerId, assetId);
        downloadUrl = await saveBufferToStorage(videoBuffer, actualStoragePath, mimeType, ownerId);
        renderState = 'completed';
        jobStatus = 'completed';
      } else {
        renderState = 'queued';
        jobStatus = 'queued';
      }
    } else {
      renderState = 'queued';
      jobStatus = 'queued';
    }
  } catch (error) {
    logger.warn('[VideoStudio] Video renderer unavailable or failed; saving blueprint bundle', {
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
    renderState = 'queued';
    jobStatus = 'queued';
  }

  if (!actualStoragePath) {
    actualStoragePath = downloadUrl ? buildStoragePath(ownerId, assetId) : buildBundlePath(ownerId, assetId);
  }

  if (!downloadUrl) {
    const bundleDownloadUrl = await saveJsonBundle(actualStoragePath, ownerId, {
      assetId,
      ownerId,
      title: blueprint.title,
      summary: blueprint.summary,
      prompt: normalizedPrompt,
      promptEdits: normalizedEdits,
      negativePrompt: normalizedNegative,
      stylePreset,
      aspectRatio,
      durationSeconds,
      captionsEnabled: input.captionsEnabled ?? true,
      voiceoverTone: input.voiceoverTone,
      scenes: blueprint.scenes,
      script: blueprint.script,
      captions: blueprint.captions,
      voiceoverScript: blueprint.voiceoverScript,
      thumbnailPrompt: blueprint.thumbnailPrompt,
      renderNotes: blueprint.renderNotes,
      renderPrompt: blueprint.renderPrompt,
      renderState,
    });
    downloadUrl = bundleDownloadUrl;
    mimeType = 'application/json';
  }

  const checksum = createHash('sha256')
    .update(JSON.stringify({
      title: blueprint.title,
      summary: blueprint.summary,
      renderPrompt: blueprint.renderPrompt,
      scenes: blueprint.scenes,
      captions: blueprint.captions,
      voiceoverScript: blueprint.voiceoverScript,
    }))
    .digest('hex');

  const record: VideoAssetRecord = {
    schemaVariant: 'video-generation-v1',
    assetId,
    ownerId,
    type: 'video',
    title: blueprint.title,
    prompt: normalizedPrompt,
    promptEdits: normalizedEdits,
    negativePrompt: normalizedNegative,
    stylePreset,
    aspectRatio,
    durationSeconds,
    captionsEnabled: input.captionsEnabled ?? true,
    voiceoverTone: input.voiceoverTone,
    brandTemplate: input.brandTemplate || null,
    brandName: normalizedBrandName,
    storagePath: actualStoragePath,
    thumbnail: downloadUrl || '',
    provider: providerId,
    model: modelId,
    promptVersion: 'video-studio@1.0.0',
    visibility: input.visibility || 'private',
    tags: Array.from(new Set([stylePreset, aspectRatio, normalizedBrandName || '', input.brandTemplate?.id || '', ...(input.tags || [])].filter(Boolean))),
    checksum,
    status: jobStatus === 'completed' ? 'completed' : 'queued',
    renderState,
    downloadUrl,
    sceneCount: blueprint.scenes.length,
  };

  await persistVideoAsset(record);
  await persistVideoJob({
    jobId,
    ownerId,
    provider: providerId,
    model: modelId,
    status: jobStatus,
    queue,
    attempts: 1,
    renderState,
    assetId,
    plan: JSON.stringify(rawPlan),
    startedAt,
    completedAt: jobStatus === 'completed' ? Date.now() : undefined,
  });

  recordUsage({
    timestamp: Date.now(),
    userId: ownerId,
    model: modelId,
    inputTokens: estimateTokenCount(blueprint.prompt.fullPrompt),
    outputTokens: estimateTokenCount(JSON.stringify(blueprint.scenes)),
    operation: 'video_gen',
    cached: false,
    durationMs: Date.now() - startedAt,
    promptVersion: 'video-studio@1.0.0',
  });

  logger.info('[VideoStudio] Video asset processed', {
    assetId,
    ownerId,
    provider: providerId,
    model: modelId,
    renderState,
    sceneCount: blueprint.scenes.length,
  });

  return {
    ...record,
    durationMs: Date.now() - startedAt,
    mimeType,
    promptPreview: blueprint.prompt.fullPrompt.slice(0, 160),
    script: blueprint.script,
    captions: blueprint.captions,
    scenes: blueprint.scenes,
    voiceoverScript: blueprint.voiceoverScript,
    thumbnailPrompt: blueprint.thumbnailPrompt,
  };
}

export async function listVideoStudioAssets(ownerId: string, limit = 12): Promise<VideoAssetRecord[]> {
  const snapshot = await adminDb
    .collection('generatedAssets')
    .where('ownerId', '==', ownerId)
    .where('type', '==', 'video')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const records: VideoAssetRecord[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as VideoAssetRecord;
    let downloadUrl = data.downloadUrl;

    if (!downloadUrl && data.storagePath) {
      const file = adminStorage.bucket().file(data.storagePath);
      const [signed] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
      downloadUrl = signed;
    }

    records.push({
      ...data,
      schemaVariant: data.schemaVariant || 'video-generation-v1',
      assetId: typeof data.assetId === 'string' ? data.assetId : doc.id,
      downloadUrl,
      thumbnail: downloadUrl || data.thumbnail,
    });
  }

  return records;
}

export function getVideoStudioCapabilities() {
  return {
    stylePresets: VIDEO_STYLE_PRESETS,
    aspectRatios: VIDEO_ASPECT_RATIOS,
    defaultDurationSeconds: 30,
  };
}
