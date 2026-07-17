import { createHash } from 'crypto';
import { admin, adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/logger';
import { sanitizeString } from '@/lib/security';
import { detectInjection } from '@/ai/guardrails';
import { estimateTokenCount } from '@/ai/core/tokenizer';
import { recordUsage } from '@/ai/analytics';
import { extractJsonObject } from '@/ai/platform';
import { executeTextCompletion } from '@/ai/platform/service';
import { executeMonetizedAudioRequest, normalizeRoutingPlan } from '@/services/ai-platform';
import { renderAudioAsset, type AudioRenderResult } from './audio-renderer';
import {
  AUDIO_LANGUAGES,
  AUDIO_VOICE_PRESETS,
  type AudioAssetRecord,
  type AudioGenerationInput,
  type AudioGenerationResult,
  type AudioLanguage,
  type AudioTranscriptSegment,
  type AudioVoicePreset,
  type AudioVoiceProfile,
  type BrandTemplate,
  type VoiceBrandProfile,
} from './types';
import { buildAudioPrompt } from './prompts';

function normalizeLanguage(language?: string): string {
  if (!language) return 'English';
  const match = AUDIO_LANGUAGES.find((item) => item.toLowerCase() === language.toLowerCase());
  return match || language;
}

function normalizeVoicePreset(voicePreset?: string): AudioVoicePreset {
  return (AUDIO_VOICE_PRESETS as readonly string[]).includes(voicePreset || '')
    ? (voicePreset as AudioVoicePreset)
    : 'narrator';
}

function buildStoragePath(ownerId: string, assetId: string, mimeType: string): string {
  const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('aac') ? 'aac' : mimeType.includes('ogg') ? 'ogg' : 'mp3';
  return `generated-assets/${ownerId}/audio/${assetId}.${extension}`;
}

function buildBundlePath(ownerId: string, assetId: string): string {
  return `generated-assets/${ownerId}/audio/${assetId}.json`;
}

function buildWaveformPath(ownerId: string, assetId: string): string {
  return `generated-assets/${ownerId}/audio/${assetId}-waveform.svg`;
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

async function saveWaveformPreview(storagePath: string, ownerId: string, buffer: Buffer, mimeType = 'image/svg+xml'): Promise<string> {
  return saveBufferToStorage(buffer, storagePath, mimeType, ownerId);
}

async function persistAudioAsset(record: AudioAssetRecord): Promise<void> {
  await adminDb.collection('generatedAssets').doc(record.assetId).set({
    ...record,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: record.ownerId,
    updatedBy: record.ownerId,
    version: 1,
  });
}

async function persistAudioJob(input: {
  jobId: string;
  ownerId: string;
  provider: string;
  model: string;
  status: 'queued' | 'completed' | 'failed';
  queue: string;
  attempts: number;
  assetId: string;
  plan: string;
  startedAt: number;
  completedAt?: number;
}): Promise<void> {
  await adminDb.collection('aiJobs').doc(input.jobId).set({
    jobId: input.jobId,
    type: 'audio_generation',
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

function buildFallbackNarration(input: AudioGenerationInput): string {
  const lines = [
    input.includeIntro !== false ? `Welcome to this ${input.brandName || 'business'} audio experience.` : '',
    input.narrationText || input.transcript || input.prompt,
    input.includeOutro !== false ? 'Thank you for listening. Take the next step now.' : '',
  ].filter(Boolean);
  return lines.join(' ');
}

function buildVoiceProfile(input: AudioGenerationInput): VoiceBrandProfile {
  if (input.voiceBrandProfile) {
    return {
      ...input.voiceBrandProfile,
      name: input.voiceBrandProfile.name || input.voiceBrandProfile.profileName || input.voicePreset || 'narrator',
      profileName: input.voiceBrandProfile.profileName || input.voiceBrandProfile.name || input.voicePreset || 'narrator',
    };
  }

  if (input.voiceProfile) {
    return {
      ...input.voiceProfile,
      profileName: input.voiceProfile.name || input.voicePreset || 'narrator',
      provider: input.providerPreference,
      isClonedVoice: Boolean(input.voiceProfile.voiceId || input.voiceId),
      cloneSourceName: input.voiceProfile.name || input.voicePreset || undefined,
      cloneConsentConfirmed: false,
      brandTone: input.tone,
    };
  }

  return {
    voiceId: input.voiceId,
    name: input.voicePreset || 'narrator',
    profileName: input.voicePreset || 'narrator',
    description: `${input.voicePreset || 'Narrator'} voice profile`,
    language: normalizeLanguage(input.language) as AudioLanguage,
    stability: 0.45,
    similarityBoost: 0.8,
    speed: 1,
    provider: input.providerPreference,
    isClonedVoice: Boolean(input.voiceId),
    cloneConsentConfirmed: false,
    brandTone: input.tone,
  };
}

function buildTranscriptSegments(text: string, durationSeconds: number): AudioTranscriptSegment[] {
  const chunks = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 0) {
    return [];
  }

  const totalMs = Math.max(1, durationSeconds) * 1000;
  const segmentMs = Math.max(1000, Math.floor(totalMs / chunks.length));

  return chunks.map((chunk, index) => {
    const startMs = index * segmentMs;
    return {
      index,
      text: chunk,
      startMs,
      endMs: index === chunks.length - 1 ? totalMs : Math.min(totalMs, startMs + segmentMs),
    };
  });
}

async function planAudioBlueprint(input: AudioGenerationInput) {
  const prompt = buildAudioPrompt({
    prompt: input.prompt,
    narrationText: input.narrationText,
    transcript: input.transcript,
    voicePreset: input.voicePreset,
    voiceId: input.voiceId,
    secondaryVoiceId: input.secondaryVoiceId,
    language: input.language,
    backgroundMusic: input.backgroundMusic,
    includeIntro: input.includeIntro,
    includeOutro: input.includeOutro,
    durationSeconds: input.durationSeconds,
    brandName: input.brandName,
    brandTemplateName: input.brandTemplate?.name,
    brandTemplateNotes: input.brandTemplate?.notes,
    tone: input.tone,
    scriptStyle: input.scriptStyle,
    conversationSummary: input.conversationSummary,
  });

  const completion = await executeTextCompletion({
    task: 'chat',
    userId: input.userId,
    userTier: normalizeRoutingPlan(input.userTier || 'pro'),
    qualityMode: 'premium',
    messages: [
      { role: 'system', content: prompt.systemPrompt },
      { role: 'user', content: prompt.userPrompt },
    ],
    maxOutputTokens: 1800,
  });

  const parsed = extractJsonObject<Record<string, any>>(completion.text);
  const title = typeof parsed.title === 'string' && parsed.title.trim()
    ? parsed.title
    : input.title?.trim() || 'Generated audio';
  const narrationText = typeof parsed.narrationText === 'string' && parsed.narrationText.trim()
    ? parsed.narrationText
    : buildFallbackNarration(input);

  return {
    prompt,
    parsed,
    title,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    narrationText,
    transcript: typeof parsed.transcript === 'string' ? parsed.transcript : input.transcript,
    pronunciationNotes: Array.isArray(parsed.pronunciationNotes)
      ? parsed.pronunciationNotes.filter((item: unknown): item is string => typeof item === 'string')
      : [],
    voiceDirections: Array.isArray(parsed.voiceDirections)
      ? parsed.voiceDirections.filter((item: unknown): item is string => typeof item === 'string')
      : [],
    alternateVoices: Array.isArray(parsed.alternateVoices)
      ? parsed.alternateVoices.filter((item: unknown): item is string => typeof item === 'string')
      : [],
    language: typeof parsed.language === 'string' ? parsed.language : normalizeLanguage(input.language),
    renderNotes: typeof parsed.renderNotes === 'string' ? parsed.renderNotes : 'No additional render notes supplied.',
  };
}

export async function generateAudioStudioAsset(
  input: AudioGenerationInput
): Promise<AudioGenerationResult> {
  const startedAt = Date.now();
  const ownerId = input.userId || 'anonymous';
  const normalizedPrompt = sanitizeString(input.prompt, 4000);
  const normalizedNarration = input.narrationText ? sanitizeString(input.narrationText, 12000) : undefined;
  const normalizedTranscript = input.transcript ? sanitizeString(input.transcript, 12000) : undefined;
  const normalizedBrandName = input.brandName ? sanitizeString(input.brandName, 200) : undefined;
  const normalizedSummary = input.conversationSummary ? sanitizeString(input.conversationSummary, 2000) : undefined;
  const voicePreset = normalizeVoicePreset(input.voicePreset);
  const language = normalizeLanguage(input.language);
  const voiceProfile = buildVoiceProfile({ ...input, voicePreset });
  const durationSeconds = Math.max(6, Math.min(600, Math.floor(input.durationSeconds || 30)));

  const injectionCheck = detectInjection([
    normalizedPrompt,
    normalizedNarration || '',
    normalizedTranscript || '',
    normalizedBrandName || '',
    normalizedSummary || '',
  ].join(' '));
  if (!injectionCheck.passed && injectionCheck.confidence >= 0.8) {
    throw new Error('Invalid prompt detected');
  }

  const blueprint = await planAudioBlueprint({
    ...input,
    prompt: injectionCheck.sanitized || normalizedPrompt,
    narrationText: normalizedNarration,
    transcript: normalizedTranscript,
    brandName: normalizedBrandName,
    conversationSummary: normalizedSummary,
    voicePreset,
    language,
    durationSeconds,
    voiceProfile,
  });

  const synthesisText = blueprint.narrationText;
  const synthesis = await executeMonetizedAudioRequest({
    prompt: blueprint.prompt.fullPrompt,
    task: 'audio_generation',
    userId: ownerId,
    userTier: normalizeRoutingPlan(input.userTier || 'pro'),
    providerPreference: input.providerPreference as any,
    voiceId: input.voiceId || voiceProfile.voiceId,
    voicePreset,
    language,
    narrationText: synthesisText,
    secondaryVoiceId: input.secondaryVoiceId,
    speed: voiceProfile.speed,
    stability: voiceProfile.stability,
    similarityBoost: voiceProfile.similarityBoost,
  }, {
    userId: ownerId,
    task: 'audio_generation',
    feature: 'audio_generation',
    modality: 'audio',
    message: blueprint.prompt.fullPrompt,
    userTier: input.userTier || 'pro',
    providerPreference: input.providerPreference as any,
    providerMode: 'hybrid',
    allowByok: true,
    requestId: `aud_${ownerId}_${Date.now()}`,
    metadata: {
      durationSeconds,
      characters: synthesisText.length,
    },
  });

  const assetId = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const transcriptSegments = buildTranscriptSegments(blueprint.transcript || synthesisText || normalizedNarration || normalizedPrompt, durationSeconds);
  let renderOutcome: AudioRenderResult = {
    renderer: 'bundle',
    status: 'queued',
    mimeType: 'application/json',
  };
  let storagePath = '';
  let waveformStoragePath = '';
  let downloadUrl: string | undefined;
  let mimeType = synthesis.mimeType || 'audio/mpeg';
  let renderState: 'completed' | 'queued' | 'failed' = synthesis.audioBuffer ? 'completed' : 'queued';
  let status: 'completed' | 'queued' | 'failed' = synthesis.audioBuffer ? 'completed' : 'queued';
  let waveformPreviewUrl: string | undefined;

  try {
    renderOutcome = await renderAudioAsset({
      title: blueprint.title,
      prompt: normalizedPrompt,
      narrationText: synthesisText,
      transcript: blueprint.transcript,
      language,
      voicePreset,
      durationSeconds,
      backgroundMusic: input.backgroundMusic ?? false,
      includeIntro: input.includeIntro ?? true,
      includeOutro: input.includeOutro ?? true,
      tone: input.tone,
      scriptStyle: input.scriptStyle,
      brandName: normalizedBrandName,
      brandTemplateName: input.brandTemplate?.name,
      renderNotes: blueprint.renderNotes,
    }, synthesis.audioBuffer);
  } catch (error) {
    logger.warn('[AudioStudio] Audio renderer unavailable or failed; using synthesis output', {
      ownerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const finalAudioBuffer = renderOutcome.audioBuffer || synthesis.audioBuffer;
  const finalAudioUrl = renderOutcome.sourceUrl || synthesis.sourceUrl;

  if (finalAudioBuffer) {
    mimeType = renderOutcome.audioBuffer ? (renderOutcome.mimeType || 'audio/mpeg') : (synthesis.mimeType || 'audio/mpeg');
    storagePath = buildStoragePath(ownerId, assetId, mimeType);
    downloadUrl = await saveBufferToStorage(finalAudioBuffer, storagePath, mimeType, ownerId);
    renderState = 'completed';
    status = 'completed';
  } else if (finalAudioUrl) {
    const response = await fetch(finalAudioUrl);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      mimeType = response.headers.get('content-type') || renderOutcome.mimeType || synthesis.mimeType || 'audio/mpeg';
      storagePath = buildStoragePath(ownerId, assetId, mimeType);
      downloadUrl = await saveBufferToStorage(buffer, storagePath, mimeType, ownerId);
      renderState = 'completed';
      status = 'completed';
    }
  }

  if (renderOutcome.waveformPreviewBuffer) {
    waveformStoragePath = buildWaveformPath(ownerId, assetId);
    waveformPreviewUrl = await saveWaveformPreview(
      waveformStoragePath,
      ownerId,
      renderOutcome.waveformPreviewBuffer,
      renderOutcome.waveformPreviewMimeType || 'image/svg+xml'
    );
  } else if (synthesis.audioBuffer) {
    waveformStoragePath = buildWaveformPath(ownerId, assetId);
    waveformPreviewUrl = await saveWaveformPreview(
      waveformStoragePath,
      ownerId,
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="320"><rect width="100%" height="100%" fill="#0f172a"/><text x="60" y="160" fill="#f8fafc" font-size="28" font-family="Inter, Arial, sans-serif">Waveform preview unavailable</text></svg>`, 'utf8')
    );
  }

  if (!downloadUrl) {
    storagePath = buildBundlePath(ownerId, assetId);
    downloadUrl = await saveJsonBundle(storagePath, ownerId, {
      assetId,
      ownerId,
      title: blueprint.title,
      summary: blueprint.summary,
      prompt: normalizedPrompt,
      narrationText: synthesisText,
      transcript: blueprint.transcript,
      voicePreset,
      voiceId: synthesis.voiceId || input.voiceId || voiceProfile.voiceId || 'default',
      secondaryVoiceId: input.secondaryVoiceId,
      voiceBrandProfile: voiceProfile,
      language,
      backgroundMusic: input.backgroundMusic ?? false,
      includeIntro: input.includeIntro ?? true,
      includeOutro: input.includeOutro ?? true,
      durationSeconds,
      tone: input.tone,
      scriptStyle: input.scriptStyle,
      pronunciationNotes: blueprint.pronunciationNotes,
      voiceDirections: blueprint.voiceDirections,
      alternateVoices: blueprint.alternateVoices,
      productRules: input.productRules || null,
      renderNotes: blueprint.renderNotes,
      renderState,
      renderer: renderOutcome.renderer,
      waveformPreviewUrl,
      transcriptSegments,
    });
    mimeType = 'application/json';
  }

  const checksum = createHash('sha256')
    .update(JSON.stringify({
      title: blueprint.title,
      summary: blueprint.summary,
      narrationText: synthesisText,
      transcript: blueprint.transcript,
      voicePreset,
      language,
    }))
    .digest('hex');

  const record: AudioAssetRecord = {
    schemaVariant: 'voice-generation-v1',
    assetId,
    ownerId,
    type: 'audio',
    title: blueprint.title,
    prompt: normalizedPrompt,
    narrationText: synthesisText,
    transcript: blueprint.transcript,
    voicePreset,
    voiceId: synthesis.voiceId || input.voiceId || voiceProfile.voiceId || 'default',
    secondaryVoiceId: input.secondaryVoiceId,
    voiceBrandProfile: voiceProfile,
    language,
    backgroundMusic: input.backgroundMusic ?? false,
    includeIntro: input.includeIntro ?? true,
    includeOutro: input.includeOutro ?? true,
    durationSeconds,
    tone: input.tone,
    scriptStyle: input.scriptStyle,
    brandTemplate: input.brandTemplate || null,
    productRules: input.productRules || null,
    brandName: normalizedBrandName,
    storagePath,
    waveformStoragePath,
    thumbnail: waveformPreviewUrl || downloadUrl || '',
    waveformPreviewUrl,
    provider: synthesis.plan.providerId,
    model: synthesis.plan.modelId,
    credits: synthesis.billing?.creditsCharged,
    creditsReserved: synthesis.billing?.creditsReserved,
    creditsRefunded: synthesis.billing?.creditsRefunded,
    promptVersion: 'audio-studio@1.0.0',
    renderStrategy: renderOutcome.renderer,
    visibility: input.visibility || 'private',
    tags: Array.from(new Set([voicePreset, language, normalizedBrandName || '', input.brandTemplate?.id || '', input.productRules?.productName || '', ...(input.tags || [])].filter(Boolean))),
    checksum,
    status,
    renderState,
    downloadUrl,
    mimeType,
    transcriptSegments,
  };

  await persistAudioAsset(record);
  await persistAudioJob({
    jobId: `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ownerId,
    provider: synthesis.plan.providerId,
    model: synthesis.plan.modelId,
    status,
    queue: 'audio-studio',
    attempts: 1,
    assetId,
    plan: JSON.stringify({
      ...(synthesis.raw || {}),
      renderer: renderOutcome.renderer,
      waveformPreviewUrl,
    }),
    startedAt,
    completedAt: status === 'completed' ? Date.now() : undefined,
  });

  recordUsage({
    timestamp: startedAt,
    userId: ownerId,
    model: synthesis.plan.modelId,
    inputTokens: estimateTokenCount(blueprint.prompt.fullPrompt),
    outputTokens: estimateTokenCount(synthesisText),
    operation: 'audio_gen',
    cached: false,
    durationMs: Date.now() - startedAt,
    promptVersion: 'audio-studio@1.0.0',
  });

  logger.info('[AudioStudio] Audio asset processed', {
    assetId,
    ownerId,
    provider: synthesis.plan.providerId,
    model: synthesis.plan.modelId,
    voiceId: record.voiceId,
    language,
    renderStrategy: renderOutcome.renderer,
  });

  return {
    ...record,
    durationMs: Date.now() - startedAt,
    promptPreview: blueprint.prompt.fullPrompt.slice(0, 160),
    synthesisText,
    transcriptSegments,
  };
}

export async function listAudioStudioAssets(ownerId: string, limit = 12): Promise<AudioAssetRecord[]> {
  const snapshot = await adminDb
    .collection('generatedAssets')
    .where('ownerId', '==', ownerId)
    .where('type', '==', 'audio')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  const records: AudioAssetRecord[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as AudioAssetRecord;
    let downloadUrl = data.downloadUrl;
    let waveformPreviewUrl = data.waveformPreviewUrl;

    if (!downloadUrl && data.storagePath) {
      const file = adminStorage.bucket().file(data.storagePath);
      const [signed] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
      downloadUrl = signed;
    }

    if (!waveformPreviewUrl && data.waveformStoragePath) {
      const waveformFile = adminStorage.bucket().file(data.waveformStoragePath);
      const [signedWaveform] = await waveformFile.getSignedUrl({ action: 'read', expires: '03-01-2500' });
      waveformPreviewUrl = signedWaveform;
    }

    records.push({
      ...data,
      schemaVariant: data.schemaVariant || 'voice-generation-v1',
      assetId: typeof data.assetId === 'string' ? data.assetId : doc.id,
      downloadUrl,
      thumbnail: waveformPreviewUrl || data.thumbnail || downloadUrl || '',
      waveformPreviewUrl,
      waveformStoragePath: data.waveformStoragePath,
    });
  }

  return records;
}

export function getAudioStudioCapabilities() {
  return {
    voicePresets: AUDIO_VOICE_PRESETS,
    languages: AUDIO_LANGUAGES,
    defaultDurationSeconds: 30,
  };
}
