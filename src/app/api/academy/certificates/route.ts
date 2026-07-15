import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { requireAuth } from '@/lib/serverAuth';
import { listAcademyCertificatesForUser } from '@/academy';

const handler = createAPIHandler(async (req) => {
  const { uid } = await requireAuth(req as any);
  const certificates = await listAcademyCertificatesForUser(uid);
  return apiResponse({ certificates });
});

export const GET = handler;
