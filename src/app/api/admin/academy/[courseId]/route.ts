import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import {
  deleteAcademyCourse,
  getAcademyCourseBundle,
  updateAcademyCourse,
} from '@/academy';
import { AcademyValidationError } from '@/academy/validation';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { courseId } = await context.params;

  if (!courseId || courseId.length > 180) {
    return apiError('Invalid Academy course.', { status: 400, code: 'INVALID_ACADEMY_COURSE_ID' });
  }

  if (req.method === 'GET') {
    const bundle = await getAcademyCourseBundle(courseId);
    if (!bundle) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
    return apiResponse(bundle);
  }

  if (req.method === 'DELETE') {
    await deleteAcademyCourse(courseId);
    return apiResponse({ deleted: true });
  }

  try {
    const body = await req.json();
    const course = await updateAcademyCourse(courseId, body);
    return apiResponse({ course });
  } catch (error) {
    if (error instanceof AcademyValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    if (error instanceof Error && error.message === 'Academy course not found') {
      return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
    }
    throw error;
  }
});

export const GET = handler;
export const PATCH = handler;
export const DELETE = handler;
