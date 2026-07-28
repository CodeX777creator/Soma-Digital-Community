import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";

export const GET = createAPIHandler(async (req) => {
  await requireRole(req as any, "admin");
  const snapshot = await adminDb.collection("supportTickets").limit(300).get();
  const tickets = snapshot.docs.map((doc) => ({ ticketId: doc.id, ...doc.data() })).sort((a, b) => String((b as { updatedAt?: unknown }).updatedAt || "").localeCompare(String((a as { updatedAt?: unknown }).updatedAt || "")));
  return apiResponse({ tickets });
});
