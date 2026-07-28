import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";

type RouteContext = { params: Promise<Record<string, string>> };

export const GET = createAPIHandler(async (req, context: RouteContext) => {
  const user = await requireAuth(req as any);
  const ticketId = (await context.params).ticketId;
  const ref = adminDb.collection("supportTickets").doc(ticketId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.userId !== user.uid) return apiError("Support ticket not found.", { status: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  const messages = await ref.collection("messages").limit(100).get();
  return apiResponse({ ticket: { ticketId, ...snapshot.data(), messages: messages.docs.map((doc) => ({ messageId: doc.id, ...doc.data() })) } });
});

export const POST = createAPIHandler(async (req, context) => {
  const user = await requireAuth(req as any);
  const ticketId = (await context.params).ticketId;
  const ref = adminDb.collection("supportTickets").doc(ticketId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.userId !== user.uid) return apiError("Support ticket not found.", { status: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  if (["resolved", "closed"].includes(String(snapshot.data()?.status))) return apiError("This ticket is closed. Create a new ticket if you still need help.", { status: 409, code: "SUPPORT_TICKET_CLOSED" });
  const body = await req.json();
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 10000) : "";
  if (!message) return apiError("Please write a reply.", { status: 400, code: "SUPPORT_REPLY_REQUIRED" });
  const now = FieldValue.serverTimestamp();
  await ref.collection("messages").add({ authorId: user.uid, authorEmail: user.email || "", authorRole: "user", message, createdAt: now });
  await ref.set({ status: "open", updatedAt: now, lastReplyAt: now }, { merge: true });
  return apiResponse({ ok: true });
});
