import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { submitAcademyActivityResponse } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const submission = await submitAcademyActivityResponse({
    userId: uid,
    courseId: String(body.courseId || ''),
    topicId: String(body.topicId || ''),
    lessonId: String(body.lessonId || ''),
    activityId: String(body.activityId || ''),
    response: body.response || '',
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
  });
  return apiResponse({ submission }, { status: 201 });
});
