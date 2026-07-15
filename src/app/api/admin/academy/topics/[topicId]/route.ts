import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { updateAcademyTopic } from '@/academy';
import { AcademyValidationError } from '@/academy/validation';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { topicId } = await context.params;

  try {
    const body = await req.json();
    const topic = await updateAcademyTopic(topicId, body);
    return apiResponse({ topic });
  } catch (error) {
    if (error instanceof AcademyValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    if (error instanceof Error && error.message === 'Academy topic not found') {
      return apiError('Academy topic not found.', { status: 404, code: 'ACADEMY_TOPIC_NOT_FOUND' });
    }
    throw error;
  }
});

export const PATCH = handler;
