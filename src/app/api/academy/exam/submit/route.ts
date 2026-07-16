import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { submitAcademyFinalExam } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const result = await submitAcademyFinalExam({
    userId: uid,
    courseId: String(body.courseId || ''),
    examAttemptId: String(body.examAttemptId || ''),
    answers: body.answers || {},
    antiCheatEvents: Array.isArray(body.antiCheatEvents) ? body.antiCheatEvents : [],
  });
  return apiResponse(result);
});
