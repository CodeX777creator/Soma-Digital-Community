export const STUDIO_CONTENT_TYPES = [
  'script',
  'caption',
  'blog',
  'carousel',
  'ad_copy',
  'email',
  'sales_funnel',
  'marketing_planner',
  'thumbnail',
  'prompt_library',
] as const;

export type StudioContentType = (typeof STUDIO_CONTENT_TYPES)[number];

export type StudioSchemaVariant = 'studio-text-v1' | 'image-generation-v1' | 'video-generation-v1' | 'voice-generation-v1';

export type ImageGenerationSchemaVariant = Extract<StudioSchemaVariant, 'image-generation-v1'>;
export type VideoGenerationSchemaVariant = Extract<StudioSchemaVariant, 'video-generation-v1'>;
export type VoiceGenerationSchemaVariant = Extract<StudioSchemaVariant, 'voice-generation-v1'>;
export type TextStudioSchemaVariant = Extract<StudioSchemaVariant, 'studio-text-v1'>;

export const LEGACY_STUDIO_CONTENT_TYPE_ALIASES: Record<string, StudioContentType> = {
  ad_copy: 'ad_copy',
  email_funnel: 'sales_funnel',
  landing_page_headline: 'ad_copy',
  value_proposition: 'ad_copy',
  social_post: 'caption',
  blog_outline: 'blog',
};

export type StudioTone =
  | 'professional'
  | 'casual'
  | 'encouraging'
  | 'direct'
  | 'bold'
  | 'playful'
  | 'premium';

export interface StudioGenerationInput {
  schemaVariant?: TextStudioSchemaVariant;
  contentType: StudioContentType | keyof typeof LEGACY_STUDIO_CONTENT_TYPE_ALIASES;
  businessContext: string;
  targetAudience: string;
  tone?: StudioTone;
  platform?: string;
  brandName?: string;
  brandVoice?: string;
  campaignGoal?: string;
  callToAction?: string;
  keywords?: string[];
  notes?: string;
  language?: string;
  userId?: string;
  conversationSummary?: string;
}

export interface StudioPromptLibraryEntry {
  id: string;
  title: string;
  description: string;
  recommendedFor: string[];
  tags: string[];
}

export interface StudioPromptPackEntry {
  title: string;
  prompt: string;
  useCase: string;
}

export interface StudioGenerationOutput {
  schemaVariant?: TextStudioSchemaVariant;
  contentType: StudioContentType;
  title: string;
  summary: string;
  generatedContent: string;
  strategicTips: string[];
  variants: string[];
  promptPack?: StudioPromptPackEntry[];
  sections?: Array<{
    heading: string;
    body: string;
  }>;
  metadata: Record<string, unknown>;
}

export interface StudioGenerationResult extends StudioGenerationOutput {
  providerId: string;
  modelId: string;
  durationMs: number;
  promptKey: string;
  promptVersion: string;
  schemaVariant: TextStudioSchemaVariant;
}

export interface StudioArtifactRecord extends StudioGenerationResult {
  artifactId: string;
  ownerId: string;
  source: 'generated' | 'cached';
  cacheKey: string;
  promptPreview: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const IMAGE_STYLE_PRESETS = [
  'photorealistic',
  'cinematic',
  'editorial',
  'minimal',
  'luxury',
  'product_mockup',
  'social_ad',
  'flat_illustration',
  '3d_render',
  'brand_campaign',
] as const;

export type ImageStylePreset = (typeof IMAGE_STYLE_PRESETS)[number];

export const IMAGE_ASPECT_RATIOS = [
  '1:1',
  '4:5',
  '16:9',
  '9:16',
  '3:2',
  '2:3',
] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];

export interface BrandTemplate {
  id?: string;
  name?: string;
  description?: string;
  logoUrl?: string;
  colors?: string[];
  fonts?: string[];
  notes?: string;
}

export interface ImageGenerationInput {
  schemaVariant?: ImageGenerationSchemaVariant;
  prompt: string;
  promptEdits?: string;
  negativePrompt?: string;
  stylePreset?: ImageStylePreset;
  aspectRatio?: ImageAspectRatio;
  brandTemplate?: BrandTemplate | null;
  brandName?: string;
  title?: string;
  tags?: string[];
  visibility?: 'private' | 'team' | 'public';
  userId?: string;
  userTier?: 'free' | 'explorer' | 'pro' | 'elite';
  providerPreference?: string;
  conversationSummary?: string;
}

