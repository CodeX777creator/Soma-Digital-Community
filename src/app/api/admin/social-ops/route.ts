import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { SOCIAL_PROVIDER_REGISTRY, type SocialPlatform } from '@/social';

type FirestoreTime = { toDate?: () => Date; seconds?: number } | string | number | Date | null | undefined;

const PROVIDER_SETUP_ITEMS: Record<SocialPlatform, Array<{ key: string; label: string }>> = {
  tiktok: [{ key: 'tiktokDirectPostEnabled', label: 'TikTok Direct Post enabled' }],
  facebook: [{ key: 'facebookPermissionsApproved', label: 'Facebook permissions approved' }],
  instagram: [{ key: 'instagramContentPublishApproved', label: 'Instagram content publish approved' }],
  youtube: [{ key: 'youtubeOAuthVerified', label: 'YouTube OAuth verified' }],
  x: [{ key: 'xWriteMediaAccessActive', label: 'X write/media access active' }],
  linkedin: [{ key: 'linkedinSharePermissionsActive', label: 'LinkedIn share permissions active' }],
};

function getBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function hasAdminAccess(profile: Record<string, any> | undefined) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  return profile?.isAdmin === true || profile?.role === 'admin' || roles.includes('admin');
}

function toIso(value: FirestoreTime): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return null;
}

function increment(map: Record<string, number>, key: string, by = 1) {
  map[key] = (map[key] || 0) + by;
}

async function safeDocs(collection: string, limit = 500) {
  try {
    const snap = await adminDb.collection(collection).limit(limit).get();
    return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  } catch {
    return [];
  }
}

async function safeCount(collection: string) {
  try {
    const snap = await adminDb.collection(collection).count().get();
    return snap.data().count;
  } catch {
    return null;
  }
}

