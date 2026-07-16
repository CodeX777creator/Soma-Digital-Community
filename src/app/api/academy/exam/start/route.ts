import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { startAcademyFinalExam } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const result = await startAcademyFinalExam(uid, String(body.courseId || ''));
  return apiResponse(result, { status: 201 });
});
