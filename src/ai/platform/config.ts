export type AIProviderMode = 'auto' | 'gateway' | 'direct';

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeGatewayBaseURL(value?: string): string {
  let baseURL = (value || 'https://ai-gateway.vercel.sh/v1').replace(/\/+$/, '');

  // `/v1/ai` is the AI SDK provider base URL, not the OpenAI-compatible
  // Chat Completions base URL used by this server-side client.
  if (baseURL.endsWith('/v1/ai')) {
    baseURL = baseURL.slice(0, -3);
  }

  if (!/\/v1$/i.test(baseURL)) {
    baseURL = `${baseURL}/v1`;
  }

  return baseURL;
}

export const aiPlatformConfig = {
  providerMode: (readEnv('AI_PROVIDER_MODE') as AIProviderMode | undefined)
    ?? (readEnv('AI_GATEWAY_BASE_URL') ? 'gateway' : 'direct'),
  gatewayBaseURL: normalizeGatewayBaseURL(readEnv('AI_GATEWAY_BASE_URL') || readEnv('VERCEL_AI_GATEWAY_BASE_URL')),
  gatewayApiKey: readEnv('AI_GATEWAY_API_KEY') || readEnv('VERCEL_AI_GATEWAY_API_KEY'),
  defaultProvider: readEnv('AI_DEFAULT_PROVIDER') || 'moonshot',
  defaultQualityMode: (readEnv('AI_DEFAULT_QUALITY_MODE') as 'economy' | 'balanced' | 'premium' | 'cinematic' | 'auto' | undefined) || 'balanced',
  textTimeoutMs: Number(readEnv('AI_TEXT_TIMEOUT_MS') || 30000),
  streamTimeoutMs: Number(readEnv('AI_STREAM_TIMEOUT_MS') || 60000),
  enableTelemetry: readEnv('AI_ENABLE_TELEMETRY') !== 'false',
  enableSemanticCache: readEnv('AI_ENABLE_SEMANTIC_CACHE') !== 'false',
  enableMemory: readEnv('AI_ENABLE_MEMORY') !== 'false',
} as const;
