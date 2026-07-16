import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { createAcademyTutorTurn } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const messages = await createAcademyTutorTurn({
    userId: uid,
    courseId: String(body.courseId || ''),
    topicId: body.topicId || null,
    lessonId: body.lessonId || null,
    content: body.content || '',
  });
  return apiResponse(messages, { status: 201 });
});
