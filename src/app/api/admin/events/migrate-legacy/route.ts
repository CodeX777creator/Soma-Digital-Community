import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { migrateLegacyEventModeScheduledPosts } from '@/events';

function parseLimit(value: string | null): number {
  const parsed = Number(value || '100');
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.floor(parsed), 1), 250);
}

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');

  if (req.method !== 'POST') {
    return apiError('Method not allowed.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false;
  const limit = parseLimit(typeof body?.limit === 'string' || typeof body?.limit === 'number' ? String(body.limit) : null);

  const result = await migrateLegacyEventModeScheduledPosts({
    actorId: entitlements.uid,
    dryRun,
    limit,
  });

  return apiResponse({ migration: result });
});

export const POST = handler;
