import { apiError, apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { writeAdminAuditLog } from '@/admin/audit';
import { requireRole } from '@/lib/serverAuth';
import {
  deleteAcademyCourse,
  getAcademyCourseBundle,
  updateAcademyCourse,
} from '@/academy';
import { AcademyValidationError } from '@/academy/validation';

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, 'admin');
  const { courseId } = await context.params;

  if (!courseId || courseId.length > 180) {
    return apiError('Invalid Academy course.', { status: 400, code: 'INVALID_ACADEMY_COURSE_ID' });
  }

  if (req.method === 'GET') {
    const bundle = await getAcademyCourseBundle(courseId);
    if (!bundle) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
    return apiResponse(bundle);
  }

  if (req.method === 'DELETE') {
    const before = await getAcademyCourseBundle(courseId);
    await deleteAcademyCourse(courseId);
    await writeAdminAuditLog({
      adminId: entitlements.uid,
      adminEmail: String(entitlements.profile?.email || ''),
      action: 'academy_course_deleted',
      entityType: 'academyCourse',
      entityId: courseId,
      before: before?.course || null,
    });
    return apiResponse({ deleted: true });
  }

  try {
    const body = await req.json();
    const before = await getAcademyCourseBundle(courseId);
    const course = await updateAcademyCourse(courseId, body);
    if (!course) return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
    const beforeCourse = before?.course;
    const pricingChanged = beforeCourse && (
      beforeCourse.pricingType !== course.pricingType ||
      beforeCourse.priceCents !== course.priceCents ||
      beforeCourse.salePriceCents !== course.salePriceCents ||
      beforeCourse.currency !== course.currency ||
      JSON.stringify(beforeCourse.includedPlans || []) !== JSON.stringify(course.includedPlans || [])
    );
    const mrrChanged = beforeCourse && (
      beforeCourse.mrrEnabled !== course.mrrEnabled ||
      beforeCourse.mrrRequiresCertificate !== course.mrrRequiresCertificate ||
      beforeCourse.mrrPriceCents !== course.mrrPriceCents ||
      beforeCourse.mrrCurrency !== course.mrrCurrency ||
      beforeCourse.mrrLicenseVersion !== course.mrrLicenseVersion
    );
    const publishChanged = beforeCourse && beforeCourse.status !== course.status;
    await writeAdminAuditLog({
      adminId: entitlements.uid,
      adminEmail: String(entitlements.profile?.email || ''),
      action: publishChanged ? (course.status === 'published' ? 'academy_course_published' : 'academy_course_status_changed') : pricingChanged ? 'academy_course_price_changed' : mrrChanged ? 'academy_course_mrr_changed' : 'academy_course_updated',
      entityType: 'academyCourse',
      entityId: courseId,
      before: beforeCourse || null,
      after: course,
      metadata: { pricingChanged: Boolean(pricingChanged), mrrChanged: Boolean(mrrChanged), publishChanged: Boolean(publishChanged) },
    });
    return apiResponse({ course });
  } catch (error) {
    if (error instanceof AcademyValidationError) {
      return apiError(error.message, { status: 400, code: error.code });
    }
    if (error instanceof Error && error.message === 'Academy course not found') {
      return apiError('Academy course not found.', { status: 404, code: 'ACADEMY_COURSE_NOT_FOUND' });
    }
    throw error;
  }
});

export const GET = handler;
export const PATCH = handler;
export const DELETE = handler;
