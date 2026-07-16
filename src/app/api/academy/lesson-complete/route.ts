import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { completeAcademyLesson } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const result = await completeAcademyLesson(uid, String(body.courseId || ''), String(body.lessonId || ''));
  return apiResponse(result);
});
