import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { getEventAnalytics } from '@/events';

function parseMonth(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('month must be in YYYY-MM format');
  }
  return value;
}

const handler = createAPIHandler(async (req) => {
  await requireRole(req as any, 'admin');

  let month: string | undefined;
  try {
    month = parseMonth(req.nextUrl.searchParams.get('month'));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid month', { status: 400, code: 'INVALID_MONTH' });
  }

  const analytics = await getEventAnalytics(month);
  return apiResponse({ analytics });
});

export const GET = handler;
