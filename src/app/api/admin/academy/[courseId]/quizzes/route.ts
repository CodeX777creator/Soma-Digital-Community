import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createAcademyQuiz } from '@/academy';
import { AcademyValidationError } from '@/academy/validation';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { courseId } = await context.params;
  if (req.method !== 'POST') return apiError('Method not allowed.', { status: 405, code: 'METHOD_NOT_ALLOWED' });
  try {
    const body = await req.json();
    const quiz = await createAcademyQuiz({ ...body, courseId });
    return apiResponse({ quiz }, { status: 201 });
  } catch (error) {
    if (error instanceof AcademyValidationError) return apiError(error.message, { status: 400, code: error.code });
    return apiError(error instanceof Error ? error.message : 'Unable to create quiz.', { status: 400, code: 'ACADEMY_QUIZ_CREATE_FAILED' });
  }
});

export const POST = handler;
