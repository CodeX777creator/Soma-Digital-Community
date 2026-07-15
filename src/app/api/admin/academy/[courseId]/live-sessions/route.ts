import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createAcademyLiveSession } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  await requireRole(req as any, 'admin');
  const { courseId } = await context.params;
  const body = await req.json();
  const liveSession = await createAcademyLiveSession({ ...body, courseId });
  return apiResponse({ liveSession }, { status: 201 });
});

export const POST = handler;
