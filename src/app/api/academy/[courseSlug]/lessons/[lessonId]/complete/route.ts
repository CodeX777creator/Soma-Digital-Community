import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { completeAcademyLesson, getPublishedAcademyCourseBySlug } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug, lessonId } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  try {
    const progress = await completeAcademyLesson(uid, course.courseId, lessonId);
    return apiResponse(progress);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to complete lesson.', { status: 400, code: 'ACADEMY_LESSON_COMPLETE_FAILED' });
  }
});

export const POST = handler;
