import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { confirmAcademyImport } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, 'admin');
  const { importId } = await context.params;
  try {
    const academyImport = await confirmAcademyImport(importId, entitlements.uid);
    return apiResponse({ import: academyImport });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to confirm Academy import.', { status: 400, code: 'ACADEMY_IMPORT_CONFIRM_FAILED' });
  }
});

export const POST = handler;
