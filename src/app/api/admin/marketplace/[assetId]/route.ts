import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const COLLECTION = "marketplaceAssets";

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const { assetId } = await context.params;
  const ref = adminDb.collection(COLLECTION).doc(assetId);
  const beforeSnap = await ref.get();
  if (!beforeSnap.exists) return apiError("Marketplace asset not found.", { status: 404, code: "ASSET_NOT_FOUND" });
  const before = beforeSnap.data() || {};

  if (req.method === "DELETE") {
    await ref.delete();
    await writeAdminAuditLog({ adminId: entitlements.uid, action: "marketplace_asset_deleted", entityType: "marketplaceAsset", entityId: assetId, before });
    return apiResponse({ ok: true });
  }

  const body = await req.json();
  const action = typeof body.action === "string" ? body.action : "";
  if (action !== "publish") return apiError("Unsupported marketplace action.", { status: 400, code: "INVALID_MARKETPLACE_ACTION" });
  const published = body.published === true;
  const patch = { published, updatedAt: FieldValue.serverTimestamp(), updatedBy: entitlements.uid };
  await ref.set(patch, { merge: true });
  await writeAdminAuditLog({
    adminId: entitlements.uid,
    action: published ? "marketplace_asset_published" : "marketplace_asset_unpublished",
    entityType: "marketplaceAsset",
    entityId: assetId,
    before,
    after: { ...before, published },
  });
  return apiResponse({ ok: true, assetId, published });
});

export const PATCH = handler;
export const DELETE = handler;
