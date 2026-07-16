import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createAcademyDripSchedule, listAcademyDripSchedules } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { courseId } = await context.params;

  if (req.method === 'GET') {
    const dripSchedules = await listAcademyDripSchedules(courseId);
    return apiResponse({ dripSchedules });
  }

  const body = await req.json();
  const dripSchedule = await createAcademyDripSchedule({ ...body, courseId });
  return apiResponse({ dripSchedule }, { status: 201 });
});

export const GET = handler;
export const POST = handler;
