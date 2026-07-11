import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole } from '@/lib/serverAuth';

type FirestoreRecord = Record<string, any> & { id: string };

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDayBuckets(days: number): string[] {
  const buckets: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    buckets.push(formatDay(date));
  }
  return buckets;
}

function groupByDay(records: any[], days: number): Array<{ day: string; count: number }> {
  const buckets = buildDayBuckets(days);
  const counts = new Map(buckets.map((day) => [day, 0]));

  for (const record of records) {
    const date = toDate(record.createdAt ?? record.triggeredAt ?? record.timestamp);
    if (!date) continue;
    const day = formatDay(date);
    if (counts.has(day)) {
      counts.set(day, (counts.get(day) || 0) + 1);
    }
  }

  return buckets.map((day) => ({ day, count: counts.get(day) || 0 }));
}

function isActiveSubscription(sub: FirestoreRecord) {
  const status = String(sub.status || sub.subscriptionStatus || sub.state || '').toLowerCase();
  return status === 'active' || status === 'trialing';
}

function getSubscriptionPlan(sub: FirestoreRecord) {
  return String(sub.planId || sub.plan || sub.subscriptionPlan || sub.tier || sub.metadata?.planId || 'explorer').toLowerCase();
}

function getSubscriptionPrice(sub: FirestoreRecord) {
  const raw = sub.monthlyPrice ?? sub.price ?? sub.amount ?? sub.unitAmount ?? sub.planAmount ?? null;
  if (typeof raw === 'number') {
    return raw > 1000 ? raw / 100 : raw;
  }
  const plan = getSubscriptionPlan(sub);
  return { explorer: 0, pro: 97, elite: 297 }[plan] || 0;
}

function getUserName(user: FirestoreRecord) {
  return user.name || user.displayName || user.email || 'New user';
}

function normalizeDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(Math.max(Math.floor(parsed), 7), 90);
}

export type AdminAnalyticsDashboard = {
  windowDays: number;
  generatedAt: string;
  ai: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    averageLatency: number;
    cacheHitRate: number;
    byModel: Array<{ model: string; cost: number; tokens: number; requests: number }>;
    byOperation: Array<{ operation: string; cost: number; requests: number }>;
    chart: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  };
  routing: {
    totalDecisions: number;
    plannedCount: number;
    succeededCount: number;
    failedCount: number;
    byokCount: number;
    fallbackCount: number;
    byProvider: Array<{ providerId: string; decisions: number; successes: number; failures: number; byokCount: number; fallbackCount: number }>;
    byModel: Array<{ modelId: string; decisions: number; successes: number; failures: number; avgDurationMs: number; avgEstimatedCost: number }>;
    recentDecisions: Array<{ id: string; task: string; feature: string; providerId: string; modelId: string; status: string; reason: string; time: string | null; tone: string }>;
  };
  providerPerformance: {
    totalRequests: number;
    byProvider: Array<{ providerId: string; requestCount: number; successCount: number; failureCount: number; byokCount: number; fallbackCount: number; avgDurationMs: number; avgReservedCredits: number; avgChargedCredits: number }>;
    byModel: Array<{ modelId: string; providerId: string; requestCount: number; successCount: number; failureCount: number; avgDurationMs: number; avgReservedCredits: number; avgChargedCredits: number }>;
  };
  publishing: {
    totalAttempts: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    successRate: number;
    byPlatform: Array<{ platform: string; success: number; failed: number; total: number; successRate: number }>;
    chart: Array<{ date: string; attempts: number; success: number; failed: number }>;
    recentAttempts: Array<{ id: string; type: string; title: string; detail: string; time: string | null; tone: string }>;
  };
  users: {
    totalUsers: number;
    activeSubscriptions: number;
    paidUserCount: number;
    subRevenue: number;
    mrrTotal: number;
    signupChart: Array<{ date: string; signups: number }>;
    activity: Array<{ id: string; type: string; title: string; detail: string; time: string | null; tone: string }>;
  };
};

