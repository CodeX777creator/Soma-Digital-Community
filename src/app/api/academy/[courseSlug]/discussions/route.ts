import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { createAcademyLessonDiscussion, getPublishedAcademyCourseBySlug, listAcademyCourseDiscussions } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { courseSlug } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });

  if (req.method === 'GET') {
    const discussions = await listAcademyCourseDiscussions(course.courseId);
    return apiResponse({ discussions });
  }

  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  try {
    const discussion = await createAcademyLessonDiscussion({
      userId: uid,
      courseId: course.courseId,
      topicId: null,
      lessonId: null,
      body: body.body || '',
      discussionType: body.discussionType === 'announcement' ? 'announcement' : 'course_discussion',
    });
    return apiResponse({ discussion }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to post discussion.', { status: 400, code: 'ACADEMY_DISCUSSION_FAILED' });
  }
});

export const GET = handler;
export const POST = handler;
