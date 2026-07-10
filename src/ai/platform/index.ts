export {
  aiPlatformConfig,
  type AIProviderMode,
} from './config';

export {
  PROVIDER_CATALOG,
  TASK_CATALOG,
  isProviderConfigured,
  getConfiguredProviderOrder,
  type AIProviderId,
  type AIRequestTask,
  type AIModality,
  type ProviderCatalogEntry,
  type TaskCatalogEntry,
} from './catalog';

export {
  createTextClient,
  createImageClient,
  createTextStream,
  executeTextCompletion,
  executeImageGeneration,
  executeVideoGeneration,
  executeAudioGeneration,
  resolveAIExecutionPlan,
  type AIExecutionPlan,
  type AITextRequest,
  type AITextResponse,
  type AIImageRequest,
  type AIImageResponse,
  type AIVideoRequest,
  type AIVideoResponse,
  type AIAudioRequest,
  type AIAudioResponse,
  type PlatformMessage,
} from './service';

export {
  orchestrateAIRequest,
  type AIQualityMode,
  type AIExecutionStrategy,
  type OrchestrationContext,
  type OrchestrationPlan,
} from './orchestrator';

export {
  buildStrategicAdvicePrompt,
  buildContentGenerationPrompt,
  buildRoadmapPrompt,
} from './prompts';

export {
  extractJsonObject,
} from './output';
