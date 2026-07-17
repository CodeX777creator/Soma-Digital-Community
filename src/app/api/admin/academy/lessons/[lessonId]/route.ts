import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { updateAcademyLesson, deleteAcademyLesson } from '@/academy';
import { AcademyValidationError } from '@/academy/validation';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { lessonId } = await context.params;

  try {
    const body = await req.json();
    const lesson = await updateAcademyLesson(lessonId, body);
    return apiResponse({ lesson });
  } catch (error) {
    if (error instanceof AcademyValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    if (error instanceof Error && error.message === 'Academy lesson not found') {
      return apiError('Academy lesson not found.', { status: 404, code: 'ACADEMY_LESSON_NOT_FOUND' });
    }
    throw error;
  }
});

const deleteHandler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { lessonId } = await context.params;
  try {
    await deleteAcademyLesson(lessonId);
    return apiResponse({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Academy lesson not found') {
      return apiError('Academy lesson not found.', { status: 404, code: 'ACADEMY_LESSON_NOT_FOUND' });
    }
    throw error;
  }
});

export const PATCH = handler;
export const DELETE = deleteHandler;
