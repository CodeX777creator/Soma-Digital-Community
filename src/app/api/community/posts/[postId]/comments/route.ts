import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { sanitizeString } from "@/lib/security";
import { awardXPForUser } from "@/lib/server/xp-service";
import { logger } from "@/lib/logger";

const handler = createAPIHandler(
  async (req: NextRequest, context) => {
    const { uid, email } = await requireAuth(req);
    const { postId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const content = sanitizeString(String(body?.content || "").trim(), 2000);
    const parentId = typeof body?.parentId === "string" && body.parentId.trim()
      ? body.parentId.trim()
      : null;
    const media = body?.media && typeof body.media === "object" ? body.media as Record<string, unknown> : null;
    const mediaUrl = typeof media?.url === "string" ? media.url.trim() : "";
    const mediaPreviewUrl = typeof media?.previewUrl === "string" ? media.previewUrl.trim() : mediaUrl;
    const mediaAlt = typeof media?.alt === "string" ? sanitizeString(media.alt, 160) : "Community GIF";
    const isAllowedGifUrl = (value: string) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && (
          url.hostname === "media.giphy.com" ||
          url.hostname.endsWith(".giphy.com") ||
          url.hostname === "media.tenor.com" ||
          url.hostname.endsWith(".tenor.com")
        );
      } catch {
        return false;
      }
    };
    const safeMedia = (media?.type === "gif" || media?.type === "sticker") && isAllowedGifUrl(mediaUrl)
      ? { type: media.type, url: mediaUrl, previewUrl: isAllowedGifUrl(mediaPreviewUrl) ? mediaPreviewUrl : mediaUrl, alt: mediaAlt }
      : null;

    if (!postId) {
      return apiError("Missing post id", { status: 400, code: "MISSING_POST_ID" });
    }
    if (!content && !safeMedia) {
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
        ...(safeMedia ? {
          mediaType: safeMedia.type,
          mediaUrl: safeMedia.url,
          mediaPreviewUrl: safeMedia.previewUrl,
          mediaAlt: safeMedia.alt,
        } : {}),
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

    try {
      await awardXPForUser({
        userId: uid,
        action: parentId ? "community_reply_created" : "community_comment_created",
        resourceId: commentRef.id,
        metadata: parentId ? { postId, parentCommentId: parentId } : { postId },
      });
    } catch (error) {
      logger.error("Failed to award community comment XP", error instanceof Error ? error : undefined, {
        userId: uid,
        postId,
        commentId: commentRef.id,
        parentId,
      });
    }

    return apiResponse({ id: commentRef.id }, { status: 201 });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 20 } }
);

export const POST = handler;
