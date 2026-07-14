import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";

const followHandler = createAPIHandler(
  async (req: NextRequest, context) => {
    const { uid } = await requireAuth(req);
    const { targetUserId } = await context.params;

    if (!targetUserId || targetUserId === uid) {
      return apiError("Invalid follow target", { status: 400, code: "INVALID_TARGET" });
    }

    const [viewerSnap, targetSnap] = await Promise.all([
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("users").doc(targetUserId).get(),
    ]);
    if (!targetSnap.exists) {
      return apiError("User not found", { status: 404, code: "USER_NOT_FOUND" });
    }

    const viewer = viewerSnap.data() || {};
    const target = targetSnap.data() || {};
    const viewerName = viewer.name || viewer.displayName || "Community member";
    const targetName = target.name || target.displayName || "Community member";
    const batch = adminDb.batch();

    batch.set(adminDb.doc(`users/${uid}/following/${targetUserId}`), {
      userId: targetUserId,
      name: targetName,
      followedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(adminDb.doc(`users/${targetUserId}/followers/${uid}`), {
      userId: uid,
      name: viewerName,
      followedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(adminDb.doc(`publicProfiles/${uid}/following/${targetUserId}`), {
      userId: targetUserId,
      followedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(adminDb.doc(`publicProfiles/${targetUserId}/followers/${uid}`), {
      userId: uid,
      followedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(adminDb.collection("users").doc(targetUserId).collection("notifications").doc(`follow_${uid}`), {
      type: "info",
      title: "New follower",
      body: `${viewerName} followed you.`,
      linkUrl: "/community",
      createdBy: uid,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    return apiResponse({ following: true });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } }
);

const unfollowHandler = createAPIHandler(
  async (req: NextRequest, context) => {
    const { uid } = await requireAuth(req);
    const { targetUserId } = await context.params;

    if (!targetUserId || targetUserId === uid) {
      return apiError("Invalid follow target", { status: 400, code: "INVALID_TARGET" });
    }

    const batch = adminDb.batch();
    batch.delete(adminDb.doc(`users/${uid}/following/${targetUserId}`));
    batch.delete(adminDb.doc(`users/${targetUserId}/followers/${uid}`));
    batch.delete(adminDb.doc(`publicProfiles/${uid}/following/${targetUserId}`));
    batch.delete(adminDb.doc(`publicProfiles/${targetUserId}/followers/${uid}`));
    await batch.commit();

    return apiResponse({ following: false });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 30 } }
);

export const POST = followHandler;
export const DELETE = unfollowHandler;
