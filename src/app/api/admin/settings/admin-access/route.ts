import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, "admin");
  const body = await req.json();
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  const action = body.action === "revoke" ? "revoke" : "grant";

  if (!uid) return apiError("User UID is required.", { status: 400, code: "USER_ID_REQUIRED" });
  if (uid === entitlements.uid && action === "revoke") {
    return apiError("You cannot revoke your own admin access.", { status: 403, code: "SELF_ADMIN_REVOKE_BLOCKED" });
  }

  const userRef = adminDb.collection("users").doc(uid);
  const beforeSnap = await userRef.get();
  if (!beforeSnap.exists) return apiError("User not found.", { status: 404, code: "USER_NOT_FOUND" });
  const before = beforeSnap.data() || {};
  const after = action === "grant"
    ? { isAdmin: true, role: "admin", updatedAt: FieldValue.serverTimestamp(), adminUpdatedBy: entitlements.uid }
    : { isAdmin: false, role: "member", updatedAt: FieldValue.serverTimestamp(), adminUpdatedBy: entitlements.uid };

  await userRef.set(after, { merge: true });
  await writeAdminAuditLog({
    adminId: entitlements.uid,
    action: action === "grant" ? "user_admin_granted" : "user_admin_revoked",
    entityType: "user",
    entityId: uid,
    before,
    after: { ...before, isAdmin: action === "grant", role: action === "grant" ? "admin" : "member" },
  });

  return apiResponse({ ok: true, uid, action });
});

export const POST = handler;
