import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { sanitizeString } from "@/lib/security";

const REASONS = ["spam", "harassment", "scam", "inappropriate", "misinformation", "other"];

const handler = createAPIHandler(
  async (req: NextRequest) => {
    const { uid } = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const postId = typeof body?.postId === "string" ? body.postId.trim() : "";
    const reason = REASONS.includes(body?.reason) ? body.reason : "other";
    const details = sanitizeString(String(body?.details || "").trim(), 500);

    if (!postId) {
      return apiError("Missing post id", { status: 400, code: "MISSING_POST_ID" });
    }

    const postSnap = await adminDb.collection("posts").doc(postId).get();
    if (!postSnap.exists) {
      return apiError("Post not found", { status: 404, code: "POST_NOT_FOUND" });
    }

    const reportId = `${uid}_${postId}`;
    await adminDb.collection("postReports").doc(reportId).set({
      postId,
      reporterId: uid,
      authorId: postSnap.data()?.authorId || null,
      reason,
      details,
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await adminDb.collection("posts").doc(postId).set({
      moderationStatus: "flagged",
      reportCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return apiResponse({ ok: true }, { status: 201 });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 10 } }
);

export const POST = handler;
