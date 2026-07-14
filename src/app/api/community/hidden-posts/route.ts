import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";

const handler = createAPIHandler(
  async (req: NextRequest) => {
    const { uid } = await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const postId = typeof body?.postId === "string" ? body.postId.trim() : "";

    if (!postId) {
      return apiError("Missing post id", { status: 400, code: "MISSING_POST_ID" });
    }

    await adminDb.doc(`users/${uid}/hiddenPosts/${postId}`).set({
      postId,
      hiddenAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return apiResponse({ ok: true });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } }
);

export const POST = handler;
