import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { createAcademyCourse, listAcademyCourses } from '@/academy';
import { AcademyValidationError } from '@/academy/validation';

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');

  if (req.method === 'GET') {
    const includeArchived = req.nextUrl.searchParams.get('includeArchived') === 'true';
    const limit = Number(req.nextUrl.searchParams.get('limit') || '100');
    const courses = await listAcademyCourses({ includeArchived, limit });
    return apiResponse({ courses });
  }

  try {
    const body = await req.json();
    const course = await createAcademyCourse(body, entitlements.uid);
    return apiResponse({ course }, { status: 201 });
  } catch (error) {
    if (error instanceof AcademyValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    throw error;
  }
});

export const GET = handler;
export const POST = handler;
