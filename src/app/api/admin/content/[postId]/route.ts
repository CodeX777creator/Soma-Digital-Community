import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const { postId } = await context.params;
  const ref = adminDb.collection("posts").doc(postId);
  const beforeSnap = await ref.get();
  if (!beforeSnap.exists) return apiError("Post not found.", { status: 404, code: "POST_NOT_FOUND" });
  const before = beforeSnap.data() || {};

  if (req.method === "DELETE") {
    await ref.delete();
    await writeAdminAuditLog({ adminId: entitlements.uid, action: "content_post_deleted", entityType: "post", entityId: postId, before });
    return apiResponse({ ok: true });
  }

  const body = await req.json();
  const action = typeof body.action === "string" ? body.action : "";
  let patch: Record<string, unknown> | null = null;
  let auditAction = "content_post_updated";

  if (action === "toggle_pin") {
    patch = { isPinned: !Boolean(before.isPinned), updatedAt: FieldValue.serverTimestamp() };
    auditAction = patch.isPinned ? "content_post_pinned" : "content_post_unpinned";
  } else if (action === "moderate") {
    const flagged = body.flagged === true;
    patch = {
      moderationStatus: flagged ? "flagged" : "approved",
      moderatedAt: FieldValue.serverTimestamp(),
      moderatedBy: entitlements.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    auditAction = flagged ? "content_post_flagged" : "content_post_approved";
  } else if (action === "edit") {
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return apiError("Post content is required.", { status: 400, code: "CONTENT_REQUIRED" });
    patch = {
      content,
      updatedAt: FieldValue.serverTimestamp(),
      editedByAdmin: true,
      editedByAdminId: entitlements.uid,
    };
    auditAction = "content_post_edited";
  }

  if (!patch) return apiError("Unsupported post action.", { status: 400, code: "INVALID_POST_ACTION" });

  await ref.set(patch, { merge: true });
  await writeAdminAuditLog({ adminId: entitlements.uid, action: auditAction, entityType: "post", entityId: postId, before, after: patch });
  return apiResponse({ ok: true, postId });
});

export const PATCH = handler;
export const DELETE = handler;
