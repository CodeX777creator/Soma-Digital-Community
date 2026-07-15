import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { createAcademyTutorTurn, getPublishedAcademyCourseBySlug } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug, lessonId } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  const body = await req.json();
  try {
    const messages = await createAcademyTutorTurn({
      userId: uid,
      courseId: course.courseId,
      topicId: body.topicId || null,
      lessonId,
      content: body.content || '',
    });
    return apiResponse(messages, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to send tutor message.', { status: 400, code: 'ACADEMY_TUTOR_FAILED' });
  }
});

export const POST = handler;
