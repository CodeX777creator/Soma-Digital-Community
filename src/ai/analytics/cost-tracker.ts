/**
 * Cost Tracking & Analytics
 *
 * Firestore-backed AI usage analytics and budget enforcement.
 */

import { logger } from '@/lib/logger';
import { queryAIUsageEvents, readUserBudget, persistAIUsageEvent, upsertUserBudget } from '@/ai/telemetry/firestore';

// Cost per 1K tokens (input/output) for each model
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'moonshot-v1-8k': { input: 0.0005, output: 0.0015 },
  'moonshot-v1-32k': { input: 0.001, output: 0.003 },
  'moonshot-v1-128k': { input: 0.002, output: 0.006 },
  'kimi-k2.5': { input: 0.005, output: 0.015 },
  'kimi-k2.6': { input: 0.01, output: 0.03 },
};

export interface UsageRecord {
  id: string;
  timestamp: number;
  userId: string;
  sessionId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  operation: 'chat' | 'content_gen' | 'roadmap' | 'strategic_advice' | 'summary' | 'image_gen' | 'video_gen' | 'audio_gen';
  cached: boolean;
  durationMs: number;
  promptVersion?: string;
}

export interface CostAnalytics {
  totalCost: number;
  totalTokens: number;
  byModel: Record<string, { cost: number; tokens: number; requests: number }>;
  byOperation: Record<string, { cost: number; requests: number }>;
  byUser: Record<string, { cost: number; requests: number }>;
  averageLatency: number;
  cacheHitRate: number;
}

