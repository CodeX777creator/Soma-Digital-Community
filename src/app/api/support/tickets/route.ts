import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";

const VALID_CATEGORIES = new Set(["account", "billing", "ai", "academy", "marketplace", "social", "technical", "other"]);
const VALID_PRIORITIES = new Set(["low", "normal", "high"]);

export const GET = createAPIHandler(async (req) => {
  const user = await requireAuth(req as any);
  const snapshot = await adminDb.collection("supportTickets").where("userId", "==", user.uid).limit(100).get();
  const tickets = snapshot.docs.map((doc) => ({ ticketId: doc.id, ...doc.data() })).sort((a, b) => String((b as { updatedAt?: unknown }).updatedAt || "").localeCompare(String((a as { updatedAt?: unknown }).updatedAt || "")));
  return apiResponse({ tickets });
});

export const POST = createAPIHandler(async (req) => {
  const user = await requireAuth(req as any);
  const body = await req.json();
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 180) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 10000) : "";
  const category = typeof body.category === "string" && VALID_CATEGORIES.has(body.category) ? body.category : "other";
  const priority = typeof body.priority === "string" && VALID_PRIORITIES.has(body.priority) ? body.priority : "normal";
  if (!subject) return apiError("Please add a subject.", { status: 400, code: "SUPPORT_SUBJECT_REQUIRED" });
  if (!message) return apiError("Please describe how we can help.", { status: 400, code: "SUPPORT_MESSAGE_REQUIRED" });

  const ticketRef = adminDb.collection("supportTickets").doc();
  const now = FieldValue.serverTimestamp();
  const ticket = { ticketId: ticketRef.id, userId: user.uid, userEmail: user.email || "", subject, category, priority, status: "open", message, createdAt: now, updatedAt: now, lastReplyAt: null };
  await ticketRef.set(ticket);
  await ticketRef.collection("messages").add({ authorId: user.uid, authorEmail: user.email || "", authorRole: "user", message, createdAt: now });
  return apiResponse({ ok: true, ticketId: ticketRef.id }, { status: 201 });
});
