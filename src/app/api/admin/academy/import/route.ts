import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { previewAcademyImport } from '@/academy';

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');
  const body = await req.json();
  try {
    const academyImport = await previewAcademyImport({
      adminId: entitlements.uid,
      sourceType: body.sourceType || 'outline',
      sourceName: body.sourceName || null,
      source: body.source || '',
    });
    return apiResponse({ import: academyImport }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to preview Academy import.', { status: 400, code: 'ACADEMY_IMPORT_PREVIEW_FAILED' });
  }
});

export const POST = handler;
