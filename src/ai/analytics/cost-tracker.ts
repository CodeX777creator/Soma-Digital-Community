/**
 * Cost Tracking & Analytics
 * 
 * Tracks AI usage costs, provides optimization recommendations,
 * and enforces budget constraints.
 */

import { logger } from '@/lib/logger';
import { MODEL_CONTEXT_LIMITS, ModelId } from '@/ai/core/tokenizer';

// Cost per 1K tokens (input/output) for each model
const MODEL_COSTS: Record<ModelId, { input: number; output: number }> = {
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
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  operation: 'chat' | 'content_gen' | 'roadmap' | 'strategic_advice' | 'summary';
  cached: boolean;
  durationMs: number;
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

// In-memory storage (use database in production)
const usageRecords: UsageRecord[] = [];
const userBudgets = new Map<string, { daily: number; monthly: number }>();
const userSpending = new Map<string, { day: number; month: number; lastReset: number }>();

/**
 * Calculates cost for a request
 */
export function calculateCost(
  model: ModelId,
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
    id: `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    cost,
  };

  usageRecords.push(fullRecord);

  // Update user spending
  const userSpend = userSpending.get(record.userId) || { day: 0, month: 0, lastReset: Date.now() };
  userSpend.day += cost;
  userSpend.month += cost;
  userSpending.set(record.userId, userSpend);

  // Limit stored records
  if (usageRecords.length > 10000) {
    usageRecords.shift();
  }

  logger.debug('[CostTracker] Usage recorded', {
    userId: record.userId,
    operation: record.operation,
    model: record.model,
    cost: `$${cost.toFixed(6)}`,
    tokens: record.inputTokens + record.outputTokens,
  });

  return fullRecord;
}

/**
 * Gets cost analytics for a time period
 */
export function getAnalytics(
  options: {
    startTime?: number;
    endTime?: number;
    userId?: string;
  } = {}
): CostAnalytics {
  const { startTime, endTime, userId } = options;
  
  let records = usageRecords;
  
  if (startTime) {
    records = records.filter(r => r.timestamp >= startTime);
  }
  if (endTime) {
    records = records.filter(r => r.timestamp <= endTime);
  }
  if (userId) {
    records = records.filter(r => r.userId === userId);
  }

  const totalCost = records.reduce((sum, r) => sum + r.cost, 0);
  const totalTokens = records.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
  const totalLatency = records.reduce((sum, r) => sum + r.durationMs, 0);
  
  const byModel: CostAnalytics['byModel'] = {};
  const byOperation: CostAnalytics['byOperation'] = {};
  const byUser: CostAnalytics['byUser'] = {};

  for (const record of records) {
    // By model
    if (!byModel[record.model]) {
      byModel[record.model] = { cost: 0, tokens: 0, requests: 0 };
    }
    byModel[record.model].cost += record.cost;
    byModel[record.model].tokens += record.inputTokens + record.outputTokens;
    byModel[record.model].requests++;

    // By operation
    if (!byOperation[record.operation]) {
      byOperation[record.operation] = { cost: 0, requests: 0 };
    }
    byOperation[record.operation].cost += record.cost;
    byOperation[record.operation].requests++;

    // By user
    if (!byUser[record.userId]) {
      byUser[record.userId] = { cost: 0, requests: 0 };
    }
    byUser[record.userId].cost += record.cost;
    byUser[record.userId].requests++;
  }

  const cachedRequests = records.filter(r => r.cached).length;

  return {
    totalCost,
    totalTokens,
    byModel,
    byOperation,
    byUser,
    averageLatency: records.length > 0 ? totalLatency / records.length : 0,
    cacheHitRate: records.length > 0 ? (cachedRequests / records.length) * 100 : 0,
  };
}

/**
 * Sets budget for a user
 */
export function setUserBudget(
  userId: string,
  budget: { daily?: number; monthly?: number }
): void {
  const existing = userBudgets.get(userId) || { daily: Infinity, monthly: Infinity };
  userBudgets.set(userId, {
    daily: budget.daily ?? existing.daily,
    monthly: budget.monthly ?? existing.monthly,
  });
}

/**
 * Checks if user has exceeded budget
 */
export function checkBudget(userId: string): {
  exceeded: boolean;
  alerts: BudgetAlert[];
} {
  const budget = userBudgets.get(userId) || { daily: Infinity, monthly: Infinity };
  const spending = userSpending.get(userId) || { day: 0, month: 0, lastReset: Date.now() };
  
  const alerts: BudgetAlert[] = [];
  let exceeded = false;

  // Check daily budget
  if (budget.daily !== Infinity) {
    const dailyPercentage = (spending.day / budget.daily) * 100;
    
    if (spending.day >= budget.daily) {
      exceeded = true;
      alerts.push({
        type: 'critical',
        message: `Daily budget exceeded: $${spending.day.toFixed(2)} / $${budget.daily.toFixed(2)}`,
        currentSpend: spending.day,
        budget: budget.daily,
        percentage: dailyPercentage,
      });
    } else if (dailyPercentage >= 80) {
      alerts.push({
        type: 'warning',
        message: `Daily budget at ${dailyPercentage.toFixed(0)}%: $${spending.day.toFixed(2)} / $${budget.daily.toFixed(2)}`,
        currentSpend: spending.day,
        budget: budget.daily,
        percentage: dailyPercentage,
      });
    }
  }

  // Check monthly budget
  if (budget.monthly !== Infinity) {
    const monthlyPercentage = (spending.month / budget.monthly) * 100;
    
    if (spending.month >= budget.monthly) {
      exceeded = true;
      alerts.push({
        type: 'critical',
        message: `Monthly budget exceeded: $${spending.month.toFixed(2)} / $${budget.monthly.toFixed(2)}`,
        currentSpend: spending.month,
        budget: budget.monthly,
        percentage: monthlyPercentage,
      });
    } else if (monthlyPercentage >= 90) {
      alerts.push({
        type: 'warning',
        message: `Monthly budget at ${monthlyPercentage.toFixed(0)}%: $${spending.month.toFixed(2)} / $${budget.monthly.toFixed(2)}`,
        currentSpend: spending.month,
        budget: budget.monthly,
        percentage: monthlyPercentage,
      });
    }
  }

  return { exceeded, alerts };
}

/**
 * Gets optimization recommendations
 */
export function getRecommendations(userId?: string): string[] {
  const analytics = getAnalytics(userId ? { userId } : {});
  const recommendations: string[] = [];

  // Model optimization
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

  // Cache optimization
  if (analytics.cacheHitRate < 10) {
    recommendations.push(
      `Cache hit rate is ${analytics.cacheHitRate.toFixed(1)}%. Consider enabling semantic caching for repeated queries.`
    );
  }

  // Token efficiency
  const avgTokensPerRequest = analytics.totalTokens / (Object.values(analytics.byOperation).reduce((sum, o) => sum + o.requests, 0) || 1);
  if (avgTokensPerRequest > 3000) {
    recommendations.push(
      `Average ${avgTokensPerRequest.toFixed(0)} tokens per request. Consider using conversation summarization to reduce context window.`
    );
  }

  return recommendations;
}

/**
 * Resets daily spending (call at midnight)
 */
export function resetDailySpending(): void {
  for (const [userId, spending] of userSpending.entries()) {
    spending.day = 0;
    spending.lastReset = Date.now();
  }
  logger.info('[CostTracker] Daily spending reset');
}

/**
 * Resets monthly spending (call at month start)
 */
export function resetMonthlySpending(): void {
  for (const [userId, spending] of userSpending.entries()) {
    spending.month = 0;
    spending.lastReset = Date.now();
  }
  logger.info('[CostTracker] Monthly spending reset');
}

// Schedule resets
setInterval(resetDailySpending, 24 * 60 * 60 * 1000);
