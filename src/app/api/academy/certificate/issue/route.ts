import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { issueAcademyCertificate } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const body = await req.json();
  const certificate = await issueAcademyCertificate(uid, String(body.courseId || ''));
  return apiResponse({ certificate }, { status: 201 });
});
