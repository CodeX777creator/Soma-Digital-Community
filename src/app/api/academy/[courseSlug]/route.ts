import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { getLearnerAcademyBundle } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { courseSlug } = await context.params;
  let userId: string | undefined;
  try {
    const auth = await requireAuth(req as any);
    userId = auth.uid;
  } catch {
    userId = undefined;
  }

  const bundle = await getLearnerAcademyBundle(courseSlug, userId);
  if (!bundle) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
  return apiResponse(bundle);
});

export const GET = handler;
