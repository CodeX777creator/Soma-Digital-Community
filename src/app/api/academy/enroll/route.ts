import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { enrollInAcademyCourse, getPublishedAcademyCourseBySlug } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const course = body.courseId ? { courseId: String(body.courseId) } : await getPublishedAcademyCourseBySlug(String(body.courseSlug || ''));
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  const enrollment = await enrollInAcademyCourse(uid, course.courseId);
  return apiResponse({ enrollment }, { status: 201 });
});
