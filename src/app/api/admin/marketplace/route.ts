import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const COLLECTION = "marketplaceAssets";

const ASSET_TYPES = new Set(["pdf", "video", "template", "notion", "link", "code", "external_course"]);
const DELIVERY_TYPES = new Set(["download", "external_access", "hybrid"]);
const PRICING_TYPES = new Set(["free", "paid", "included_with_plan", "promo_only"]);
const EXTERNAL_ACCESS_TYPES = new Set(["manual_fulfillment", "registration", "existing_account"]);

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

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
  const assetType = typeof payload.type === "string" ? payload.type : "";
  if (!ASSET_TYPES.has(assetType)) return apiError("Choose a valid product type.", { status: 400, code: "INVALID_PRODUCT_TYPE" });
  if (payload.price !== undefined && (typeof payload.price !== "number" || payload.price < 0)) return apiError("Product price must be a non-negative number.", { status: 400, code: "INVALID_PRODUCT_PRICE" });
  const deliveryType = assetType === "external_course" ? "external_access" : typeof payload.deliveryType === "string" ? payload.deliveryType : "download";
  if (!DELIVERY_TYPES.has(deliveryType)) return apiError("Choose a valid delivery method.", { status: 400, code: "INVALID_DELIVERY_TYPE" });
  const pricingType = typeof payload.pricingType === "string"
    ? payload.pricingType
    : Number(payload.price || 0) > 0 ? "paid" : "free";
  if (!PRICING_TYPES.has(pricingType)) return apiError("Choose a valid pricing mode.", { status: 400, code: "INVALID_PRICING_TYPE" });
  if (pricingType === "paid" && Number(payload.price || 0) <= 0) return apiError("Paid products need a price greater than zero.", { status: 400, code: "PAID_PRICE_REQUIRED" });
  if (payload.currency !== undefined && payload.currency !== "USD") return apiError("Marketplace checkout currently supports USD only.", { status: 400, code: "UNSUPPORTED_CURRENCY" });
  const slug = normalizeSlug(typeof payload.slug === "string" ? payload.slug : payload.title);
  if (!slug) return apiError("A public URL slug is required.", { status: 400, code: "SLUG_REQUIRED" });
  const externalAccessRequired = deliveryType === "external_access" || assetType === "external_course";
  if (externalAccessRequired && Number(payload.price || 0) <= 0 && pricingType !== "promo_only") return apiError("External access products need a paid price so access can be fulfilled after purchase.", { status: 400, code: "EXTERNAL_PRICE_REQUIRED" });
  const downloadRequired = deliveryType === "download" || deliveryType === "hybrid";
  if (downloadRequired && typeof payload.assetUrl !== "string" && typeof payload.storagePath !== "string") {
    return apiError("A downloadable product needs a file or storage path.", { status: 400, code: "PRODUCT_FILE_REQUIRED" });
  }
  if (externalAccessRequired) {
    if (typeof payload.externalPlatform !== "string" || !payload.externalPlatform.trim()) return apiError("External platform is required.", { status: 400, code: "EXTERNAL_PLATFORM_REQUIRED" });
    if (typeof payload.externalAccessUrl !== "string" || !/^https:\/\//i.test(payload.externalAccessUrl.trim())) return apiError("External access URL must use HTTPS.", { status: 400, code: "EXTERNAL_URL_REQUIRED" });
    const externalAccessType = typeof payload.externalAccessType === "string" ? payload.externalAccessType : "manual_fulfillment";
    if (!EXTERNAL_ACCESS_TYPES.has(externalAccessType)) return apiError("Choose a valid external access type.", { status: 400, code: "INVALID_EXTERNAL_ACCESS_TYPE" });
    if (assetType === "external_course" && externalAccessType !== "manual_fulfillment") return apiError("External programs require manual fulfillment.", { status: 400, code: "MANUAL_FULFILLMENT_REQUIRED" });
  }
  if (payload.licenseType === "mrr" && payload.resaleEnabled === true && payload.mrrLicenseVersion !== undefined && typeof payload.mrrLicenseVersion !== "string") return apiError("MRR license version must be text.", { status: 400, code: "INVALID_MRR_LICENSE" });
  const allowedKeys = new Set([
    "title", "slug", "description", "type", "category", "tags", "thumbnailUrl", "assetUrl", "storagePath",
    "deliveryType", "price", "currency", "tier", "licenseType", "resaleEnabled", "resalePrice",
    "mrrPrice", "mrrLicenseVersion", "resellerCommissionType", "resellerCommissionValue", "published",
    "commissionBase", "courseValue", "externalPlatform", "externalAccessType", "externalAccessUrl", "accessInstructions", "websiteOnboardingInstructions", "pricingType",
  ]);
  const sanitizedPayload = {
    ...Object.fromEntries(Object.entries(payload).filter(([key]) => allowedKeys.has(key))),
    slug,
    type: assetType,
    deliveryType,
    pricingType,
    currency: "USD",
    externalAccessType: externalAccessRequired
      ? (typeof payload.externalAccessType === "string" ? payload.externalAccessType : "manual_fulfillment")
      : null,
    ...(externalAccessRequired ? {} : {
      externalPlatform: "",
      externalAccessType: null,
      externalAccessUrl: "",
      accessInstructions: "",
    }),
  };

  const existingSlug = await adminDb.collection(COLLECTION).where("slug", "==", slug).limit(2).get();
  if (existingSlug.docs.some((candidate) => candidate.id !== assetId)) {
    return apiError("That public URL slug is already in use.", { status: 409, code: "SLUG_ALREADY_EXISTS" });
  }

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
