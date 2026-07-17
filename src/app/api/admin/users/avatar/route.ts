import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, "admin");
  const body = await req.json();
  const uid = typeof body.uid === "string" ? body.uid.trim() : "";
  const url = typeof body.photoURL === "string" ? body.photoURL.trim() : "";

  if (!uid) return apiError("User UID is required.", { status: 400, code: "USER_ID_REQUIRED" });
  if (url && !/^https?:\/\//i.test(url)) return apiError("Profile image must be a valid URL.", { status: 400, code: "INVALID_AVATAR_URL" });

  const userRef = adminDb.collection("users").doc(uid);
  const beforeSnap = await userRef.get();
  if (!beforeSnap.exists) return apiError("User not found.", { status: 404, code: "USER_NOT_FOUND" });
  const before = beforeSnap.data() || {};
  const after = {
    photoURL: url || null,
    avatarURL: url || null,
    adminManagedAvatarUrl: url || null,
    avatarUpdatedBy: entitlements.uid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await userRef.set(after, { merge: true });
  await writeAdminAuditLog({
    adminId: entitlements.uid,
    action: "user_avatar_updated",
    entityType: "user",
    entityId: uid,
    before: { photoURL: before.photoURL || before.avatarURL || null },
    after: { photoURL: url || null },
  });

  return apiResponse({ ok: true, uid, photoURL: url || null });
});

export const POST = handler;
