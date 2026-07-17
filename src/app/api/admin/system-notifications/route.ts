import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

const VALID_TIERS = new Set(["all", "explorer", "pro", "elite"]);

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, "admin");
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const message = typeof body.body === "string" ? body.body.trim() : "";
  const linkUrl = typeof body.linkUrl === "string" && body.linkUrl.trim() ? body.linkUrl.trim() : null;
  const targetTier = typeof body.targetTier === "string" && VALID_TIERS.has(body.targetTier) ? body.targetTier : "all";

  if (!title) return apiError("Notification title is required.", { status: 400, code: "NOTIFICATION_TITLE_REQUIRED" });
  if (!message) return apiError("Notification message is required.", { status: 400, code: "NOTIFICATION_BODY_REQUIRED" });

  const payload = {
    title,
    body: message,
    linkUrl,
    targetTier,
    sentAt: FieldValue.serverTimestamp(),
    sentBy: entitlements.profile?.email || entitlements.uid,
    sentByUid: entitlements.uid,
    read: false,
  };
  const ref = await adminDb.collection("systemNotifications").add(payload);
  await writeAdminAuditLog({
    adminId: entitlements.uid,
    adminEmail: entitlements.profile?.email,
    action: "system_notification_sent",
    entityType: "systemNotification",
    entityId: ref.id,
    after: payload,
  });

  return apiResponse({ ok: true, notificationId: ref.id });
});

export const POST = handler;
