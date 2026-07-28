import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

type RouteContext = { params: Promise<Record<string, string>> };
const VALID_STATUSES = new Set(["open", "in_progress", "waiting_on_user", "resolved", "closed"]);

export const GET = createAPIHandler(async (req, context) => {
  await requireRole(req as any, "admin");
  const ticketId = (await context.params).ticketId;
  const ref = adminDb.collection("supportTickets").doc(ticketId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return apiError("Support ticket not found.", { status: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  const messages = await ref.collection("messages").limit(100).get();
  return apiResponse({ ticket: { ticketId, ...snapshot.data(), messages: messages.docs.map((doc) => ({ messageId: doc.id, ...doc.data() })) } });
});

export const PATCH = createAPIHandler(async (req, context) => {
  const admin = await requireRole(req as any, "admin");
  const ticketId = (await context.params).ticketId;
  const ref = adminDb.collection("supportTickets").doc(ticketId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return apiError("Support ticket not found.", { status: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  const body = await req.json();
  const status = typeof body.status === "string" && VALID_STATUSES.has(body.status) ? body.status : undefined;
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 10000) : "";
  if (!status && !message) return apiError("Add a status or reply.", { status: 400, code: "SUPPORT_UPDATE_REQUIRED" });
  const now = FieldValue.serverTimestamp();
  const update = { ...(status ? { status } : {}), updatedAt: now, ...(message ? { lastReplyAt: now } : {}) };
  await ref.set(update, { merge: true });
  if (message) await ref.collection("messages").add({ authorId: admin.uid, authorEmail: admin.profile?.email || "", authorRole: "admin", message, createdAt: now });
  await writeAdminAuditLog({ adminId: admin.uid, adminEmail: admin.profile?.email, action: message ? "support_ticket_replied" : "support_ticket_status_changed", entityType: "supportTicket", entityId: ticketId, before: snapshot.data(), after: { ...update, status: status || snapshot.data()?.status } });
  return apiResponse({ ok: true });
});
