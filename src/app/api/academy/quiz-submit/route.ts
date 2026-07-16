import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { submitAcademyTopicQuiz } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const result = await submitAcademyTopicQuiz({
    userId: uid,
    courseId: String(body.courseId || ''),
    topicId: String(body.topicId || ''),
    answers: body.answers || {},
  });
  return apiResponse(result);
});
