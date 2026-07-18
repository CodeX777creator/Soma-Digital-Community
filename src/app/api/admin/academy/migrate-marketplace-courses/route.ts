import { FieldValue } from 'firebase-admin/firestore';
import { writeAdminAuditLog } from '@/admin/audit';
import { apiResponse, createAPIHandler } from '@/lib/api-middleware';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole } from '@/lib/serverAuth';

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'academy-course';
}

async function legacyCourseAssets() {
  const snap = await adminDb.collection('marketplaceAssets').get();
  return snap.docs.filter((doc) => {
    const data = doc.data() || {};
    const type = String(data.type || '').toLowerCase();
    const category = String(data.category || '').toLowerCase();
    return type === 'course' || category === 'course' || category === 'courses';
  });
}

export const POST = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, 'admin');
  const body = await req.json().catch(() => ({}));
  const execute = body.execute === true;
  const assets = await legacyCourseAssets();

  const results = [];
  for (const assetDoc of assets) {
    const asset = assetDoc.data() || {};
    const courseId = String(asset.academyCourseId || assetDoc.id);
    const title = String(asset.title || 'Migrated Academy Course');
    results.push({
      assetId: assetDoc.id,
      courseId,
      title,
      action: asset.academyCourseId ? 'already_linked' : execute ? 'migrate' : 'would_migrate',
    });

    if (!execute || asset.academyCourseId) continue;

    const courseRef = adminDb.collection('academyCourses').doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) {
      await courseRef.set({
        courseId,
        title,
        slug: slugify(String(asset.slug || title)),
        description: String(asset.description || asset.summary || ''),
        thumbnailUrl: String(asset.thumbnailUrl || ''),
        promoVideoUrl: String(asset.videoUrl || ''),
        level: 'beginner',
        category: String(asset.category || 'Legacy Course'),
        status: asset.published === false ? 'draft' : 'published',
        visibility: 'public',
        estimatedDuration: 0,
        pricingType: typeof asset.price === 'number' && asset.price > 0 ? 'paid' : 'free',
        priceCents: typeof asset.price === 'number' ? Math.max(0, Math.round(asset.price)) : 0,
        salePriceCents: null,
        currency: String(asset.currency || 'USD'),
        includedPlans: [],
        mrrEnabled: asset.licenseType === 'mrr',
        mrrRequiresCertificate: true,
        mrrPriceCents: typeof asset.mrrPriceCents === 'number' ? asset.mrrPriceCents : 999,
        mrrCurrency: String(asset.currency || 'USD'),
        mrrLicenseVersion: String(asset.mrrLicenseVersion || 'sdc-academy-mrr-v1'),
        certificateEnabled: true,
        finalExamEnabled: true,
        discussionEnabled: true,
        aiTutorEnabled: true,
        cohortEnabled: false,
        dripEnabled: false,
        manualReviewEnabled: false,
        nextSteps: [],
        recommendedCourseIds: [],
        createdBy: entitlements.uid,
        migratedFromMarketplaceAssetId: assetDoc.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        publishedAt: asset.published === false ? null : FieldValue.serverTimestamp(),
      });
    }

    const purchases = await adminDb.collection('assetPurchases').where('assetId', '==', assetDoc.id).where('status', '==', 'paid').get();
    const batch = adminDb.batch();
    purchases.docs.forEach((purchaseDoc) => {
      const purchase = purchaseDoc.data() || {};
      const userId = String(purchase.userId || purchase.uid || '');
      if (!userId) return;
      const id = `${userId}_${courseId}`;
      batch.set(adminDb.collection('academyCourseEntitlements').doc(id), {
        entitlementId: id,
        userId,
        courseId,
        entitlementType: 'paid_course',
        source: 'marketplace_course_migration',
        legacyAssetId: assetDoc.id,
        legacyPurchaseId: purchaseDoc.id,
        status: 'active',
        pricePaidCents: typeof purchase.price === 'number' ? purchase.price : null,
        grantedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(adminDb.collection('academyEnrollments').doc(id), {
        enrollmentId: id,
        userId,
        courseId,
        cohortId: null,
        status: 'active',
        source: 'marketplace_course_migration',
        enrolledAt: FieldValue.serverTimestamp(),
        completedAt: null,
        lastAccessedAt: FieldValue.serverTimestamp(),
        progressPercent: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    batch.set(assetDoc.ref, {
      published: false,
      archived: true,
      movedToAcademy: true,
      academyCourseId: courseId,
      legacyRedirectUrl: `/academy/${slugify(String(asset.slug || title))}`,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
  }

  if (execute) {
    await writeAdminAuditLog({
      adminId: entitlements.uid,
      adminEmail: String(entitlements.profile?.email || ''),
      action: 'legacy_marketplace_courses_migrated',
      entityType: 'academyMigration',
      entityId: 'marketplace_courses',
      metadata: { count: results.length, results },
    });
  }

  return apiResponse({ execute, count: results.length, results });
}, {
  rateLimit: { windowMs: 60 * 1000, maxRequests: 3 },
  timeout: 60000,
});
