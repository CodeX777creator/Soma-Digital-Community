import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb, adminStorage } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const { assetId } = await context.params;
  const ref = adminDb.collection("adminMediaAssets").doc(assetId);
  const snap = await ref.get();

  if (!snap.exists) {
    return apiError("Media asset not found.", { status: 404, code: "MEDIA_NOT_FOUND" });
  }

  if (req.method === "PATCH") {
    const body = await req.json();
    const updates = {
      altText: typeof body.altText === "string" ? body.altText : snap.get("altText") || "",
      caption: typeof body.caption === "string" ? body.caption : snap.get("caption") || "",
      linkedEntityType: typeof body.linkedEntityType === "string" ? body.linkedEntityType : snap.get("linkedEntityType") || null,
      linkedEntityId: typeof body.linkedEntityId === "string" ? body.linkedEntityId : snap.get("linkedEntityId") || null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(updates, { merge: true });
    await writeAdminAuditLog({
      adminId: entitlements.uid,
      action: "admin_media_updated",
      entityType: "adminMediaAsset",
      entityId: assetId,
      metadata: updates,
    });
    const updated = await ref.get();
    return apiResponse({ asset: { assetId, ...updated.data() } });
  }

  if (req.method === "DELETE") {
    const data = snap.data() || {};
    await ref.set({ status: "deleted", updatedAt: FieldValue.serverTimestamp(), deletedBy: entitlements.uid }, { merge: true });
    if (typeof data.storagePath === "string" && data.storagePath) {
      await adminStorage.bucket().file(data.storagePath).delete({ ignoreNotFound: true });
    }
    await writeAdminAuditLog({
      adminId: entitlements.uid,
      action: "admin_media_deleted",
      entityType: "adminMediaAsset",
      entityId: assetId,
      metadata: { storagePath: data.storagePath || null },
    });
    return apiResponse({ ok: true });
  }

  return apiError("Method not allowed.", { status: 405, code: "METHOD_NOT_ALLOWED" });
});

export const PATCH = handler;
export const DELETE = handler;
