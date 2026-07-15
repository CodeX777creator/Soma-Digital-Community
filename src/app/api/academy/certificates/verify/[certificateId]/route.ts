import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { verifyAcademyCertificate } from '@/academy';

const handler = createAPIHandler(async (_req, context) => {
  const { certificateId } = await context.params;
  const certificate = await verifyAcademyCertificate(certificateId);
  if (!certificate) return apiError('Certificate not found or inactive.', { status: 404, code: 'ACADEMY_CERTIFICATE_NOT_FOUND' });
  return apiResponse({ certificate }, { cache: { maxAge: 300, staleWhileRevalidate: 600, private: false } });
});

export const GET = handler;
