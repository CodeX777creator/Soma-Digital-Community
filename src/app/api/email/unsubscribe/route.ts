import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/lib/firebaseAdmin";
import { emailHash, isValidUnsubscribeToken } from "@/lib/email/resend";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";
  if (!email || !isValidUnsubscribeToken(email, token)) return new Response("Invalid unsubscribe link.", { status: 400 });

  await adminDb.collection("emailSuppressions").doc(emailHash(email)).set({ emailHash: emailHash(email), email, reason: "user_unsubscribed", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const users = await adminDb.collection("users").where("email", "==", email).limit(10).get();
  const batch = adminDb.batch();
  users.docs.forEach((doc) => batch.update(doc.ref, { emailMarketingOptIn: false, updatedAt: FieldValue.serverTimestamp() }));
  if (!users.empty) await batch.commit();
  return new Response("<html><body style=\"font-family:Arial;background:#090b13;color:white;padding:40px\"><h1>You are unsubscribed</h1><p>You will no longer receive SDC marketing emails at this address.</p></body></html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
