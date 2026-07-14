import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";

const REACTION_TYPES = ["like", "love", "funny", "wow", "sad", "fire"] as const;
type ReactionType = (typeof REACTION_TYPES)[number];

function isReactionType(value: unknown): value is ReactionType {
  return typeof value === "string" && REACTION_TYPES.includes(value as ReactionType);
}

const handler = createAPIHandler(
  async (req: NextRequest, context) => {
    const { uid } = await requireAuth(req);
    const { postId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const reaction = body?.reaction;

    if (!postId) {
      return apiError("Missing post id", { status: 400, code: "MISSING_POST_ID" });
    }
    if (reaction !== null && !isReactionType(reaction)) {
      return apiError("Invalid reaction", { status: 400, code: "INVALID_REACTION" });
    }

    const postRef = adminDb.collection("posts").doc(postId);
    const reactionRef = adminDb.collection("likes").doc(`${uid}_${postId}`);
    let notificationTarget: string | null = null;
    let shouldNotify = false;

    await adminDb.runTransaction(async (tx) => {
      const [postSnap, existingSnap] = await Promise.all([
        tx.get(postRef),
        tx.get(reactionRef),
      ]);

      if (!postSnap.exists) {
        throw new Error("POST_NOT_FOUND");
      }

      const post = postSnap.data() || {};
      if (post.deleted === true) {
        throw new Error("POST_DELETED");
      }

      const existingType = existingSnap.exists ? existingSnap.data()?.type : null;
      notificationTarget = post.authorId && post.authorId !== uid ? post.authorId : null;

      if (reaction === null || existingType === reaction) {
        if (!existingSnap.exists) return;
        tx.delete(reactionRef);
        tx.update(postRef, {
          likeCount: FieldValue.increment(-1),
          [`reactionCounts.${existingType}`]: FieldValue.increment(-1),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }

      tx.set(reactionRef, {
        postId,
        userId: uid,
        type: reaction,
        createdAt: existingSnap.exists ? existingSnap.data()?.createdAt : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      if (existingType) {
        tx.update(postRef, {
          [`reactionCounts.${existingType}`]: FieldValue.increment(-1),
          [`reactionCounts.${reaction}`]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        shouldNotify = true;
        tx.update(postRef, {
          likeCount: FieldValue.increment(1),
          [`reactionCounts.${reaction}`]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    if (shouldNotify && notificationTarget) {
      const actorSnap = await adminDb.collection("users").doc(uid).get();
      const actor = actorSnap.data() || {};
      const actorName = actor.name || actor.displayName || "Someone";
      await adminDb.collection("users").doc(notificationTarget).collection("notifications").add({
        type: "like",
        title: "New reaction on your post",
        body: `${actorName} reacted to your community post.`,
        linkUrl: `/community?post=${postId}`,
        createdBy: uid,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return apiResponse({ ok: true });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 60 } }
);

export const PATCH = handler;
