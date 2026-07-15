import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { listPublishedAcademyCourses } from '@/academy';

const handler = createAPIHandler(async () => {
  const courses = await listPublishedAcademyCourses({ limit: 200 });
  return apiResponse({ courses }, { cache: { maxAge: 60, staleWhileRevalidate: 300, private: false } });
});

export const GET = handler;
