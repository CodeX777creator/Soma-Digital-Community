import { FieldValue } from "firebase-admin/firestore";

import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { emailHash } from "@/lib/email/resend";

export const GET = createAPIHandler(async (req) => {
  const user = await requireAuth(req);
  const snapshot = await adminDb.collection("users").doc(user.uid).get();
  return apiResponse({ emailMarketingOptIn: snapshot.data()?.emailMarketingOptIn === true });
});

export const PATCH = createAPIHandler(async (req) => {
  const user = await requireAuth(req);
  const body = await req.json().catch(() => ({}));
  if (typeof body.emailMarketingOptIn !== "boolean") return apiError("Email preference must be true or false.", { status: 400, code: "EMAIL_PREFERENCE_INVALID" });
  const optIn = body.emailMarketingOptIn;
  await adminDb.collection("users").doc(user.uid).set({ emailMarketingOptIn: optIn, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (!optIn && user.email) {
    const email = user.email.trim().toLowerCase();
    const hash = emailHash(email);
    await adminDb.collection("emailSuppressions").doc(hash).set({ emailHash: hash, email, reason: "user_unsubscribed", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } else if (optIn && user.email) {
    const email = user.email.trim().toLowerCase();
    const suppressionRef = adminDb.collection("emailSuppressions").doc(emailHash(email));
    const suppression = await suppressionRef.get();
    if (suppression.data()?.reason === "user_unsubscribed") await suppressionRef.delete();
  }
  return apiResponse({ emailMarketingOptIn: optIn });
});
