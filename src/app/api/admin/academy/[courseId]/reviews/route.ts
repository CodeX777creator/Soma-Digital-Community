import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { listAcademyActivitySubmissionsForCourse } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { courseId } = await context.params;
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'all';
  const submissions = await listAcademyActivitySubmissionsForCourse(courseId, { status });
  return apiResponse({ submissions });
});

export const GET = handler;
