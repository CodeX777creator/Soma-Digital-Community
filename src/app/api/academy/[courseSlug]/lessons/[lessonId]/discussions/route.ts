import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { createAcademyLessonDiscussion, getPublishedAcademyCourseBySlug, listAcademyLessonDiscussions } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { courseSlug, lessonId } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });

  if (req.method === 'GET') {
    const discussions = await listAcademyLessonDiscussions(course.courseId, lessonId);
    return apiResponse({ discussions });
  }

  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  try {
    const discussion = await createAcademyLessonDiscussion({
      userId: uid,
      courseId: course.courseId,
      topicId: body.topicId,
      lessonId,
      body: body.body || '',
    });
    return apiResponse({ discussion }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to post discussion.', { status: 400, code: 'ACADEMY_DISCUSSION_FAILED' });
  }
});

export const GET = handler;
export const POST = handler;
