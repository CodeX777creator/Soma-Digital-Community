import { createHash } from 'crypto';
import { admin, adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/logger';
import { sanitizeString } from '@/lib/security';
import { detectInjection } from '@/ai/guardrails';
import { estimateTokenCount } from '@/ai/core/tokenizer';
import { recordUsage } from '@/ai/analytics';
import { extractJsonObject } from '@/ai/platform';
import { executeTextCompletion } from '@/ai/platform/service';
import { normalizeRoutingPlan, recordMonetizedUsageCharge } from '@/services/ai-platform';
import { renderVideoAsset, type VideoRenderResult } from './video-renderer';
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

function buildPosterPath(ownerId: string, assetId: string): string {
  return `generated-assets/${ownerId}/videos/${assetId}-poster.png`;
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

function normalizeInputScenes(scenes: VideoGenerationInput['scenes'], defaultDuration: number): VideoScene[] {
  const list = Array.isArray(scenes) ? scenes : [];
  const normalized = list.map((scene: any, index: number) => ({
    sceneNumber: typeof scene?.sceneNumber === 'number' ? scene.sceneNumber : index + 1,
    durationSeconds: typeof scene?.durationSeconds === 'number' ? Math.max(3, Math.round(scene.durationSeconds)) : Math.max(3, Math.round(defaultDuration / Math.max(list.length || 1, 1))),
    visualDescription: typeof scene?.visualDescription === 'string' && scene.visualDescription.trim() ? scene.visualDescription : 'Business-focused scene',
    narration: typeof scene?.narration === 'string' ? scene.narration : '',
    onScreenText: typeof scene?.onScreenText === 'string' ? scene.onScreenText : '',
    cameraDirection: typeof scene?.cameraDirection === 'string' ? scene.cameraDirection : undefined,
    transition: typeof scene?.transition === 'string' ? scene.transition : undefined,
  } as VideoScene));

  if (normalized.length > 0) {
    return normalized.map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
  }

  return [];
}

function deriveSceneBlueprint(input: VideoGenerationInput, scenes: VideoScene[]) {
  const script = scenes.map((scene) => `${scene.sceneNumber}. ${scene.narration || scene.visualDescription}`).join('\n');
  const voiceoverScript = scenes.map((scene) => scene.narration || scene.visualDescription).join(' ');
  const captions = scenes.map((scene) => scene.onScreenText).filter(Boolean);

  return {
    script,
    voiceoverScript,
    captions,
    thumbnailPrompt: buildThumbnailPrompt(input, scenes),
  };
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

async function savePosterFrame(buffer: Buffer, storagePath: string, ownerId: string): Promise<string> {
  return saveBufferToStorage(buffer, storagePath, 'image/png', ownerId);
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
    scenes: input.scenes,
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

  const completion = await executeTextCompletion({
    task: 'content_generation',
    userId: input.userId,
    userTier: normalizeRoutingPlan(input.userTier || 'pro'),
    qualityMode: 'premium',
    messages: [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userPrompt },
    ],
    maxOutputTokens: 2200,
  });

  const parsed = extractJsonObject<Record<string, any>>(completion.text);
  const providerId = (completion as any)?.plan?.providerId || 'vercel-ai-gateway';
  const modelId = (completion as any)?.plan?.modelId || 'video-blueprint';
  const durationSeconds = Math.max(6, Math.min(180, input.durationSeconds || 30));
  const providedScenes = normalizeInputScenes(input.scenes, durationSeconds);
  const scenes = providedScenes.length > 0 ? providedScenes : normalizeScenariosToScenes(parsed, durationSeconds);
  const renderPrompt = typeof parsed.renderPrompt === 'string'
    ? parsed.renderPrompt
    : `${input.prompt} | ${input.brandName || input.brandTemplate?.name || ''} | ${input.stylePreset || 'cinematic'} | ${input.aspectRatio || '16:9'}`;
  const sceneBlueprint = providedScenes.length > 0 ? deriveSceneBlueprint(input, scenes) : null;

  return {
    prompt,
    parsed,
    providerId,
    modelId,
    durationSeconds,
    scenes,
    renderPrompt,
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : (input.title?.trim() || 'Generated video'),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    voiceoverScript: sceneBlueprint?.voiceoverScript || (typeof parsed.voiceoverScript === 'string'
      ? parsed.voiceoverScript
      : scenes.map((scene) => scene.narration).join(' ')),
    captions: sceneBlueprint?.captions || (Array.isArray(parsed.captions) ? parsed.captions.filter((item: unknown): item is string => typeof item === 'string') : scenes.map((scene) => scene.onScreenText).filter(Boolean)),
    thumbnailPrompt: sceneBlueprint?.thumbnailPrompt || (typeof parsed.thumbnailPrompt === 'string' ? parsed.thumbnailPrompt : buildThumbnailPrompt(input, scenes)),
    renderNotes: providedScenes.length > 0
      ? `${typeof parsed.renderNotes === 'string' ? parsed.renderNotes : 'No additional render notes supplied.'} User-edited timeline was preserved.`
      : typeof parsed.renderNotes === 'string' ? parsed.renderNotes : 'No additional render notes supplied.',
    script: sceneBlueprint?.script || (typeof parsed.script === 'string' ? parsed.script : scenes.map((scene) => `${scene.sceneNumber}. ${scene.narration}`).join('\n')),
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
  const generationMode = input.generationMode === 'render' ? 'render' : 'draft';
  const assetId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const providedScenes = normalizeInputScenes(input.scenes, durationSeconds);

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
    scenes: providedScenes.length > 0 ? providedScenes : undefined,
    brandName: normalizedBrandName,
    conversationSummary: normalizedSummary,
    aspectRatio,
    stylePreset,
    durationSeconds,
  });

  let renderOutcome: VideoRenderResult = {
    renderer: 'bundle',
    status: 'queued',
    mimeType: 'application/json',
  };
  let videoBuffer: Buffer | undefined;
  let posterFrameUrl: string | undefined;
  let mimeType = 'video/mp4';
  let downloadUrl: string | undefined;
  let renderState: 'completed' | 'queued' | 'failed' = 'queued';
  let jobStatus: 'queued' | 'completed' | 'failed' = 'queued';
  let actualStoragePath = '';
  let rawPlan: Record<string, any> = blueprint.parsed;
  let providerId = blueprint.providerId;
  let modelId = blueprint.modelId;
  let queue = 'video-studio';
  let jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  if (generationMode === 'render') {
    try {
      renderOutcome = await renderVideoAsset({
        title: blueprint.title,
        prompt: normalizedPrompt,
        renderPrompt: blueprint.renderPrompt,
        scenes: blueprint.scenes,
        stylePreset,
        aspectRatio,
        durationSeconds,
        captionsEnabled: input.captionsEnabled ?? true,
        voiceoverScript: blueprint.voiceoverScript,
        thumbnailPrompt: blueprint.thumbnailPrompt,
        renderNotes: blueprint.renderNotes,
        brandName: normalizedBrandName,
        brandTemplateName: input.brandTemplate?.name,
        voiceoverTone: input.voiceoverTone,
      });
      renderState = renderOutcome.status;
      jobStatus = renderOutcome.status;
      rawPlan = {
        ...rawPlan,
        generationMode,
        renderer: renderOutcome.renderer,
        renderStatus: renderOutcome.status,
        renderNotes: renderOutcome.notes || blueprint.renderNotes,
        raw: renderOutcome.raw || null,
      };

      if (renderOutcome.status === 'completed') {
        if (renderOutcome.videoBuffer) {
          videoBuffer = renderOutcome.videoBuffer;
          mimeType = renderOutcome.mimeType || 'video/mp4';
          actualStoragePath = buildStoragePath(ownerId, assetId);
          downloadUrl = await saveBufferToStorage(videoBuffer, actualStoragePath, mimeType, ownerId);
          if (renderOutcome.posterFrameBuffer) {
            posterFrameUrl = await savePosterFrame(renderOutcome.posterFrameBuffer, buildPosterPath(ownerId, assetId), ownerId);
          }
        } else if (renderOutcome.sourceUrl) {
          const response = await fetch(renderOutcome.sourceUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            videoBuffer = Buffer.from(arrayBuffer);
            mimeType = response.headers.get('content-type') || renderOutcome.mimeType || 'video/mp4';
            actualStoragePath = buildStoragePath(ownerId, assetId);
            downloadUrl = await saveBufferToStorage(videoBuffer, actualStoragePath, mimeType, ownerId);
            if (renderOutcome.posterFrameBuffer) {
              posterFrameUrl = await savePosterFrame(renderOutcome.posterFrameBuffer, buildPosterPath(ownerId, assetId), ownerId);
            }
          } else {
            renderState = 'queued';
            jobStatus = 'queued';
          }
        }
      } else if (renderOutcome.status === 'queued') {
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
  } else {
    rawPlan = {
      ...rawPlan,
      generationMode,
      renderer: renderOutcome.renderer,
      renderStatus: renderOutcome.status,
      renderNotes: 'Saved as a video draft. Full rendering starts only when the creator chooses Render full video.',
    };
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
      productRules: input.productRules || null,
      renderer: renderOutcome.renderer,
      generationMode,
    });
    downloadUrl = bundleDownloadUrl;
    mimeType = 'application/json';
  }

  const submittedRealRender =
    renderOutcome.renderer !== 'bundle' &&
    (renderOutcome.status === 'completed' || renderOutcome.status === 'queued');
  const chargeFeature = submittedRealRender ? 'video_generation' : 'content_generation';

  const billingResult = await recordMonetizedUsageCharge({
    userId: ownerId,
    task: chargeFeature,
    feature: chargeFeature,
    modality: submittedRealRender ? 'video' : 'text',
    message: submittedRealRender ? blueprint.renderPrompt : blueprint.prompt.userPrompt,
    userTier: input.userTier || 'pro',
    providerMode: 'hybrid',
    allowByok: !submittedRealRender,
    requestId: `${submittedRealRender ? 'video_render' : 'video_plan'}_${assetId}`,
    metadata: {
      assetId,
      schemaVariant: 'video-generation-v1',
      renderer: renderOutcome.renderer,
      renderStatus: renderOutcome.status,
      generationMode,
      durationSeconds,
      creditPolicy: submittedRealRender ? 'video_generation_render' : 'content_generation_blueprint',
    },
  }, {
    requestType: submittedRealRender ? 'video' : 'text',
    estimatedCostUsd: submittedRealRender ? 0.2 : 0.02,
    actualCostUsd: submittedRealRender ? 0.2 : 0.02,
    durationMs: Date.now() - startedAt,
    providerId,
    modelId,
    metadata: {
      assetId,
      renderer: renderOutcome.renderer,
      renderStatus: renderOutcome.status,
      generationMode,
    },
  });

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
    productRules: input.productRules || null,
    brandName: normalizedBrandName,
    storagePath: actualStoragePath,
    thumbnail: posterFrameUrl || downloadUrl || '',
    posterFrameUrl,
    provider: providerId,
    model: modelId,
    credits: billingResult.billing.creditsCharged,
    creditsReserved: billingResult.billing.creditsReserved,
    creditsRefunded: billingResult.billing.creditsRefunded,
    promptVersion: 'video-studio@1.0.0',
    renderStrategy: renderOutcome.renderer,
    visibility: input.visibility || 'private',
    tags: Array.from(new Set([stylePreset, aspectRatio, normalizedBrandName || '', input.brandTemplate?.id || '', input.productRules?.productName || '', ...(input.tags || [])].filter(Boolean))),
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
    renderStrategy: renderOutcome.renderer,
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
      thumbnail: data.posterFrameUrl || data.thumbnail || downloadUrl || '',
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
