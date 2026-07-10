export type AIProviderMode = 'auto' | 'gateway' | 'direct';

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const aiPlatformConfig = {
  providerMode: (readEnv('AI_PROVIDER_MODE') as AIProviderMode | undefined)
    ?? (readEnv('AI_GATEWAY_BASE_URL') ? 'gateway' : 'direct'),
  gatewayBaseURL: readEnv('AI_GATEWAY_BASE_URL') || readEnv('VERCEL_AI_GATEWAY_BASE_URL'),
  gatewayApiKey: readEnv('AI_GATEWAY_API_KEY') || readEnv('VERCEL_AI_GATEWAY_API_KEY'),
  defaultProvider: readEnv('AI_DEFAULT_PROVIDER') || 'moonshot',
  defaultQualityMode: (readEnv('AI_DEFAULT_QUALITY_MODE') as 'economy' | 'balanced' | 'premium' | 'cinematic' | 'auto' | undefined) || 'balanced',
  textTimeoutMs: Number(readEnv('AI_TEXT_TIMEOUT_MS') || 30000),
  streamTimeoutMs: Number(readEnv('AI_STREAM_TIMEOUT_MS') || 60000),
  enableTelemetry: readEnv('AI_ENABLE_TELEMETRY') !== 'false',
  enableSemanticCache: readEnv('AI_ENABLE_SEMANTIC_CACHE') !== 'false',
  enableMemory: readEnv('AI_ENABLE_MEMORY') !== 'false',
} as const;

