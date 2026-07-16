import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { getAdminAcademyAnalytics } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { courseId } = await context.params;
  const analytics = await getAdminAcademyAnalytics(courseId);
  return apiResponse(analytics);
});

export const GET = handler;