export interface BudgetAlert {
  type: 'warning' | 'critical';
  message: string;
  currentSpend: number;
  budget: number;
  percentage: number;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getWindowStart(daysAgo: number): number {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.getTime();
}

/**
 * Calculates cost for a request
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;

  const inputCost = (inputTokens / 1000) * costs.input;
  const outputCost = (outputTokens / 1000) * costs.output;

  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Records a usage event
 */
export function recordUsage(record: Omit<UsageRecord, 'id' | 'cost'>): UsageRecord {
  const cost = calculateCost(record.model, record.inputTokens, record.outputTokens);

  const fullRecord: UsageRecord = {
    ...record,
    id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    cost,
  };

  void persistAIUsageEvent(fullRecord as unknown as Record<string, unknown> & { id: string; timestamp: number }).catch((error) => {
    logger.warn('[CostTracker] Failed to persist usage record', {
      recordId: fullRecord.id,
      userId: fullRecord.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  logger.debug('[CostTracker] Usage recorded', {
    userId: record.userId,
    operation: record.operation,
    model: record.model,
    cost: `$${cost.toFixed(6)}`,
    tokens: record.inputTokens + record.outputTokens,
    promptVersion: record.promptVersion || 'unknown',
  });

  return fullRecord;
}

/**
 * Gets cost analytics for a time period
 */
export async function getAnalytics(
  options: {
    startTime?: number;
    endTime?: number;
    userId?: string;
  } = {}
): Promise<CostAnalytics> {
  const records = await queryAIUsageEvents(options);

  const normalized = records.map((record) => ({
    ...record,
    timestamp: typeof record.timestamp === 'number' ? record.timestamp : Number(record.timestamp || 0),
    userId: String(record.userId || 'unknown'),
    model: String(record.model || 'unknown'),
    inputTokens: typeof record.inputTokens === 'number' ? record.inputTokens : 0,
    outputTokens: typeof record.outputTokens === 'number' ? record.outputTokens : 0,
    cost: typeof record.cost === 'number' ? record.cost : 0,
    operation: String(record.operation || 'chat'),
    durationMs: typeof record.durationMs === 'number' ? record.durationMs : 0,
    cached: record.cached === true,
  }));

  const totalCost = normalized.reduce((sum, record) => sum + record.cost, 0);
  const totalTokens = normalized.reduce((sum, record) => sum + record.inputTokens + record.outputTokens, 0);
  const totalLatency = normalized.reduce((sum, record) => sum + record.durationMs, 0);

  const byModel: CostAnalytics['byModel'] = {};
  const byOperation: CostAnalytics['byOperation'] = {};
  const byUser: CostAnalytics['byUser'] = {};

  for (const record of normalized) {
    if (!byModel[record.model]) {
      byModel[record.model] = { cost: 0, tokens: 0, requests: 0 };
    }
    byModel[record.model].cost += record.cost;
    byModel[record.model].tokens += record.inputTokens + record.outputTokens;
    byModel[record.model].requests += 1;

    if (!byOperation[record.operation]) {
      byOperation[record.operation] = { cost: 0, requests: 0 };
    }
    byOperation[record.operation].cost += record.cost;
    byOperation[record.operation].requests += 1;

    if (!byUser[record.userId]) {
      byUser[record.userId] = { cost: 0, requests: 0 };
    }
    byUser[record.userId].cost += record.cost;
    byUser[record.userId].requests += 1;
  }

  const cachedRequests = normalized.filter((record) => record.cached).length;

  return {
    totalCost,
    totalTokens,
    byModel,
    byOperation,
    byUser,
    averageLatency: normalized.length > 0 ? totalLatency / normalized.length : 0,
    cacheHitRate: normalized.length > 0 ? (cachedRequests / normalized.length) * 100 : 0,
  };
}

/**
 * Sets budget for a user
 */
export function setUserBudget(
  userId: string,
  budget: { daily?: number; monthly?: number }
): void {
  void upsertUserBudget({
    userId,
    dailyCap: budget.daily,
    monthlyCap: budget.monthly,
  }).catch((error) => {
    logger.warn('[CostTracker] Failed to persist budget', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function getSpendForWindow(userId: string, startTime: number, endTime: number): Promise<number> {
  const records = await queryAIUsageEvents({ startMs: startTime, endMs: endTime, userId, limit: 2000 });
  return records.reduce((sum, record) => sum + (typeof record.cost === 'number' ? record.cost : 0), 0);
}

/**
 * Checks if user has exceeded budget
 */
export async function checkBudget(userId: string): Promise<{
  exceeded: boolean;
  alerts: BudgetAlert[];
}> {
  const budget = await readUserBudget(userId);
  const dailyCap = budget?.dailyCap ?? Infinity;
  const monthlyCap = budget?.monthlyCap ?? Infinity;
  const dailySpend = await getSpendForWindow(userId, getWindowStart(1), Date.now());
  const monthlySpend = await getSpendForWindow(userId, getWindowStart(30), Date.now());

  const alerts: BudgetAlert[] = [];
  let exceeded = false;

  if (dailyCap !== Infinity) {
    const dailyPercentage = (dailySpend / dailyCap) * 100;
    if (dailySpend >= dailyCap) {
      exceeded = true;
      alerts.push({
        type: 'critical',
        message: `Daily budget exceeded: $${dailySpend.toFixed(2)} / $${dailyCap.toFixed(2)}`,
        currentSpend: dailySpend,
        budget: dailyCap,
        percentage: dailyPercentage,
      });
    } else if (dailyPercentage >= 80) {
      alerts.push({
        type: 'warning',
        message: `Daily budget at ${dailyPercentage.toFixed(0)}%: $${dailySpend.toFixed(2)} / $${dailyCap.toFixed(2)}`,
        currentSpend: dailySpend,
        budget: dailyCap,
        percentage: dailyPercentage,
      });
    }
  }

  if (monthlyCap !== Infinity) {
    const monthlyPercentage = (monthlySpend / monthlyCap) * 100;
    if (monthlySpend >= monthlyCap) {
      exceeded = true;
      alerts.push({
        type: 'critical',
        message: `Monthly budget exceeded: $${monthlySpend.toFixed(2)} / $${monthlyCap.toFixed(2)}`,
        currentSpend: monthlySpend,
        budget: monthlyCap,
        percentage: monthlyPercentage,
      });
    } else if (monthlyPercentage >= 90) {
      alerts.push({
        type: 'warning',
        message: `Monthly budget at ${monthlyPercentage.toFixed(0)}%: $${monthlySpend.toFixed(2)} / $${monthlyCap.toFixed(2)}`,
        currentSpend: monthlySpend,
        budget: monthlyCap,
        percentage: monthlyPercentage,
      });
    }
  }

  return { exceeded, alerts };
}

/**
 * Gets optimization recommendations
 */
export async function getRecommendations(userId?: string): Promise<string[]> {
  const analytics = await getAnalytics(userId ? { userId } : {});
  const recommendations: string[] = [];

  const modelUsage = Object.entries(analytics.byModel);
  if (modelUsage.length > 0) {
    const sortedByCost = modelUsage.sort((a, b) => b[1].cost - a[1].cost);
    const topModel = sortedByCost[0];

    if (topModel[0].includes('k2.6') && topModel[1].requests > 100) {
      recommendations.push(
        `Consider using a lighter model for routine queries. You're spending $${topModel[1].cost.toFixed(2)} on premium model (${topModel[0]}).`
      );
    }
  }

  if (analytics.cacheHitRate < 10) {
    recommendations.push(
      `Cache hit rate is ${analytics.cacheHitRate.toFixed(1)}%. Consider enabling semantic caching for repeated queries.`
    );
  }

  const avgTokensPerRequest = analytics.totalTokens / (Object.values(analytics.byOperation).reduce((sum, operation) => sum + operation.requests, 0) || 1);
  if (avgTokensPerRequest > 3000) {
    recommendations.push(
      `Average ${avgTokensPerRequest.toFixed(0)} tokens per request. Consider using conversation summarization to reduce context window.`
    );
  }

  return recommendations;
}

/**
 * Resets daily spending state.
 * Firestore now holds the source of truth, so this is a lightweight no-op hook.
 */
export function resetDailySpending(): void {
  logger.info('[CostTracker] Daily spending reset handled by Firestore-backed usage windows');
}

/**
 * Resets monthly spending state.
 * Firestore now holds the source of truth, so this is a lightweight no-op hook.
 */
export function resetMonthlySpending(): void {
  logger.info('[CostTracker] Monthly spending reset handled by Firestore-backed usage windows');
}
