import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, "admin");
  const body = await req.json();
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "create_announcement") {
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return apiError("Announcement content is required.", { status: 400, code: "CONTENT_REQUIRED" });
    const ref = adminDb.collection("posts").doc();
    const payload = {
      content,
      type: "announcement",
      authorId: entitlements.uid,
      authorName: entitlements.profile?.displayName || entitlements.profile?.name || entitlements.profile?.email || "Admin",
      authorAvatar: entitlements.profile?.photoURL || "",
      isPinned: false,
      likeCount: 0,
      commentCount: 0,
      tags: ["announcement"],
      moderationStatus: "approved",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(payload);
    await writeAdminAuditLog({ adminId: entitlements.uid, action: "content_announcement_created", entityType: "post", entityId: ref.id, after: payload });
    return apiResponse({ ok: true, postId: ref.id });
  }

  return apiError("Unsupported content action.", { status: 400, code: "INVALID_CONTENT_ACTION" });
});

export const POST = handler;
