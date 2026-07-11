import { Timestamp } from 'firebase-admin/firestore';
import { admin, adminDb } from '@/lib/firebaseAdmin';

export const AI_USAGE_EVENTS_COLLECTION = 'aiUsageEvents';
export const AI_USAGE_BUDGETS_COLLECTION = 'aiUsageBudgets';
export const AI_SEMANTIC_CACHE_COLLECTION = 'aiSemanticCache';
export const AI_ORCHESTRATION_OUTCOMES_COLLECTION = 'aiOrchestrationOutcomes';
export const AI_PROVIDER_METRICS_COLLECTION = 'aiProviderMetrics';
export const AI_STUDIO_ARTIFACTS_COLLECTION = 'aiStudioArtifacts';

export interface AIUsageBudgetRecord {
  userId: string;
  dailyCap?: number;
  monthlyCap?: number;
  concurrentJobs?: number;
  monthlyCredits?: number;
  updatedAt?: unknown;
  createdAt?: unknown;
}

export interface AISemanticCacheRecord {
  cacheId: string;
  scope: 'global' | 'user';
  userId?: string;
  query: string;
  queryEmbedding?: number[];
  response: string;
  metadata: {
    model: string;
    tokensUsed: number;
    timestamp: number;
    userId?: string;
    sessionId?: string;
  };
  accessStats: {
    hits: number;
    lastAccessed: number;
  };
  expiresAt: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AIOrchestrationOutcomeRecord {
  traceId: string;
  requestId: string;
  userId: string;
  task: string;
  feature: string;
  modality: string;
  providerId: string;
  modelId: string;
  providerMode: string;
  qualityMode: string;
  billingSource: string;
  byokPreferred: boolean;
  reason: string;
  fallbackCount: number;
  status: 'planned' | 'succeeded' | 'failed';
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  errorMessage?: string;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  creditsReserved?: number;
  creditsCharged?: number;
  creditsRefunded?: number;
  metadata?: Record<string, unknown>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AIProviderMetricRecord {
  metricId: string;
  providerId: string;
  dateKey: string;
  task: string;
  modality: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  fallbackCount: number;
  byokCount: number;
  creditsReserved: number;
  creditsCharged: number;
  creditsRefunded: number;
  totalDurationMs: number;
  lastRequestId?: string;
  lastModelId?: string;
  lastStatus?: string;
  lastReason?: string;
  updatedAt?: unknown;
  createdAt?: unknown;
}

export interface AIStudioArtifactRecord {
  artifactId: string;
  ownerId: string;
  schemaVariant: string;
  contentType: string;
  title: string;
  summary: string;
  generatedContent: string;
  strategicTips: string[];
  variants: string[];
  sections?: Array<{
    heading: string;
    body: string;
  }>;
  promptPack?: Array<{
    title: string;
    prompt: string;
    useCase: string;
  }>;
  metadata: Record<string, unknown>;
  providerId: string;
  modelId: string;
  promptKey: string;
  promptVersion: string;
  cacheKey: string;
  source: 'generated' | 'cached';
  promptPreview: string;
  durationMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export async function persistAIUsageEvent(record: Record<string, unknown> & { id: string; timestamp: number }): Promise<void> {
  await adminDb.collection(AI_USAGE_EVENTS_COLLECTION).doc(record.id).set({
    ...record,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function queryAIUsageEvents(options: {
  startMs?: number;
  endMs?: number;
  userId?: string;
  limit?: number;
} = {}): Promise<Array<Record<string, unknown> & { id: string }>> {
  const { startMs, endMs, userId, limit = 2000 } = options;
  let query: FirebaseFirestore.Query = adminDb.collection(AI_USAGE_EVENTS_COLLECTION).orderBy('timestamp', 'desc').limit(limit);

  if (typeof startMs === 'number') {
    query = query.where('timestamp', '>=', startMs);
  }
  if (typeof endMs === 'number') {
    query = query.where('timestamp', '<=', endMs);
  }
  if (typeof userId === 'string' && userId.trim()) {
    query = query.where('userId', '==', userId.trim());
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Array<Record<string, unknown> & { id: string }>;
}

export async function upsertUserBudget(record: AIUsageBudgetRecord): Promise<void> {
  await adminDb.collection(AI_USAGE_BUDGETS_COLLECTION).doc(record.userId).set({
    ...record,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: record.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function readUserBudget(userId: string): Promise<AIUsageBudgetRecord | null> {
  const snapshot = await adminDb.collection(AI_USAGE_BUDGETS_COLLECTION).doc(userId).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as AIUsageBudgetRecord;
}

export async function persistSemanticCacheEntry(record: AISemanticCacheRecord): Promise<void> {
  await adminDb.collection(AI_SEMANTIC_CACHE_COLLECTION).doc(record.cacheId).set({
    ...record,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: record.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function querySemanticCacheCandidates(userId?: string, limit = 60): Promise<AISemanticCacheRecord[]> {
  const collections: FirebaseFirestore.Query[] = [
    adminDb.collection(AI_SEMANTIC_CACHE_COLLECTION).where('scope', '==', 'global').orderBy('updatedAt', 'desc').limit(limit),
  ];

  if (userId) {
    collections.push(
      adminDb.collection(AI_SEMANTIC_CACHE_COLLECTION).where('scope', '==', 'user').where('userId', '==', userId).orderBy('updatedAt', 'desc').limit(limit)
    );
  }

  const snapshots = await Promise.all(collections.map((query) => query.get()));
  return snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.data() as AISemanticCacheRecord));
}

export async function deleteSemanticCacheEntries(cacheIds: string[]): Promise<number> {
  if (cacheIds.length === 0) return 0;

  const batch = adminDb.batch();
  for (const cacheId of cacheIds.slice(0, 400)) {
    batch.delete(adminDb.collection(AI_SEMANTIC_CACHE_COLLECTION).doc(cacheId));
  }
  await batch.commit();
  return Math.min(cacheIds.length, 400);
}

function dateKeyFromMs(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

export async function persistOrchestrationOutcome(record: AIOrchestrationOutcomeRecord): Promise<void> {
  await adminDb.collection(AI_ORCHESTRATION_OUTCOMES_COLLECTION).doc(record.traceId).set({
    ...record,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: record.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function recordProviderMetric(input: {
  traceId: string;
  requestId: string;
  userId: string;
  providerId: string;
  modelId: string;
  task: string;
  modality: string;
  providerMode: string;
  qualityMode: string;
  billingSource: string;
  byokPreferred: boolean;
  status: 'succeeded' | 'failed';
  fallbackCount: number;
  durationMs?: number;
  creditsReserved?: number;
  creditsCharged?: number;
  creditsRefunded?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  reason?: string;
  completedAt?: number;
}): Promise<void> {
  const dateKey = dateKeyFromMs(input.completedAt || Date.now());
  const metricId = `${input.providerId}_${dateKey}_${input.task}`;
  const ref = adminDb.collection(AI_PROVIDER_METRICS_COLLECTION).doc(metricId);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? (snapshot.data() as AIProviderMetricRecord) : undefined;
    transaction.set(ref, {
      metricId,
      providerId: input.providerId,
      dateKey,
      task: input.task,
      modality: input.modality,
      requestCount: (current?.requestCount || 0) + 1,
      successCount: (current?.successCount || 0) + (input.status === 'succeeded' ? 1 : 0),
      failureCount: (current?.failureCount || 0) + (input.status === 'failed' ? 1 : 0),
      fallbackCount: (current?.fallbackCount || 0) + input.fallbackCount,
      byokCount: (current?.byokCount || 0) + (input.billingSource === 'byok' ? 1 : 0),
      creditsReserved: (current?.creditsReserved || 0) + (input.creditsReserved || 0),
      creditsCharged: (current?.creditsCharged || 0) + (input.creditsCharged || 0),
      creditsRefunded: (current?.creditsRefunded || 0) + (input.creditsRefunded || 0),
      totalDurationMs: (current?.totalDurationMs || 0) + (input.durationMs || 0),
      lastRequestId: input.requestId,
      lastModelId: input.modelId,
      lastStatus: input.status,
      lastReason: input.reason,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: current?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    } satisfies AIProviderMetricRecord, { merge: true });
  });
}

export async function persistStudioArtifact(record: AIStudioArtifactRecord): Promise<void> {
  await adminDb.collection(AI_STUDIO_ARTIFACTS_COLLECTION).doc(record.artifactId).set({
    ...record,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: record.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function queryStudioArtifacts(ownerId: string, limit = 30): Promise<AIStudioArtifactRecord[]> {
  const snapshot = await adminDb
    .collection(AI_STUDIO_ARTIFACTS_COLLECTION)
    .where('ownerId', '==', ownerId)
    .orderBy('createdAt', 'desc')
    .limit(Math.min(Math.max(limit, 1), 100))
    .get();

  return snapshot.docs.map((doc) => doc.data() as AIStudioArtifactRecord);
}

export function toTimestamp(value: unknown): Timestamp | null {
  if (value instanceof Timestamp) return value;
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      return Timestamp.fromDate((value as { toDate: () => Date }).toDate());
    } catch {
      return null;
    }
  }
  if (typeof value === 'number') {
    return Timestamp.fromMillis(value);
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
  }
  return null;
}
