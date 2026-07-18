import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';

export function buildAcademyResellerSlug(seed: string) {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
}

export async function issueAcademyResellerLicense(input: {
  userId: string;
  courseId: string;
  purchaseId: string;
  certificateId?: string | null;
  licenseVersion?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  source?: string;
}) {
  const licenseId = `${input.userId}_${input.courseId}`;
  await adminDb.collection('academyResellerLicenses').doc(licenseId).set({
    licenseId,
    userId: input.userId,
    courseId: input.courseId,
    purchaseId: input.purchaseId,
    certificateId: input.certificateId || null,
    licenseVersion: input.licenseVersion || 'sdc-academy-mrr-v1',
    priceCents: typeof input.priceCents === 'number' ? input.priceCents : null,
    currency: input.currency || 'USD',
    source: input.source || 'academy_mrr_purchase',
    status: 'active',
    issuedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return licenseId;
}

export async function createAcademyResellerLink(input: {
  userId: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  resalePriceCents?: number;
  baseUrl: string;
}) {
  const linkRef = adminDb.collection('resellerLinks').doc(`${input.userId}_academy_${input.courseId}`);
  const existing = await linkRef.get();
  if (existing.exists) return existing.data() || null;

  const titleSlug = buildAcademyResellerSlug(input.courseTitle || input.courseId) || 'academy-course';
  const userSlug = input.userId.slice(0, 8).toLowerCase();
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const slug = `${titleSlug}-${userSlug}-${randomSuffix}`;
  const url = `${input.baseUrl.replace(/\/$/, '')}/academy/${encodeURIComponent(input.courseSlug || input.courseId)}?ref=${encodeURIComponent(slug)}`;
  const doc = {
    userId: input.userId,
    itemType: 'academy_course',
    courseId: input.courseId,
    assetId: input.courseId,
    slug,
    url,
    active: true,
    licenseType: 'mrr',
    resalePrice: typeof input.resalePriceCents === 'number' ? input.resalePriceCents : 0,
    resellerCommissionType: 'percentage',
    resellerCommissionValue: 100,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await linkRef.set(doc);
  return doc;
}
