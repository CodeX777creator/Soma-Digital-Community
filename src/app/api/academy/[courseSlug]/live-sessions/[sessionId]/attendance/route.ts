import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { getPublishedAcademyCourseBySlug, markAcademyLiveSessionAttendance } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug, sessionId } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });

  try {
    const body = await req.json().catch(() => ({}));
    const attendance = await markAcademyLiveSessionAttendance({
      userId: uid,
      courseId: course.courseId,
      liveSessionId: sessionId,
      action: body.action === 'replay' ? 'replay' : 'join',
    });
    return apiResponse({ attendance });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to update attendance.', { status: 400, code: 'ACADEMY_ATTENDANCE_FAILED' });
  }
});

export const POST = handler;