export interface ImageAssetRecord {
  schemaVariant: ImageGenerationSchemaVariant;
  assetId: string;
  ownerId: string;
  type: 'image';
  title: string;
  prompt: string;
  promptEdits?: string;
  negativePrompt?: string;
  stylePreset: ImageStylePreset;
  aspectRatio: ImageAspectRatio;
  brandTemplate?: BrandTemplate | null;
  brandName?: string;
  storagePath: string;
  thumbnail: string;
  provider: string;
  model: string;
  credits?: number;
  promptVersion: string;
  visibility: 'private' | 'team' | 'public';
  tags: string[];
  checksum: string;
  status: 'completed' | 'failed';
  downloadUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ImageGenerationResult extends ImageAssetRecord {
  durationMs: number;
  mimeType: string;
  promptPreview: string;
  promptVersion: string;
}

export const VIDEO_STYLE_PRESETS = [
  'documentary',
  'cinematic',
  'product_demo',
  'social_reel',
  'youtube_explainer',
  'brand_story',
  'ugc',
  'event_highlight',
] as const;

export type VideoStylePreset = (typeof VIDEO_STYLE_PRESETS)[number];

export const VIDEO_ASPECT_RATIOS = IMAGE_ASPECT_RATIOS;
export type VideoAspectRatio = ImageAspectRatio;

export interface VideoScene {
  sceneNumber: number;
  durationSeconds: number;
  visualDescription: string;
  narration: string;
  onScreenText: string;
  cameraDirection?: string;
  transition?: string;
}

export interface VideoGenerationInput {
  schemaVariant?: VideoGenerationSchemaVariant;
  prompt: string;
  promptEdits?: string;
  negativePrompt?: string;
  stylePreset?: VideoStylePreset;
  aspectRatio?: VideoAspectRatio;
  durationSeconds?: number;
  captionsEnabled?: boolean;
  voiceoverTone?: string;
  brandTemplate?: BrandTemplate | null;
  brandName?: string;
  title?: string;
  tags?: string[];
  visibility?: 'private' | 'team' | 'public';
  userId?: string;
  userTier?: 'free' | 'explorer' | 'pro' | 'elite';
  providerPreference?: string;
  conversationSummary?: string;
}

export interface VideoAssetRecord {
  schemaVariant: VideoGenerationSchemaVariant;
  assetId: string;
  ownerId: string;
  type: 'video';
  title: string;
  prompt: string;
  promptEdits?: string;
  negativePrompt?: string;
  stylePreset: VideoStylePreset;
  aspectRatio: VideoAspectRatio;
  durationSeconds: number;
  captionsEnabled: boolean;
  voiceoverTone?: string;
  brandTemplate?: BrandTemplate | null;
  brandName?: string;
  storagePath: string;
  thumbnail: string;
  provider: string;
  model: string;
  promptVersion: string;
  visibility: 'private' | 'team' | 'public';
  tags: string[];
  checksum: string;
  status: 'completed' | 'queued' | 'failed';
  renderState: 'completed' | 'queued' | 'failed';
  downloadUrl?: string;
  sceneCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VideoGenerationResult extends VideoAssetRecord {
  durationMs: number;
  mimeType: string;
  promptPreview: string;
  script: string;
  captions: string[];
  scenes: VideoScene[];
  voiceoverScript: string;
  thumbnailPrompt: string;
  promptVersion: string;
}

export const AUDIO_LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
  'Arabic',
  'Hindi',
  'Swahili',
  'Yoruba',
] as const;

export type AudioLanguage = (typeof AUDIO_LANGUAGES)[number];

export const AUDIO_VOICE_PRESETS = [
  'narrator',
  'warm',
  'confident',
  'energetic',
  'premium',
  'conversational',
  'calm',
  'female',
  'male',
] as const;

export type AudioVoicePreset = (typeof AUDIO_VOICE_PRESETS)[number];

export interface AudioVoiceProfile {
  voiceId?: string;
  name?: string;
  description?: string;
  language?: AudioLanguage;
  style?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

export interface AudioGenerationInput {
  schemaVariant?: VoiceGenerationSchemaVariant;
  prompt: string;
  narrationText?: string;
  transcript?: string;
  title?: string;
  voicePreset?: AudioVoicePreset;
  voiceId?: string;
  voiceProfile?: AudioVoiceProfile | null;
  language?: AudioLanguage | string;
  secondaryVoiceId?: string;
  backgroundMusic?: boolean;
  includeIntro?: boolean;
  includeOutro?: boolean;
  durationSeconds?: number;
  brandTemplate?: BrandTemplate | null;
  brandName?: string;
  tone?: string;
  scriptStyle?: string;
  visibility?: 'private' | 'team' | 'public';
  tags?: string[];
  userId?: string;
  userTier?: 'free' | 'explorer' | 'pro' | 'elite';
  providerPreference?: string;
  conversationSummary?: string;
}

export interface AudioAssetRecord {
  schemaVariant: VoiceGenerationSchemaVariant;
  assetId: string;
  ownerId: string;
  type: 'audio';
  title: string;
  prompt: string;
  narrationText: string;
  transcript?: string;
  voicePreset: AudioVoicePreset;
  voiceId: string;
  secondaryVoiceId?: string;
  language: string;
  backgroundMusic: boolean;
  includeIntro: boolean;
  includeOutro: boolean;
  durationSeconds: number;
  tone?: string;
  scriptStyle?: string;
  brandTemplate?: BrandTemplate | null;
  brandName?: string;
  storagePath: string;
  thumbnail: string;
  provider: string;
  model: string;
  promptVersion: string;
  visibility: 'private' | 'team' | 'public';
  tags: string[];
  checksum: string;
  status: 'completed' | 'queued' | 'failed';
  renderState: 'completed' | 'queued' | 'failed';
  downloadUrl?: string;
  mimeType: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AudioGenerationResult extends AudioAssetRecord {
  durationMs: number;
  promptPreview: string;
  synthesisText: string;
  promptVersion: string;
}
