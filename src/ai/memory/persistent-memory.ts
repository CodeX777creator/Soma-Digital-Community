import { admin, adminDb } from '@/lib/firebaseAdmin';
import { logger } from '@/lib/logger';
import {
  generateEmbedding,
  getMemoryContext,
  storeMemory,
  vectorMemoryStore,
  type ConversationSummary,
  type Insight,
  type MemoryContext,
  type UserPreferences,
  type VectorMemoryEntry,
} from './conversation-memory';

const MEMORY_DOC_ID = 'profile';
const HYDRATION_TTL_MS = 5 * 60 * 1000;

const lastHydratedAt = new Map<string, number>();

export interface MentorMemorySnapshot extends MemoryContext {
  businessGoals?: string;
  loadedInsights: number;
  loadedSummaries: number;
}

export interface PersistMentorMemoryInput {
  userId: string;
  threadId: string;
  businessGoals?: string;
  preferences?: Partial<UserPreferences>;
  insights?: Insight[];
  summary?: ConversationSummary;
}

function normalizeBusinessGoals(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toTimestampValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toMillis();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
  }
  return Date.now();
}

function buildMemoryRef(userId: string) {
  return adminDb.collection('users').doc(userId).collection('mentorMemory').doc(MEMORY_DOC_ID);
}

function mapInsightToVectorEntry(insight: Insight): VectorMemoryEntry | null {
  const type = insight.type === 'business_info'
    ? 'fact'
    : insight.type === 'learning_style'
      ? 'learning_style'
      : insight.type;

  if (type !== 'goal' && type !== 'fact' && type !== 'preference' && type !== 'challenge' && type !== 'learning_style') {
    return null;
  }

  return {
    id: insight.id,
    content: insight.content,
    embedding: generateEmbedding(insight.content),
    metadata: {
      timestamp: insight.timestamp,
      type,
      importance: insight.confidence,
      source: insight.source,
      tags: [insight.type],
    },
  };
}

async function hydrateVectorMemory(userId: string, insights: Insight[]): Promise<void> {
  for (const insight of insights) {
    const entry = mapInsightToVectorEntry(insight);
    if (!entry) continue;
    await vectorMemoryStore.add(userId, entry);
  }
}

