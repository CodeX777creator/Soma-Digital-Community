import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { updateAcademyActivity, deleteAcademyActivity } from '@/academy';
import { AcademyValidationError } from '@/academy/validation';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { activityId } = await context.params;

  if (req.method !== 'PATCH') return apiError('Method not allowed.', { status: 405, code: 'METHOD_NOT_ALLOWED' });

  try {
    const body = await req.json();
    const activity = await updateAcademyActivity(activityId, body);
    return apiResponse({ activity });
  } catch (error) {
    if (error instanceof AcademyValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    return apiError(error instanceof Error ? error.message : 'Unable to update activity.', { status: 400, code: 'ACADEMY_ACTIVITY_UPDATE_FAILED' });
  }
});

const deleteHandler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { activityId } = await context.params;
  try {
    await deleteAcademyActivity(activityId);
    return apiResponse({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Academy activity not found') {
      return apiError('Academy activity not found.', { status: 404, code: 'ACADEMY_ACTIVITY_NOT_FOUND' });
    }
    throw error;
  }
});

export const PATCH = handler;
export const DELETE = deleteHandler;
