import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { getAcademyExamState, getPublishedAcademyCourseBySlug, startAcademyFinalExam, submitAcademyFinalExam } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });

  if (req.method === 'GET') {
    const state = await getAcademyExamState(uid, course.courseId);
    return apiResponse(state);
  }

  try {
    const body = await req.json();
    if (body.action === 'submit') {
      const result = await submitAcademyFinalExam({
        userId: uid,
        courseId: course.courseId,
        examAttemptId: body.examAttemptId,
        answers: body.answers || {},
        antiCheatEvents: body.antiCheatEvents || [],
      });
      return apiResponse(result);
    }
    const result = await startAcademyFinalExam(uid, course.courseId);
    return apiResponse(result, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to process final exam.', { status: 400, code: 'ACADEMY_EXAM_FAILED' });
  }
});

export const GET = handler;
export const POST = handler;
