import { NextRequest } from 'next/server';
import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createEvent, listEvents } from '@/events';
import { EventValidationError, isEventStatus, isEventType } from '@/events/validation';

function parseMonth(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('month must be in YYYY-MM format');
  }
  return value;
}

function parseLimit(req: NextRequest): number {
  const value = Number(req.nextUrl.searchParams.get('limit') || '100');
  if (!Number.isFinite(value)) return 100;
  return Math.min(Math.max(Math.floor(value), 1), 250);
}

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');

  if (req.method === 'GET') {
    let month: string | undefined;
    try {
      month = parseMonth(req.nextUrl.searchParams.get('month'));
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid month', { status: 400, code: 'INVALID_MONTH' });
    }

    const rawStatus = req.nextUrl.searchParams.get('status') || 'all';
    const rawType = req.nextUrl.searchParams.get('type') || 'all';
    const events = await listEvents(
      { tier: 'elite', isAdmin: true },
      {
        month,
        status: rawStatus === 'all' || isEventStatus(rawStatus) ? rawStatus : 'all',
        type: rawType === 'all' || isEventType(rawType) ? rawType : 'all',
        includeDrafts: true,
        limit: parseLimit(req),
      }
    );

    return apiResponse({ events, month: month || new Date().toISOString().slice(0, 7) });
  }

  try {
    const body = await req.json();
    const event = await createEvent(body, entitlements.uid);
    return apiResponse({ event }, { status: 201 });
  } catch (error) {
    if (error instanceof EventValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    throw error;
  }
});

export const GET = handler;
export const POST = handler;
