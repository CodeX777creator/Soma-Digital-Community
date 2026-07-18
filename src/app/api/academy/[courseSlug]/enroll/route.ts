import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { enrollInAcademyCourse, getPublishedAcademyCourseBySlug } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireAuth(req as any);
  const { courseSlug } = await context.params;
  const course = await getPublishedAcademyCourseBySlug(courseSlug);
  if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  try {
    const enrollment = await enrollInAcademyCourse(uid, course.courseId);
    return apiResponse({ enrollment });
  } catch (error) {
    const code = (error as any)?.code;
    if (code === 'ACADEMY_PURCHASE_REQUIRED') {
      return apiError(error instanceof Error ? error.message : 'Purchase required.', { status: 402, code });
    }
    if (code === 'ACADEMY_ACCESS_REQUIRED') {
      return apiError(error instanceof Error ? error.message : 'Academy access required.', { status: 403, code });
    }
    throw error;
  }
});

export const POST = handler;
