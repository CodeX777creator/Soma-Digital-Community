import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { hasAdminAccess, requireAuth } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { sanitizeString } from "@/lib/security";

async function isAdminUser(uid: string) {
  const profile = (await adminDb.collection("users").doc(uid).get()).data();
  return hasAdminAccess(profile);
}

const handler = createAPIHandler(
  async (req: NextRequest, context) => {
    const { uid } = await requireAuth(req);
    const { postId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const content = sanitizeString(String(body?.content || "").trim(), 5000);

    if (!postId) {
      return apiError("Missing post id", { status: 400, code: "MISSING_POST_ID" });
    }
    if (!content) {
      return apiError("Original content is required", { status: 400, code: "MISSING_CONTENT" });
    }

    const postRef = adminDb.collection("posts").doc(postId);
    const postSnap = await postRef.get();
    if (!postSnap.exists) {
      return apiError("Post not found", { status: 404, code: "POST_NOT_FOUND" });
    }

    const post = postSnap.data() || {};
    const isOwner = post.authorId === uid;
    const isAdmin = await isAdminUser(uid);
    if (!isOwner && !isAdmin) {
      return apiError("You cannot restore this post", { status: 403, code: "FORBIDDEN" });
    }

    if (post.deleted !== true) {
      return apiResponse({ ok: true, alreadyRestored: true });
    }

    await postRef.update({
      deleted: false,
      content,
      deletedAt: null,
      restoredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return apiResponse({ ok: true });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 20 } }
);

export const POST = handler;
