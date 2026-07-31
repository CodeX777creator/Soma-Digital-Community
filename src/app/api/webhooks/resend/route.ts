import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { emailHash, verifyResendWebhook } from "@/lib/email/resend";

export async function POST(req: Request) {
  const payload = await req.text();
  const eventId = req.headers.get("svix-id");
  if (!verifyResendWebhook({ payload, id: eventId, timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") })) return new Response("Invalid webhook.", { status: 400 });
  if (!eventId) return new Response("Missing webhook ID.", { status: 400 });

  const event = JSON.parse(payload) as { type?: string; created_at?: string; data?: Record<string, unknown> };
  const eventRef = adminDb.collection("resendWebhookEvents").doc(eventId);
  const existing = await eventRef.get();
  if (existing.exists) return Response.json({ ok: true, duplicate: true });
  await eventRef.set({ eventId, type: event.type || "unknown", createdAt: FieldValue.serverTimestamp() });

  const resendId = typeof event.data?.email_id === "string" ? event.data.email_id : "";
  if (resendId) {
    const deliveries = await adminDb.collection("emailDeliveries").where("resendId", "==", resendId).limit(1).get();
    if (!deliveries.empty) {
      const delivery = deliveries.docs[0];
      const status = event.type === "email.delivered" ? "delivered" : event.type === "email.bounced" ? "bounced" : event.type === "email.complained" ? "complained" : event.type === "email.failed" ? "failed" : event.type === "email.opened" ? "opened" : event.type === "email.clicked" ? "clicked" : "sent";
      await delivery.ref.update({ status, lastEvent: event.type || "unknown", lastEventAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      if (["email.bounced", "email.complained"].includes(event.type || "")) {
        const email = String(delivery.data().recipientEmail || "").toLowerCase();
        if (email) await adminDb.collection("emailSuppressions").doc(emailHash(email)).set({ emailHash: emailHash(email), email, reason: event.type === "email.complained" ? "complained" : "bounced", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  }
  return Response.json({ ok: true });
}
