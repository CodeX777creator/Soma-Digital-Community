import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { markAcademyLiveSessionAttendance } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const attendance = await markAcademyLiveSessionAttendance({
    userId: uid,
    courseId: String(body.courseId || ''),
    liveSessionId: String(body.liveSessionId || ''),
    action: body.action === 'replay' ? 'replay' : 'join',
  });
  return apiResponse({ attendance });
});
