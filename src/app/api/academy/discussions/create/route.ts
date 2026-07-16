import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { createAcademyLessonDiscussion } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const discussion = await createAcademyLessonDiscussion({
    userId: uid,
    courseId: String(body.courseId || ''),
    topicId: body.topicId || null,
    lessonId: body.lessonId || null,
    body: body.body || '',
    discussionType: body.discussionType,
  });
  return apiResponse({ discussion }, { status: 201 });
});
