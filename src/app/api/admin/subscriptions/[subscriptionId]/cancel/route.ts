import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const { subscriptionId } = await context.params;
  const ref = adminDb.collection("subscriptions").doc(subscriptionId);
  const beforeSnap = await ref.get();
  if (!beforeSnap.exists) {
    return apiError("Subscription not found.", { status: 404, code: "SUBSCRIPTION_NOT_FOUND" });
  }

  const before = beforeSnap.data() || {};
  const userId = typeof before.userId === "string" ? before.userId : typeof before.uid === "string" ? before.uid : "";
  const patch = {
    subscriptionStatus: "cancelled",
    status: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    cancelledBy: entitlements.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const batch = adminDb.batch();
  batch.set(ref, patch, { merge: true });
  if (userId) {
    batch.set(adminDb.collection("users").doc(userId), {
      subscriptionPlan: "explorer",
      tier: "explorer",
      subscriptionStatus: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();

  await writeAdminAuditLog({
    adminId: entitlements.uid,
    action: "subscription_cancelled",
    entityType: "subscription",
    entityId: subscriptionId,
    before,
    after: { ...before, ...patch },
    metadata: { userId },
  });

  return apiResponse({ ok: true, subscriptionId });
});

export const POST = handler;
