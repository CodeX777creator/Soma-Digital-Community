import { genkit } from 'genkit';
import OpenAI from 'openai';

// ─── CONFIG ───
const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';

// Lazy initialization of Kimi client to avoid build-time errors
let kimiClientInstance: OpenAI | null = null;
function getKimiClient(): OpenAI {
  if (!kimiClientInstance) {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) {
      throw new Error('KIMI_API_KEY environment variable is not set');
    }
    kimiClientInstance = new OpenAI({
      apiKey,
      baseURL: KIMI_BASE_URL,
    });
  }
  return kimiClientInstance;
}

// Budget mode: 'strict' (always cheapest viable), 'balanced' (default), 'performance' (always best)
const BUDGET_MODE = (process.env.KIMI_BUDGET_MODE || 'balanced') as 'strict' | 'balanced' | 'performance';

// ─── COST HIERARCHY (cheapest → most expensive) ───
const MODEL_TIERS = {
  SIMPLE:   { id: 'moonshot-v1-8k',   temp: 0.7,  maxTokens: 512,  costRank: 1 },
  BALANCED: { id: 'moonshot-v1-32k',  temp: 0.7,  maxTokens: 1024, costRank: 2 },
  STANDARD: { id: 'moonshot-v1-128k', temp: 0.7,  maxTokens: 2048, costRank: 3 },
  SMART:    { id: 'kimi-k2.5',        temp: 1.0,  maxTokens: 2048, costRank: 4 },
  MAX:      { id: 'kimi-k2.6',        temp: 0.7,  maxTokens: 4096, costRank: 5 },
} as const;

// ─── TASK CLASSIFIER (local, zero API cost) ───
function classifyTask(messages: any[]): { tier: keyof typeof MODEL_TIERS; reason: string } {
  const lastMsg = messages[messages.length - 1];
  const content = Array.isArray(lastMsg?.content)
    ? lastMsg.content.map((c: any) => c.text || '').join('')
    : lastMsg?.content || '';
  const text = content.toLowerCase().trim();
  const len = text.length;

  // 1. ULTRA-SIMPLE: greetings, acknowledgments, single-word replies
  if (len < 40 && /^(hi|hello|hey|thanks|ok|great|cool|nice|bye|good morning)\b|^(\w+\s){0,3}\?$/.test(text)) {
    return { tier: 'SIMPLE', reason: 'greeting/short-query' };
  }

  // 2. COMPLEX INDICATORS: strategy, code, analysis, long context
  const complexSignals = [
    'strategy', 'audit', 'analyze', 'compare', 'debug', 'code', 'review', 'market research',
    'business plan', 'competitor', 'financial model', 'explain in detail', 'step by step',
    'write a', 'generate', 'create a', 'how do i build', 'troubleshoot'
  ];
  const hasComplex = complexSignals.some(k => text.includes(k));
  const isLongQuery = len > 300;

  if (BUDGET_MODE === 'performance') {
    return { tier: 'MAX', reason: 'performance-mode' };
  }
  if (hasComplex || isLongQuery) {
    return { tier: BUDGET_MODE === 'strict' ? 'SMART' : 'MAX', reason: hasComplex ? 'complex-keywords' : 'long-query' };
  }

  // 3. MEDIUM: general advice, explanations, how-to
  const mediumSignals = ['explain', 'how to', 'what is', 'should i', 'tips', 'advice', 'help me'];
  if (mediumSignals.some(k => text.includes(k)) || len > 100) {
    return { tier: BUDGET_MODE === 'strict' ? 'SIMPLE' : 'BALANCED', reason: 'general-mentoring' };
  }

  // 4. Default
  return { tier: BUDGET_MODE === 'strict' ? 'SIMPLE' : 'BALANCED', reason: 'default' };
}

// ─── SMART GENERATOR WITH FALLBACK ───
async function generateWithKimi(request: any) {
  const classification = classifyTask(request.messages);
  let tier = classification.tier;
  let modelConfig = MODEL_TIERS[tier];

  // Allow frontend override via request.config.modelHint (e.g., 'cheap' | 'smart')
  const hint = request.config?.modelHint;
  if (hint === 'cheap') { tier = 'SIMPLE'; modelConfig = MODEL_TIERS.SIMPLE; }
  if (hint === 'smart') { tier = 'MAX'; modelConfig = MODEL_TIERS.MAX; }

  // Normalize messages
  const messages = request.messages.map((m: any) => {
    const content = Array.isArray(m.content)
      ? m.content.map((c: any) => c.text || c).join('')
      : m.content;
    return { role: m.role === 'model' ? 'assistant' : m.role, content };
  });

  // Try primary model, fallback to cheaper if it fails
  const attempts = [modelConfig];
  if (tier !== 'SIMPLE') attempts.push(MODEL_TIERS.SIMPLE);

  const client = getKimiClient();
  let lastError: any;
  for (const attempt of attempts) {
    try {
      console.log(`[KimiRouter] ${classification.reason} → ${attempt.id} (mode: ${BUDGET_MODE})`);
      const response = await client.chat.completions.create({
        model: attempt.id,
        messages,
        temperature: attempt.temp,
        max_tokens: Math.min(attempt.maxTokens, request.config?.maxOutputTokens ?? attempt.maxTokens),
        top_p: request.config?.topP ?? 0.9,
        ...(request.config?.stopSequences && { stop: request.config.stopSequences }),
      });

      const choice = response.choices?.[0];
      if (!choice?.message?.content) throw new Error('Empty response');

      // Genkit v2 format: return message object directly
      return {
        message: {
          role: 'model' as const,
          content: [{ text: choice.message.content }],
        },
        // Expose routing metadata
        custom: { modelUsed: attempt.id, reason: classification.reason },
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`[KimiRouter] ${attempt.id} failed:`, err.message);
    }
  }
  throw new Error(`All Kimi models failed. Last error: ${lastError?.message}`);
}

// ─── GENKIT MODEL DEFINITION ───
const kimiModelInfo = {
  apiVersion: 'v2' as const,
  name: 'kimi',
  label: 'Kimi Smart Router',
  supports: {
    multimodal: false,
    tools: false,
    systemRole: true,
  },
};

export const ai = genkit({ model: 'kimi' });
ai.defineModel(kimiModelInfo, generateWithKimi);

// Backward-compatible alias for existing code
export const KIMI_MODELS = {
  FLASH: MODEL_TIERS.SIMPLE.id,      // moonshot-v1-8k   (cheapest, fastest)
  BALANCED: MODEL_TIERS.BALANCED.id, // moonshot-v1-32k  (balanced)
  STANDARD: MODEL_TIERS.STANDARD.id, // moonshot-v1-128k (long context)
  SMART: MODEL_TIERS.SMART.id,       // kimi-k2.5        (reasoning)
  PREMIUM: MODEL_TIERS.MAX.id,       // kimi-k2.6        (best quality)
} as const;

// ─── EXPORTS ───
export { MODEL_TIERS, classifyTask, BUDGET_MODE };
