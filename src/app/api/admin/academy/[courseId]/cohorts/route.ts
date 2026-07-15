import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createAcademyCohort } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { courseId } = await context.params;
  const body = await req.json();
  const cohort = await createAcademyCohort({ ...body, courseId });
  return apiResponse({ cohort }, { status: 201 });
});

export const POST = handler;
