import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const { purchaseId } = await context.params;
  const ref = adminDb.collection("assetPurchases").doc(purchaseId);
  const beforeSnap = await ref.get();
  if (!beforeSnap.exists) {
    return apiError("Purchase not found.", { status: 404, code: "PURCHASE_NOT_FOUND" });
  }

  const before = beforeSnap.data() || {};
  const patch = {
    revoked: true,
    revokedAt: FieldValue.serverTimestamp(),
    revokedBy: entitlements.uid,
    status: "revoked",
    updatedAt: FieldValue.serverTimestamp(),
  };

  const batch = adminDb.batch();
  batch.set(ref, patch, { merge: true });

  const userId = typeof before.userId === "string" ? before.userId : typeof before.uid === "string" ? before.uid : "";
  const assetId = typeof before.assetId === "string" ? before.assetId : "";
  if (userId && assetId) {
    batch.set(adminDb.collection("users").doc(userId), {
      purchasedAssets: FieldValue.arrayRemove(assetId),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();
  await writeAdminAuditLog({
    adminId: entitlements.uid,
    action: "purchase_access_revoked",
    entityType: "assetPurchase",
    entityId: purchaseId,
    before,
    after: { ...before, ...patch },
    metadata: { userId, assetId },
  });

  return apiResponse({ ok: true, purchaseId });
});

export const POST = handler;
