import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { getAcademyTopicQuizState, getPublishedAcademyCourseBySlug, submitAcademyTopicQuiz } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug, topicId } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });

  if (req.method === 'GET') {
    const state = await getAcademyTopicQuizState(uid, course.courseId, topicId);
    return apiResponse(state);
  }

  try {
    const body = await req.json();
    const result = await submitAcademyTopicQuiz({
      userId: uid,
      courseId: course.courseId,
      topicId,
      answers: body.answers || {},
    });
    return apiResponse(result, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to submit quiz.', { status: 400, code: 'ACADEMY_QUIZ_SUBMIT_FAILED' });
  }
});

export const GET = handler;
export const POST = handler;
