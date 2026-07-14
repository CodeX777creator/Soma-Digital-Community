import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { sanitizeString } from "@/lib/security";

const handler = createAPIHandler(
  async (req: NextRequest, context) => {
    const { uid, email } = await requireAuth(req);
    const { postId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const content = sanitizeString(String(body?.content || "").trim(), 2000);
    const parentId = typeof body?.parentId === "string" && body.parentId.trim()
      ? body.parentId.trim()
      : null;

    if (!postId) {
      return apiError("Missing post id", { status: 400, code: "MISSING_POST_ID" });
    }
    if (!content) {
      return apiError("Comment content is required", { status: 400, code: "MISSING_CONTENT" });
    }

    const [userSnap, authUser] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminAuth.getUser(uid).catch(() => null),
    ]);
    const userData = userSnap.data() || {};
    const authorName = userData.name || authUser?.displayName || email?.split("@")[0] || "Member";
    const tier = userData.tier || userData.subscriptionPlan || "explorer";
    const authorTier = ["explorer", "pro", "elite"].includes(tier) ? tier : "explorer";

    const postRef = adminDb.collection("posts").doc(postId);
    const commentRef = postRef.collection("comments").doc();
    let notificationTarget: string | null = null;
    let notificationType: "comment" | "reply" = parentId ? "reply" : "comment";

    await adminDb.runTransaction(async (tx) => {
      const postSnap = await tx.get(postRef);
      if (!postSnap.exists) throw new Error("POST_NOT_FOUND");
      const post = postSnap.data() || {};
      if (post.deleted === true) throw new Error("POST_DELETED");

      if (parentId) {
        const parentRef = postRef.collection("comments").doc(parentId);
        const parentSnap = await tx.get(parentRef);
        if (!parentSnap.exists) throw new Error("PARENT_COMMENT_NOT_FOUND");
        notificationTarget = parentSnap.data()?.authorId || null;
        tx.update(parentRef, {
          replyCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        notificationTarget = post.authorId || null;
      }

      tx.set(commentRef, {
        postId,
        authorId: uid,
        authorName: sanitizeString(authorName, 100),
        authorAvatar: userData.photoURL || userData.avatarURL || userData.avatarUrl || authUser?.photoURL || "",
        authorTier,
        content,
        parentId,
        replyCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.update(postRef, {
        commentCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    if (notificationTarget && notificationTarget !== uid) {
      await adminDb.collection("users").doc(notificationTarget).collection("notifications").add({
        type: notificationType,
        title: notificationType === "reply" ? "New reply to your comment" : "New comment on your post",
        body: `${authorName} ${notificationType === "reply" ? "replied to your comment" : "left a comment on your post"}.`,
        linkUrl: `/community?post=${postId}`,
        createdBy: uid,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return apiResponse({ id: commentRef.id }, { status: 201 });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 20 } }
);

export const POST = handler;
