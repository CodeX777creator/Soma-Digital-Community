import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { createAcademyDiscussionReply, getPublishedAcademyCourseBySlug } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug, discussionId } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  const body = await req.json();
  try {
    const reply = await createAcademyDiscussionReply({
      userId: uid,
      courseId: course.courseId,
      discussionId,
      lessonId: body.lessonId || null,
      body: body.body || '',
    });
    return apiResponse({ reply }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to post reply.', { status: 400, code: 'ACADEMY_REPLY_FAILED' });
  }
});

export const POST = handler;
