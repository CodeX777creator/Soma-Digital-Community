import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { updateAcademyActivity } from '@/academy';
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

export const PATCH = handler;