function latestByDate<T extends { time: string | null }>(items: T[], limit: number) {
  return items
    .sort((a, b) => Date.parse(b.time || '') - Date.parse(a.time || ''))
    .slice(0, limit);
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(token);
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const callerProfile = callerSnap.exists ? callerSnap.data() : undefined;
    if (!hasAdminAccess(callerProfile)) {
      return NextResponse.json({ error: 'Caller is not admin' }, { status: 403 });
    }

    const [
      accountDocs,
      oauthDocs,
      attemptDocs,
      tokenJobDocs,
      analyticsDocs,
      queueCount,
      retryCounterDocs,
      reliabilityDocs,
      setupSnap,
    ] = await Promise.all([
      safeDocs('socialAccounts', 1000),
      safeDocs('socialOAuthHandshakes', 300),
      safeDocs('socialPublishAttempts', 500),
      safeDocs('socialTokenRefreshJobs', 300),
      safeDocs('socialAnalyticsSnapshots', 500),
      safeCount('scheduledPosts'),
      safeDocs('socialPublishUserDailyLimits', 200),
      safeDocs('socialReliabilityAlerts', 300),
      adminDb.collection('config').doc('socialProviderSetup').get().catch(() => null),
    ]);

    const setup = setupSnap?.exists ? setupSnap.data() || {} : {};
    const providers = SOCIAL_PROVIDER_REGISTRY.map((provider) => {
      const accounts = accountDocs.filter((doc) => doc.data.providerId === provider.id);
      const connected = accounts.filter((doc) => doc.data.status === 'connected').length;
      const paused = accounts.filter((doc) => doc.data.status === 'paused').length;
      const errored = accounts.filter((doc) => doc.data.status === 'error').length;
      const readinessIssues = accounts.filter((doc) => {
        const readiness = doc.data.connectionReadiness || doc.data.metadata?.connectionReadiness || {};
        const missingScopes = Array.isArray(readiness.missingScopes) ? readiness.missingScopes : [];
        return readiness.permissionsVerified === false || readiness.publishReady === false || readiness.analyticsReady === false || missingScopes.length > 0;
      }).length;

      const failedPublishes = attemptDocs.filter((doc) => doc.data.platform === provider.id && doc.data.status === 'failed').length;
      const providerErrors = attemptDocs.filter((doc) => doc.data.platform === provider.id && typeof doc.data.failureCode === 'string' && doc.data.failureCode.includes('PROVIDER')).length;
      const analyticsSyncs = analyticsDocs.filter((doc) => doc.data.providerId === provider.id || doc.data.platform === provider.id);
      const analyticsFailures = analyticsSyncs.filter((doc) => doc.data.status === 'failed' || doc.data.error).length;
      const tokenFailures = tokenJobDocs.filter((doc) => doc.data.providerId === provider.id && doc.data.status === 'failed').length;

      return {
        providerId: provider.id,
        label: provider.label,
        accounts: accounts.length,
        connected,
        paused,
        errored,
        readinessIssues,
        failedPublishes,
        providerErrors,
        tokenRefreshFailures: tokenFailures,
        analyticsSyncs: analyticsSyncs.length,
        analyticsFailures,
        setup: (PROVIDER_SETUP_ITEMS[provider.id] || []).map((item) => ({
          ...item,
          ready: setup[item.key] === true,
          note: typeof setup[`${item.key}Note`] === 'string' ? setup[`${item.key}Note`] : null,
        })),
      };
    });

    const statusCounts: Record<string, number> = {};
    const providerCounts: Record<string, number> = {};
    accountDocs.forEach((doc) => {
      increment(statusCounts, String(doc.data.status || 'unknown'));
      increment(providerCounts, String(doc.data.providerId || 'unknown'));
    });

    const failedOAuthCallbacks = latestByDate(oauthDocs
      .filter((doc) => doc.data.status === 'failed' || doc.data.accountStatus === 'error')
      .map((doc) => ({
        id: doc.id,
        providerId: doc.data.providerId || 'unknown',
        socialAccountId: doc.data.socialAccountId || null,
        error: doc.data.error || doc.data.errorDescription || 'OAuth callback failed',
        time: toIso(doc.data.updatedAt || doc.data.createdAt),
      })), 20);

    const failedPublishes = latestByDate(attemptDocs
      .filter((doc) => doc.data.status === 'failed')
      .map((doc) => ({
        id: doc.id,
        scheduledPostId: doc.data.scheduledPostId || null,
        platform: doc.data.platform || 'unknown',
        failureCode: doc.data.failureCode || null,
        error: doc.data.errorMessage || 'Publish failed',
        retryable: doc.data.retryable === true,
        time: toIso(doc.data.finishedAt || doc.data.triggeredAt),
      })), 30);

    const tokenRefreshFailures = latestByDate(tokenJobDocs
      .filter((doc) => doc.data.status === 'failed' || doc.data.lastError)
      .map((doc) => ({
        id: doc.id,
        providerId: doc.data.providerId || 'unknown',
        socialAccountId: doc.data.socialAccountId || null,
        error: doc.data.lastError || 'Token refresh failed',
        time: toIso(doc.data.updatedAt || doc.data.createdAt),
      })), 20);

    const providerApiErrors = latestByDate(attemptDocs
      .filter((doc) => typeof doc.data.failureCode === 'string' && (doc.data.failureCode.includes('PROVIDER') || doc.data.failureCode.includes('TOKEN') || doc.data.failureCode.includes('PERMISSION')))
      .map((doc) => ({
        id: doc.id,
        platform: doc.data.platform || 'unknown',
        failureCode: doc.data.failureCode || null,
        error: doc.data.errorMessage || doc.data.providerResponse || 'Provider API error',
        time: toIso(doc.data.finishedAt || doc.data.triggeredAt),
      })), 30);

    const analyticsFailures = latestByDate(analyticsDocs
      .filter((doc) => doc.data.status === 'failed' || doc.data.error)
      .map((doc) => ({
        id: doc.id,
        providerId: doc.data.providerId || doc.data.platform || 'unknown',
        status: doc.data.status || 'failed',
        error: doc.data.error || doc.data.failureMessage || 'Analytics sync failed',
        time: toIso(doc.data.syncedAt || doc.data.createdAt),
      })), 20);

    const retryVolume = attemptDocs.filter((doc) => Number(doc.data.attemptNumber || 1) > 1).length;
    const retryableFailures = failedPublishes.filter((item) => item.retryable).length;
    const queuedPosts = accountDocs.length >= 0 ? null : queueCount;
    const publishQueueDocs = await safeDocs('scheduledPosts', 1000);
    const publishQueueSize = publishQueueDocs.filter((doc) => doc.data.status === 'scheduled' || doc.data.status === 'failed' || doc.data.status === 'publishing').length;
    const needsAttentionQueue = publishQueueDocs.filter((doc) => doc.data.status === 'failed' || doc.data.lastError || doc.data.failureCode).length;
    const retryCounters = retryCounterDocs.reduce((total, doc) => total + Number(doc.data.count || 0), 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        connectedAccounts: statusCounts.connected || 0,
        totalAccounts: accountDocs.length,
        failedOAuthCallbacks: failedOAuthCallbacks.length,
        failedPublishes: failedPublishes.length,
        tokenRefreshFailures: tokenRefreshFailures.length,
        providerApiErrors: providerApiErrors.length,
        analyticsSyncFailures: analyticsFailures.length,
        publishQueueSize,
        needsAttentionQueue,
        retryVolume,
        retryableFailures,
        dailyPublishCounterVolume: retryCounters,
        reliabilityAlerts: reliabilityDocs.length,
        scheduledPostCollectionCount: queueCount,
      },
      connectedAccountsByProvider: providerCounts,
      accountStatusCounts: statusCounts,
      providers,
      failures: {
        oauthCallbacks: failedOAuthCallbacks,
        publishes: failedPublishes,
        tokenRefresh: tokenRefreshFailures,
        providerApi: providerApiErrors,
        analyticsSync: analyticsFailures,
      },
      setupDocExists: setupSnap?.exists === true,
    });
  } catch (error) {
    console.error('Failed to load social ops dashboard:', error);
    return NextResponse.json({ error: 'Unable to load social ops dashboard' }, { status: 500 });
  }
}