export async function hydrateMentorMemory(
  userId: string,
  options: {
    maxInsights?: number;
    maxSummaries?: number;
    force?: boolean;
  } = {}
): Promise<MentorMemorySnapshot> {
  const now = Date.now();
  const lastHydrated = lastHydratedAt.get(userId) || 0;
  if (!options.force && now - lastHydrated < HYDRATION_TTL_MS) {
    const memoryContext = getMemoryContext(userId, {
      maxInsights: options.maxInsights ?? 12,
      includePreferences: true,
    });
    return {
      ...memoryContext,
      businessGoals: memoryContext.businessGoals,
      loadedInsights: memoryContext.relevantInsights.length,
      loadedSummaries: memoryContext.recentSummary ? 1 : 0,
    };
  }

  const profileRef = buildMemoryRef(userId);
  const [profileSnap, insightsSnap, summariesSnap] = await Promise.all([
    profileRef.get(),
    profileRef.collection('insights').orderBy('timestamp', 'desc').limit(options.maxInsights ?? 40).get(),
    profileRef.collection('summaries').orderBy('timestamp', 'desc').limit(options.maxSummaries ?? 10).get(),
  ]);

  const profileData = profileSnap.exists ? (profileSnap.data() as Record<string, any>) : {};
  const businessGoals = normalizeBusinessGoals(profileData.businessGoals || profileData.businessGoal || profileData.goal);
  const preferences = (profileData.preferences && typeof profileData.preferences === 'object'
    ? profileData.preferences
    : {}) as Partial<UserPreferences>;

  const loadedInsights: Array<Insight | null> = insightsSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, any>;
      const content = typeof data.content === 'string' ? data.content.trim() : '';
      if (!content) return null;

      return {
        id: typeof data.id === 'string' ? data.id : doc.id,
        type: (typeof data.type === 'string' ? data.type : 'fact') as Insight['type'],
        content,
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
        source: typeof data.source === 'string' ? data.source : userId,
        timestamp: toTimestampValue(data.timestamp),
        expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
      } satisfies Insight;
    })
    .filter((item) => item !== null);

  const loadedSummaries: Array<ConversationSummary | null> = summariesSnap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, any>;
      const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
      if (!summary) return null;

      return {
        id: typeof data.id === 'string' ? data.id : doc.id,
        threadId: typeof data.threadId === 'string' ? data.threadId : 'unknown',
        summary,
        keyTopics: Array.isArray(data.keyTopics) ? data.keyTopics.filter((item: unknown) => typeof item === 'string') : [],
        actionItems: Array.isArray(data.actionItems) ? data.actionItems.filter((item: unknown) => typeof item === 'string') : [],
        timestamp: toTimestampValue(data.timestamp),
        messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
      } satisfies ConversationSummary;
    })
    .filter((item) => item !== null);

  if (loadedInsights.length > 0) {
    const insights = loadedInsights.filter((item): item is Insight => item !== null);
    storeMemory(userId, { insights });
    await hydrateVectorMemory(userId, insights);
  }

  if (loadedSummaries.length > 0) {
    loadedSummaries.filter((item): item is ConversationSummary => item !== null).forEach((summary) => storeMemory(userId, { summary }));
  }

  if (Object.keys(preferences).length > 0 || businessGoals) {
    storeMemory(userId, {
      preferences,
      businessGoals,
    });
  }

  lastHydratedAt.set(userId, now);

  const memoryContext = getMemoryContext(userId, {
    maxInsights: options.maxInsights ?? 12,
    includePreferences: true,
  });

  return {
    ...memoryContext,
    businessGoals,
    loadedInsights: loadedInsights.length,
    loadedSummaries: loadedSummaries.length,
  };
}

export async function persistMentorMemory(input: PersistMentorMemoryInput): Promise<void> {
  try {
    const profileRef = buildMemoryRef(input.userId);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const profilePatch: Record<string, unknown> = {
      userId: input.userId,
      updatedAt: now,
      lastThreadId: input.threadId,
    };

    const normalizedGoals = normalizeBusinessGoals(input.businessGoals);
    if (normalizedGoals) {
      profilePatch.businessGoals = normalizedGoals;
    }

    const normalizedPreferences = input.preferences && Object.keys(input.preferences).length > 0
      ? Object.fromEntries(
          Object.entries(input.preferences).filter(([, value]) => value !== undefined && value !== null)
        )
      : null;

    if (normalizedPreferences) {
      profilePatch.preferences = normalizedPreferences;
    }

    if (input.summary) {
      profilePatch.lastSummary = input.summary.summary;
      profilePatch.lastSummaryThreadId = input.summary.threadId;
      profilePatch.lastSummaryAt = input.summary.timestamp;
      profilePatch.lastSummaryMessageCount = input.summary.messageCount;
    }

    await profileRef.set(profilePatch, { merge: true });

    const batch = adminDb.batch();

    for (const insight of input.insights || []) {
      const insightRef = profileRef.collection('insights').doc(insight.id);
      batch.set(insightRef, {
        ...insight,
        updatedAt: now,
      }, { merge: true });
    }

    if (input.summary) {
      const summaryRef = profileRef.collection('summaries').doc(input.summary.id);
      batch.set(summaryRef, {
        ...input.summary,
        updatedAt: now,
      }, { merge: true });
    }

    if ((input.insights?.length || 0) > 0 || input.summary) {
      await batch.commit();
    }

    if (input.insights?.length) {
      await hydrateVectorMemory(input.userId, input.insights);
    }

    storeMemory(input.userId, {
      businessGoals: normalizedGoals,
      preferences: normalizedPreferences as Partial<UserPreferences> | undefined,
      insights: input.insights,
      summary: input.summary,
    });
  } catch (error) {
    logger.warn('[PersistentMemory] Failed to persist mentor memory', {
      userId: input.userId,
      threadId: input.threadId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
