import { createHash } from 'crypto';
import { admin, adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/logger';
import { sanitizeString } from '@/lib/security';
import { detectInjection } from '@/ai/guardrails';
import { estimateTokenCount } from '@/ai/core/tokenizer';
import { recordUsage } from '@/ai/analytics';
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_STYLE_PRESETS,
  type ImageAspectRatio,
  type ImageGenerationInput,
  type ImageGenerationResult,
  type ImageStylePreset,
  type ImageAssetRecord,
} from './types';
import { executeMonetizedImageRequest, normalizeRoutingPlan } from '@/services/ai-platform';

function normalizeAspectRatio(aspectRatio?: string): ImageAspectRatio {
  return (IMAGE_ASPECT_RATIOS as readonly string[]).includes(aspectRatio || '')
    ? (aspectRatio as ImageAspectRatio)
    : '1:1';
}

function normalizeStylePreset(stylePreset?: string): ImageStylePreset {
  return (IMAGE_STYLE_PRESETS as readonly string[]).includes(stylePreset || '')
    ? (stylePreset as ImageStylePreset)
    : 'photorealistic';
}

function buildFinalPrompt(input: ImageGenerationInput): string {
  const promptParts = [
    `Primary prompt: ${input.prompt}`,
    input.promptEdits ? `Prompt edits: ${input.promptEdits}` : '',
    input.brandTemplate?.name ? `Brand template: ${input.brandTemplate.name}` : '',
    input.brandTemplate?.description ? `Brand template notes: ${input.brandTemplate.description}` : '',
    input.brandTemplate?.logoUrl ? `Reference logo URL: ${input.brandTemplate.logoUrl}` : '',
    input.brandTemplate?.colors?.length ? `Brand colors: ${input.brandTemplate.colors.join(', ')}` : '',
    input.brandTemplate?.fonts?.length ? `Brand fonts: ${input.brandTemplate.fonts.join(', ')}` : '',
    input.brandTemplate?.notes ? `Brand notes: ${input.brandTemplate.notes}` : '',
    input.negativePrompt ? `Avoid: ${input.negativePrompt}` : '',
    input.conversationSummary ? `Context: ${input.conversationSummary}` : '',
    `Style preset: ${input.stylePreset || 'photorealistic'}`,
    `Aspect ratio: ${input.aspectRatio || '1:1'}`,
    `Create a clean, commercially useful image that matches the brand voice and avoids clutter.`,
    `If text is used in the composition, keep it minimal and legible.`,
  ].filter(Boolean);

  return promptParts.join('\n');
}

function buildStoragePath(ownerId: string, assetId: string): string {
  return `generated-assets/${ownerId}/images/${assetId}.png`;
}

