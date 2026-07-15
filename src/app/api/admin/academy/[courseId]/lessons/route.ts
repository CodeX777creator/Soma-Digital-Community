import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createAcademyLesson } from '@/academy';
import { AcademyValidationError } from '@/academy/validation';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { courseId } = await context.params;

  if (req.method !== 'POST') return apiError('Method not allowed.', { status: 405, code: 'METHOD_NOT_ALLOWED' });

  try {
    const body = await req.json();
    const lesson = await createAcademyLesson({ ...body, courseId });
    return apiResponse({ lesson }, { status: 201 });
  } catch (error) {
    if (error instanceof AcademyValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    throw error;
  }
});

export const POST = handler;
