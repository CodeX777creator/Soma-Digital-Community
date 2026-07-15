import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { getPublishedAcademyCourseBySlug, submitAcademyActivityResponse } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug, activityId } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  const body = await req.json();
  try {
    const submission = await submitAcademyActivityResponse({
      userId: uid,
      courseId: course.courseId,
      topicId: body.topicId,
      lessonId: body.lessonId,
      activityId,
      response: body.response || '',
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
    });
    return apiResponse({ submission }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to submit activity.', { status: 400, code: 'ACADEMY_ACTIVITY_SUBMIT_FAILED' });
  }
});

export const POST = handler;