export async function getAdminAnalyticsDashboard(req: Request): Promise<AdminAnalyticsDashboard> {
  const request = req as Request & { nextUrl?: URL };
  const url = request.nextUrl || new URL(req.url);
  const days = normalizeDays(url.searchParams.get('days'));
  const startDate = new Date();
  startDate.setUTCHours(0, 0, 0, 0);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const startTimestamp = Timestamp.fromDate(startDate);
  const startMs = startDate.getTime();

  await requireRole(req as any, 'admin');

  const [
    usersSnap,
    subscriptionsSnap,
    resellerSalesSnap,
    aiUsageSnap,
    aiOutcomesSnap,
    aiProviderMetricsSnap,
    publishAttemptsSnap,
  ] = await Promise.all([
    adminDb.collection('users').orderBy('createdAt', 'desc').limit(1000).get(),
    adminDb.collection('subscriptions').orderBy('createdAt', 'desc').limit(1000).get(),
    adminDb.collection('resellerSales').orderBy('createdAt', 'desc').limit(1000).get(),
    adminDb.collection('aiUsageEvents')
      .where('timestamp', '>=', startMs)
      .orderBy('timestamp', 'desc')
      .limit(2000)
      .get(),
    adminDb.collection('aiOrchestrationOutcomes')
      .where('startedAt', '>=', startMs)
      .orderBy('startedAt', 'desc')
      .limit(2000)
      .get(),
    adminDb.collection('aiProviderMetrics')
      .where('dateKey', '>=', formatDay(startDate))
      .orderBy('dateKey', 'desc')
      .limit(1000)
      .get(),
    adminDb.collection('socialPublishAttempts')
      .where('triggeredAt', '>=', startTimestamp)
      .orderBy('triggeredAt', 'desc')
      .limit(2000)
      .get(),
  ]);

  const users = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FirestoreRecord[];
  const subscriptions = subscriptionsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FirestoreRecord[];
  const resellerSales = resellerSalesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FirestoreRecord[];
  const aiUsage = aiUsageSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FirestoreRecord[];
  const aiOutcomes = aiOutcomesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FirestoreRecord[];
  const aiProviderMetrics = aiProviderMetricsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FirestoreRecord[];
  const publishAttempts = publishAttemptsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as FirestoreRecord[];

  const activeSubscriptions = subscriptions.filter(isActiveSubscription);
  const mrrTotal = resellerSales.reduce((total, sale) => total + (typeof sale.grossAmount === 'number' ? sale.grossAmount : 0), 0);
  const subRevenue = activeSubscriptions.reduce((total, sub) => total + getSubscriptionPrice(sub), 0);
  const paidUserCount = users.filter((user) => {
    const plan = String(user.tier || user.plan || user.subscriptionPlan || 'explorer').toLowerCase();
    return plan !== 'explorer' && plan !== 'free' && plan !== '';
  }).length;

  const byModel = aiUsage.reduce<Record<string, { cost: number; tokens: number; requests: number }>>((acc, record) => {
    const model = String(record.model || 'unknown');
    const inputTokens = typeof record.inputTokens === 'number' ? record.inputTokens : 0;
    const outputTokens = typeof record.outputTokens === 'number' ? record.outputTokens : 0;
    const cost = typeof record.cost === 'number' ? record.cost : 0;

    if (!acc[model]) {
      acc[model] = { cost: 0, tokens: 0, requests: 0 };
    }
    acc[model].cost += cost;
    acc[model].tokens += inputTokens + outputTokens;
    acc[model].requests += 1;
    return acc;
  }, {});

  const byOperation = aiUsage.reduce<Record<string, { cost: number; requests: number }>>((acc, record) => {
    const operation = String(record.operation || 'unknown');
    const cost = typeof record.cost === 'number' ? record.cost : 0;
    if (!acc[operation]) {
      acc[operation] = { cost: 0, requests: 0 };
    }
    acc[operation].cost += cost;
    acc[operation].requests += 1;
    return acc;
  }, {});

  const aiTotalTokens = aiUsage.reduce((sum, record) => sum + (typeof record.inputTokens === 'number' ? record.inputTokens : 0) + (typeof record.outputTokens === 'number' ? record.outputTokens : 0), 0);
  const aiTotalCost = aiUsage.reduce((sum, record) => sum + (typeof record.cost === 'number' ? record.cost : 0), 0);
  const aiAverageLatency = aiUsage.length > 0
    ? aiUsage.reduce((sum, record) => sum + (typeof record.durationMs === 'number' ? record.durationMs : 0), 0) / aiUsage.length
    : 0;
  const aiCacheHitRate = aiUsage.length > 0
    ? (aiUsage.filter((record) => record.cached === true).length / aiUsage.length) * 100
    : 0;

  const publishTotal = publishAttempts.length;
  const publishSuccessCount = publishAttempts.filter((attempt) => attempt.status === 'success').length;
  const publishFailedCount = publishAttempts.filter((attempt) => attempt.status === 'failed').length;
  const publishSkippedCount = publishAttempts.filter((attempt) => attempt.status === 'skipped').length;
  const publishSuccessRate = publishTotal > 0 ? (publishSuccessCount / publishTotal) * 100 : 0;

  const byPlatform = publishAttempts.reduce<Record<string, { success: number; failed: number; total: number }>>((acc, attempt) => {
    const platform = String(attempt.platform || 'unknown');
    if (!acc[platform]) {
      acc[platform] = { success: 0, failed: 0, total: 0 };
    }
    acc[platform].total += 1;
    if (attempt.status === 'success') acc[platform].success += 1;
    if (attempt.status === 'failed') acc[platform].failed += 1;
    return acc;
  }, {});

  const aiModelRows = Object.entries(byModel)
    .map(([model, metrics]) => ({ model, ...metrics }))
    .sort((left, right) => right.cost - left.cost)
    .slice(0, 10);

  const aiOperationRows = Object.entries(byOperation)
    .map(([operation, metrics]) => ({ operation, ...metrics }))
    .sort((left, right) => right.cost - left.cost);

  const routingSummary = aiOutcomes.reduce<Record<string, {
    providerId: string;
    modelId: string;
    task: string;
    feature: string;
    decisions: number;
    successes: number;
    failures: number;
    byokCount: number;
    fallbackCount: number;
    totalDurationMs: number;
    totalEstimatedCost: number;
  }>>((acc, record) => {
    const providerId = String(record.providerId || 'unknown');
    const modelId = String(record.modelId || 'unknown');
    const key = `${providerId}__${modelId}`;
    if (!acc[key]) {
      acc[key] = {
        providerId,
        modelId,
        task: String(record.task || 'unknown'),
        feature: String(record.feature || 'unknown'),
        decisions: 0,
        successes: 0,
        failures: 0,
        byokCount: 0,
        fallbackCount: 0,
        totalDurationMs: 0,
        totalEstimatedCost: 0,
      };
    }
    const bucket = acc[key];
    bucket.decisions += 1;
    bucket.successes += record.status === 'succeeded' ? 1 : 0;
    bucket.failures += record.status === 'failed' ? 1 : 0;
    bucket.byokCount += record.billingSource === 'byok' ? 1 : 0;
    bucket.fallbackCount += typeof record.fallbackCount === 'number' ? record.fallbackCount : 0;
    bucket.totalDurationMs += typeof record.durationMs === 'number' ? record.durationMs : 0;
    bucket.totalEstimatedCost += typeof record.estimatedCostUsd === 'number' ? record.estimatedCostUsd : 0;
    return acc;
  }, {});

  const providerSummary = aiProviderMetrics.reduce<Record<string, {
    providerId: string;
    requestCount: number;
    successCount: number;
    failureCount: number;
    byokCount: number;
    fallbackCount: number;
    totalDurationMs: number;
    totalReservedCredits: number;
    totalChargedCredits: number;
  }>>((acc, record) => {
    const providerId = String(record.providerId || 'unknown');
    if (!acc[providerId]) {
      acc[providerId] = {
        providerId,
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        byokCount: 0,
        fallbackCount: 0,
        totalDurationMs: 0,
        totalReservedCredits: 0,
        totalChargedCredits: 0,
      };
    }
    const bucket = acc[providerId];
    bucket.requestCount += typeof record.requestCount === 'number' ? record.requestCount : 0;
    bucket.successCount += typeof record.successCount === 'number' ? record.successCount : 0;
    bucket.failureCount += typeof record.failureCount === 'number' ? record.failureCount : 0;
    bucket.byokCount += typeof record.byokCount === 'number' ? record.byokCount : 0;
    bucket.fallbackCount += typeof record.fallbackCount === 'number' ? record.fallbackCount : 0;
    bucket.totalDurationMs += typeof record.totalDurationMs === 'number' ? record.totalDurationMs : 0;
    bucket.totalReservedCredits += typeof record.creditsReserved === 'number' ? record.creditsReserved : 0;
    bucket.totalChargedCredits += typeof record.creditsCharged === 'number' ? record.creditsCharged : 0;
    return acc;
  }, {});

  const modelPerformanceSummary = aiProviderMetrics.reduce<Record<string, {
    modelId: string;
    providerId: string;
    requestCount: number;
    successCount: number;
    failureCount: number;
    totalDurationMs: number;
    totalReservedCredits: number;
    totalChargedCredits: number;
  }>>((acc, record) => {
    const modelId = String(record.lastModelId || 'unknown');
    const providerId = String(record.providerId || 'unknown');
    const key = `${providerId}__${modelId}`;
    if (!acc[key]) {
      acc[key] = {
        modelId,
        providerId,
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        totalDurationMs: 0,
        totalReservedCredits: 0,
        totalChargedCredits: 0,
      };
    }
    const bucket = acc[key];
    bucket.requestCount += typeof record.requestCount === 'number' ? record.requestCount : 0;
    bucket.successCount += typeof record.successCount === 'number' ? record.successCount : 0;
    bucket.failureCount += typeof record.failureCount === 'number' ? record.failureCount : 0;
    bucket.totalDurationMs += typeof record.totalDurationMs === 'number' ? record.totalDurationMs : 0;
    bucket.totalReservedCredits += typeof record.creditsReserved === 'number' ? record.creditsReserved : 0;
    bucket.totalChargedCredits += typeof record.creditsCharged === 'number' ? record.creditsCharged : 0;
    return acc;
  }, {});

  const routingByProvider = Object.values(routingSummary)
    .reduce<Record<string, { providerId: string; decisions: number; successes: number; failures: number; byokCount: number; fallbackCount: number }>>((acc, row) => {
      if (!acc[row.providerId]) {
        acc[row.providerId] = { providerId: row.providerId, decisions: 0, successes: 0, failures: 0, byokCount: 0, fallbackCount: 0 };
      }
      acc[row.providerId].decisions += row.decisions;
      acc[row.providerId].successes += row.successes;
      acc[row.providerId].failures += row.failures;
      acc[row.providerId].byokCount += row.byokCount;
      acc[row.providerId].fallbackCount += row.fallbackCount;
      return acc;
    }, {});

  const recentRoutingDecisions = aiOutcomes
    .slice(0, 12)
    .map((record) => ({
      id: record.id,
      task: String(record.task || 'unknown'),
      feature: String(record.feature || 'unknown'),
      providerId: String(record.providerId || 'unknown'),
      modelId: String(record.modelId || 'unknown'),
      status: String(record.status || 'planned'),
      reason: String(record.reason || 'No reason recorded'),
      time: toDate(record.startedAt)?.toISOString() || null,
      tone: record.status === 'succeeded' ? 'emerald' : record.status === 'failed' ? 'red' : 'cyan',
    }));

  const routingRows = Object.values(routingSummary)
    .map((row) => ({
      providerId: row.providerId,
      modelId: row.modelId,
      task: row.task,
      feature: row.feature,
      decisions: row.decisions,
      successes: row.successes,
      failures: row.failures,
      byokCount: row.byokCount,
      fallbackCount: row.fallbackCount,
      avgDurationMs: row.decisions > 0 ? row.totalDurationMs / row.decisions : 0,
      avgEstimatedCost: row.decisions > 0 ? row.totalEstimatedCost / row.decisions : 0,
    }))
    .sort((left, right) => right.decisions - left.decisions)
    .slice(0, 10);

  const providerPerformanceRows = Object.values(providerSummary)
    .map((row) => ({
      providerId: row.providerId,
      requestCount: row.requestCount,
      successCount: row.successCount,
      failureCount: row.failureCount,
      byokCount: row.byokCount,
      fallbackCount: row.fallbackCount,
      avgDurationMs: row.requestCount > 0 ? row.totalDurationMs / row.requestCount : 0,
      avgReservedCredits: row.requestCount > 0 ? row.totalReservedCredits / row.requestCount : 0,
      avgChargedCredits: row.requestCount > 0 ? row.totalChargedCredits / row.requestCount : 0,
    }))
    .sort((left, right) => right.requestCount - left.requestCount);

  const modelPerformanceRows = Object.values(modelPerformanceSummary)
    .map((row) => ({
      modelId: row.modelId,
      providerId: row.providerId,
      requestCount: row.requestCount,
      successCount: row.successCount,
      failureCount: row.failureCount,
      avgDurationMs: row.requestCount > 0 ? row.totalDurationMs / row.requestCount : 0,
      avgReservedCredits: row.requestCount > 0 ? row.totalReservedCredits / row.requestCount : 0,
      avgChargedCredits: row.requestCount > 0 ? row.totalChargedCredits / row.requestCount : 0,
    }))
    .sort((left, right) => right.requestCount - left.requestCount)
    .slice(0, 12);

  const routingTotalDecisions = aiOutcomes.length;
  const routingPlannedCount = aiOutcomes.filter((item) => item.status === 'planned').length;
  const routingSucceededCount = aiOutcomes.filter((item) => item.status === 'succeeded').length;
  const routingFailedCount = aiOutcomes.filter((item) => item.status === 'failed').length;
  const routingByokCount = aiOutcomes.filter((item) => item.billingSource === 'byok').length;
  const routingFallbackCount = aiOutcomes.reduce((sum, item) => sum + (typeof item.fallbackCount === 'number' ? item.fallbackCount : 0), 0);

  const publishPlatformRows = Object.entries(byPlatform)
    .map(([platform, metrics]) => ({ platform, ...metrics, successRate: metrics.total > 0 ? (metrics.success / metrics.total) * 100 : 0 }))
    .sort((left, right) => right.total - left.total);

  const signupChart = groupByDay(users, days).map((bucket) => ({
    date: bucket.day,
    signups: users.filter((user) => {
      const createdAt = toDate(user.createdAt);
      return createdAt ? formatDay(createdAt) === bucket.day : false;
    }).length,
  }));

  const aiChart = groupByDay(aiUsage, days).map((bucket) => ({
    date: bucket.day,
    requests: aiUsage.filter((record) => {
      const createdAt = toDate(record.createdAt || record.timestamp);
      return createdAt ? formatDay(createdAt) === bucket.day : false;
    }).length,
    tokens: aiUsage.reduce((sum, record) => {
      const createdAt = toDate(record.createdAt || record.timestamp);
      if (!createdAt || formatDay(createdAt) !== bucket.day) return sum;
      return sum + (typeof record.inputTokens === 'number' ? record.inputTokens : 0) + (typeof record.outputTokens === 'number' ? record.outputTokens : 0);
    }, 0),
    cost: aiUsage.reduce((sum, record) => {
      const createdAt = toDate(record.createdAt || record.timestamp);
      if (!createdAt || formatDay(createdAt) !== bucket.day) return sum;
      return sum + (typeof record.cost === 'number' ? record.cost : 0);
    }, 0),
  }));

  const publishChart = groupByDay(publishAttempts, days).map((bucket) => ({
    date: bucket.day,
    attempts: publishAttempts.filter((record) => {
      const createdAt = toDate(record.triggeredAt);
      return createdAt ? formatDay(createdAt) === bucket.day : false;
    }).length,
    success: publishAttempts.filter((record) => {
      const createdAt = toDate(record.triggeredAt);
      return createdAt ? formatDay(createdAt) === bucket.day && record.status === 'success' : false;
    }).length,
    failed: publishAttempts.filter((record) => {
      const createdAt = toDate(record.triggeredAt);
      return createdAt ? formatDay(createdAt) === bucket.day && record.status === 'failed' : false;
    }).length,
  }));

  const recentAIActions = aiUsage.slice(0, 10).map((record) => ({
    id: record.id,
    type: 'AI request',
    title: `${record.operation || 'unknown'} via ${record.model || 'unknown model'}`,
    detail: `${(typeof record.inputTokens === 'number' ? record.inputTokens : 0) + (typeof record.outputTokens === 'number' ? record.outputTokens : 0)} tokens`,
    time: toDate(record.createdAt || record.timestamp)?.toISOString() || null,
    tone: record.cached ? 'emerald' : 'cyan',
  }));

  const recentPublishActions = publishAttempts.slice(0, 10).map((record) => ({
    id: record.id,
    type: record.status === 'success' ? 'Published' : record.status === 'failed' ? 'Publish failed' : 'Publish attempt',
    title: `${record.platform || 'unknown'} / ${record.socialAccountId || 'default account'}`,
    detail: record.errorMessage || record.providerResponse || 'No details',
    time: toDate(record.triggeredAt)?.toISOString() || null,
    tone: record.status === 'success' ? 'emerald' : record.status === 'failed' ? 'red' : 'slate',
  }));

  const recentUsers = users.slice(0, 8).map((user) => ({
    id: `user-${user.id}`,
    type: 'New signup',
    title: getUserName(user),
    detail: user.email || user.uid || 'User',
    time: toDate(user.createdAt)?.toISOString() || null,
    tone: 'cyan',
  }));

  const activity = [...recentAIActions, ...recentPublishActions, ...recentUsers]
    .filter((item) => item.time)
    .sort((left, right) => String(right.time).localeCompare(String(left.time)))
    .slice(0, 20);

  return {
    windowDays: days,
    generatedAt: new Date().toISOString(),
    ai: {
      totalRequests: aiUsage.length,
      totalTokens: aiTotalTokens,
      totalCost: aiTotalCost,
      averageLatency: aiAverageLatency,
      cacheHitRate: aiCacheHitRate,
      byModel: aiModelRows,
      byOperation: aiOperationRows,
      chart: aiChart,
    },
    routing: {
      totalDecisions: routingTotalDecisions,
      plannedCount: routingPlannedCount,
      succeededCount: routingSucceededCount,
      failedCount: routingFailedCount,
      byokCount: routingByokCount,
      fallbackCount: routingFallbackCount,
      byProvider: Object.values(routingByProvider).sort((left, right) => right.decisions - left.decisions),
      byModel: routingRows,
      recentDecisions: recentRoutingDecisions,
    },
    providerPerformance: {
      totalRequests: aiProviderMetrics.reduce((sum, record) => sum + (typeof record.requestCount === 'number' ? record.requestCount : 0), 0),
      byProvider: providerPerformanceRows,
      byModel: modelPerformanceRows,
    },
    publishing: {
      totalAttempts: publishTotal,
      successCount: publishSuccessCount,
      failedCount: publishFailedCount,
      skippedCount: publishSkippedCount,
      successRate: publishSuccessRate,
      byPlatform: publishPlatformRows,
      chart: publishChart,
      recentAttempts: recentPublishActions,
    },
    users: {
      totalUsers: users.length,
      activeSubscriptions: activeSubscriptions.length,
      paidUserCount,
      subRevenue,
      mrrTotal,
      signupChart,
      activity,
    },
  };
}
