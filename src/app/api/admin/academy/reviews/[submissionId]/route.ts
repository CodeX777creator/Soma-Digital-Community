import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireRole } from '@/lib/serverAuth';
import { reviewAcademyActivitySubmission } from '@/academy';

const handler = createAPIHandler(async (req, context) => {
  const { uid } = await requireRole(req as any, 'admin');
  const { submissionId } = await context.params;

  if (req.method !== 'PATCH') return apiError('Method not allowed.', { status: 405, code: 'METHOD_NOT_ALLOWED' });

  try {
    const body = await req.json();
    const submission = await reviewAcademyActivitySubmission(submissionId, uid, {
      status: body.status,
      feedback: body.feedback,
      score: body.score === '' || body.score === undefined ? undefined : Number(body.score),
    });
    return apiResponse({ submission });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to review activity submission.', { status: 400, code: 'ACADEMY_REVIEW_FAILED' });
  }
});

export const PATCH = handler;
