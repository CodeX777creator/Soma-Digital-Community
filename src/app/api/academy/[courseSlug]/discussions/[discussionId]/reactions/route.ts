import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { getPublishedAcademyCourseBySlug, reactToAcademyDiscussion } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug, discussionId } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  const body = await req.json();
  const reactionType = body.reactionType === 'report' ? 'report' : 'helpful';
  try {
    const reaction = await reactToAcademyDiscussion({
      userId: uid,
      courseId: course.courseId,
      discussionId,
      replyId: body.replyId || null,
      lessonId: body.lessonId || null,
      reactionType,
    });
    return apiResponse({ reaction }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to react to discussion.', { status: 400, code: 'ACADEMY_REACTION_FAILED' });
  }
});

export const POST = handler;
