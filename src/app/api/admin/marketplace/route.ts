import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const COLLECTION = "marketplaceAssets";

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, "admin");
  const body = await req.json();
  const assetId = typeof body.assetId === "string" && body.assetId.trim()
    ? body.assetId.trim()
    : adminDb.collection(COLLECTION).doc().id;
  const payload = body.asset && typeof body.asset === "object" ? body.asset as Record<string, unknown> : null;

  if (!payload) return apiError("Marketplace asset payload is required.", { status: 400, code: "ASSET_PAYLOAD_REQUIRED" });
  if (typeof payload.title !== "string" || !payload.title.trim()) return apiError("Product title is required.", { status: 400, code: "TITLE_REQUIRED" });
  if (typeof payload.description !== "string" || !payload.description.trim()) return apiError("Product description is required.", { status: 400, code: "DESCRIPTION_REQUIRED" });
  if (payload.type === "course") return apiError("Courses belong in Academy. Use external_course for an externally hosted program.", { status: 400, code: "COURSE_BELONGS_IN_ACADEMY" });
  if (payload.price !== undefined && (typeof payload.price !== "number" || payload.price < 0)) return apiError("Product price must be a non-negative number.", { status: 400, code: "INVALID_PRODUCT_PRICE" });
  if (payload.licenseType === "mrr" && payload.resaleEnabled === true && payload.mrrLicenseVersion !== undefined && typeof payload.mrrLicenseVersion !== "string") return apiError("MRR license version must be text.", { status: 400, code: "INVALID_MRR_LICENSE" });
  const allowedKeys = new Set([
    "title", "slug", "description", "type", "category", "tags", "thumbnailUrl", "assetUrl", "storagePath",
    "deliveryType", "price", "currency", "tier", "licenseType", "resaleEnabled", "resalePrice",
    "mrrPrice", "mrrLicenseVersion", "resellerCommissionType", "resellerCommissionValue", "published",
    "externalPlatform", "externalAccessUrl", "accessInstructions", "websiteOnboardingInstructions", "pricingType",
  ]);
  const sanitizedPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => allowedKeys.has(key)));

  const ref = adminDb.collection(COLLECTION).doc(assetId);
  const beforeSnap = await ref.get();
  const before = beforeSnap.exists ? beforeSnap.data() : null;
  const now = FieldValue.serverTimestamp();
  const after = {
    ...sanitizedPayload,
    updatedAt: now,
    updatedBy: entitlements.uid,
    ...(before ? {} : { createdAt: now, createdBy: entitlements.uid }),
  };
  await ref.set(after, { merge: true });
  await writeAdminAuditLog({
    adminId: entitlements.uid,
    action: before ? "marketplace_asset_updated" : "marketplace_asset_created",
    entityType: "marketplaceAsset",
    entityId: assetId,
    before,
    after,
  });
  return apiResponse({ ok: true, assetId });
});

export const POST = handler;