async function saveImageToStorage(buffer: Buffer, storagePath: string, ownerId: string): Promise<string> {
  const bucket = adminStorage.bucket();
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    metadata: {
      contentType: 'image/png',
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

async function persistImageAsset(record: ImageAssetRecord): Promise<void> {
  await adminDb.collection('generatedAssets').doc(record.assetId).set({
    ...record,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: record.ownerId,
    updatedBy: record.ownerId,
    version: 1,
  });
}

export async function generateImageStudioAsset(
  input: ImageGenerationInput
): Promise<ImageGenerationResult> {
  const ownerId = input.userId || 'anonymous';
  const normalizedPrompt = sanitizeString(input.prompt, 4000);
  const normalizedEdits = input.promptEdits ? sanitizeString(input.promptEdits, 2000) : undefined;
  const normalizedNegative = input.negativePrompt ? sanitizeString(input.negativePrompt, 1000) : undefined;
  const normalizedBrandName = input.brandName ? sanitizeString(input.brandName, 200) : undefined;
  const normalizedSummary = input.conversationSummary ? sanitizeString(input.conversationSummary, 2000) : undefined;
  const aspectRatio = normalizeAspectRatio(input.aspectRatio);
  const stylePreset = normalizeStylePreset(input.stylePreset);

  const combinedInput = [
    normalizedPrompt,
    normalizedEdits || '',
    normalizedNegative || '',
    normalizedBrandName || '',
    normalizedSummary || '',
  ].join(' ');
  const injectionCheck = detectInjection(combinedInput);
  if (!injectionCheck.passed && injectionCheck.confidence >= 0.8) {
    throw new Error('Invalid prompt detected');
  }

  const finalPrompt = buildFinalPrompt({
    ...input,
    prompt: injectionCheck.sanitized || normalizedPrompt,
    promptEdits: normalizedEdits,
    negativePrompt: normalizedNegative,
    brandName: normalizedBrandName,
    conversationSummary: normalizedSummary,
    aspectRatio,
    stylePreset,
  });

  const generation = await executeMonetizedImageRequest({
    prompt: finalPrompt,
    task: 'image_generation',
    userId: ownerId,
    userTier: normalizeRoutingPlan(input.userTier || 'pro'),
    providerPreference: input.providerPreference as any,
    aspectRatio,
    stylePreset,
  }, {
    userId: ownerId,
    task: 'image_generation',
    feature: 'image_generation',
    modality: 'image',
    message: finalPrompt,
    userTier: input.userTier || 'pro',
    providerPreference: input.providerPreference as any,
    providerMode: 'hybrid',
    allowByok: true,
    requestId: `img_${ownerId}_${Date.now()}`,
  });

  const assetId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = buildStoragePath(ownerId, assetId);
  const checksum = createHash('sha256').update(generation.imageBuffer).digest('hex');
  const downloadUrl = await saveImageToStorage(generation.imageBuffer, storagePath, ownerId);

  const record: ImageAssetRecord = {
    schemaVariant: 'image-generation-v1',
    assetId,
    ownerId,
    type: 'image',
    title: input.title?.trim() || normalizedBrandName || 'Generated image',
    prompt: normalizedPrompt,
    promptEdits: normalizedEdits,
    negativePrompt: normalizedNegative,
    stylePreset,
    aspectRatio,
    brandTemplate: input.brandTemplate || null,
    brandName: normalizedBrandName,
    storagePath,
    thumbnail: downloadUrl,
    provider: generation.plan.providerId,
    model: generation.plan.modelId,
    credits: generation.billing?.creditsCharged,
    creditsReserved: generation.billing?.creditsReserved,
    creditsRefunded: generation.billing?.creditsRefunded,
    promptVersion: 'image-studio@1.0.0',
    visibility: input.visibility || 'private',
    tags: Array.from(new Set([stylePreset, aspectRatio, normalizedBrandName || '', input.brandTemplate?.id || '', ...(input.tags || [])].filter(Boolean))),
    checksum,
    status: 'completed',
    downloadUrl,
  };

  await persistImageAsset(record);

  recordUsage({
    timestamp: Date.now(),
    userId: ownerId,
    model: generation.plan.modelId,
    inputTokens: estimateTokenCount(finalPrompt),
    outputTokens: estimateTokenCount(`${stylePreset} ${aspectRatio}`),
    operation: 'image_gen',
    cached: false,
    durationMs: generation.durationMs,
    promptVersion: 'image-studio@1.0.0',
  });

  logger.info('[ImageStudio] Image generated', {
    assetId,
    ownerId,
    provider: generation.plan.providerId,
    model: generation.plan.modelId,
    stylePreset,
    aspectRatio,
  });

  return {
    ...record,
    durationMs: generation.durationMs,
    mimeType: generation.mimeType,
    promptPreview: finalPrompt.slice(0, 160),
  };
}

export async function listImageStudioAssets(ownerId: string, limit = 12): Promise<ImageAssetRecord[]> {
  const snapshot = await adminDb
    .collection('generatedAssets')
    .where('ownerId', '==', ownerId)
    .where('type', '==', 'image')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const records: ImageAssetRecord[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as ImageAssetRecord;
    let downloadUrl = data.downloadUrl;

    if (!downloadUrl && data.storagePath) {
      const file = adminStorage.bucket().file(data.storagePath);
      const [signed] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
      downloadUrl = signed;
    }

    records.push({
      ...data,
      schemaVariant: data.schemaVariant || 'image-generation-v1',
      assetId: typeof data.assetId === 'string' ? data.assetId : doc.id,
      downloadUrl,
      thumbnail: downloadUrl || data.thumbnail,
    });
  }

  return records;
}

export function getImageStudioCapabilities() {
  return {
    stylePresets: IMAGE_STYLE_PRESETS,
    aspectRatios: IMAGE_ASPECT_RATIOS,
  };
}
