import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { reviewAcademyActivitySubmission } from '@/academy';

export const POST = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');
  const body = await req.json();
  const submission = await reviewAcademyActivitySubmission(String(body.submissionId || ''), entitlements.uid, {
    status: String(body.status || ''),
    feedback: body.feedback || null,
    score: typeof body.score === 'number' ? body.score : null,
  });
  return apiResponse({ submission });
});
