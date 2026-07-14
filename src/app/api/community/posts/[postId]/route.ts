import { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { hasAdminAccess, requireAuth } from "@/lib/serverAuth";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { sanitizeString, validateUrl } from "@/lib/security";
import { isPostChannel } from "@/lib/communityChannels";

const POST_TYPES = ["win", "insight", "mentorship", "announcement", "question"];
const EDIT_WINDOW_MS = 60 * 60 * 1000;

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => sanitizeString(tag.trim(), 50))
    .filter(Boolean)
    .slice(0, 10);
}

async function isAdminUser(uid: string) {
  const profile = (await adminDb.collection("users").doc(uid).get()).data();
  return hasAdminAccess(profile);
}

const patchHandler = createAPIHandler(
  async (req: NextRequest, context) => {
    const { uid } = await requireAuth(req);
    const { postId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "edit";
    const postRef = adminDb.collection("posts").doc(postId);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return apiError("Post not found", { status: 404, code: "POST_NOT_FOUND" });
    }

    const post = postSnap.data() || {};
    const isOwner = post.authorId === uid;
    const isAdmin = await isAdminUser(uid);
    if (!isOwner && !isAdmin) {
      return apiError("You cannot update this post", { status: 403, code: "FORBIDDEN" });
    }

    if (action === "pin") {
      if (!isAdmin) {
        return apiError("Only admins can pin posts", { status: 403, code: "FORBIDDEN" });
      }
      await postRef.update({
        isPinned: body?.isPinned === true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return apiResponse({ ok: true });
    }

    if (action === "restore") {
      const content = sanitizeString(String(body?.content || "").trim(), 5000);
      if (!content) {
        return apiError("Original content is required", { status: 400, code: "MISSING_CONTENT" });
      }
      await postRef.update({
        deleted: false,
        content,
        deletedAt: null,
        restoredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return apiResponse({ ok: true });
    }

    if (!isAdmin && post.createdAt instanceof Timestamp) {
      const createdAtMs = post.createdAt.toMillis();
      if (Date.now() - createdAtMs > EDIT_WINDOW_MS) {
        return apiError("The edit window for this post has closed", {
          status: 403,
          code: "EDIT_WINDOW_CLOSED",
        });
      }
    }

    const content = sanitizeString(String(body?.content || "").trim(), 5000);
    if (!content) {
      return apiError("Post content is required", { status: 400, code: "MISSING_CONTENT" });
    }

    const linkUrl = typeof body?.linkUrl === "string" && body.linkUrl.trim()
      ? body.linkUrl.trim()
      : null;
    if (linkUrl) {
      const validation = validateUrl(linkUrl);
      if (!validation.valid) {
        return apiError("Invalid link URL", { status: 400, code: "INVALID_LINK_URL" });
      }
    }

    const update: Record<string, unknown> = {
      content,
      tags: normalizeTags(body?.tags),
      type: POST_TYPES.includes(body?.type) ? body.type : "insight",
      channel: isPostChannel(body?.channel) ? body.channel : post.channel,
      linkUrl,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      isEdited: true,
    };

    await postRef.update(update);
    return apiResponse({ ok: true });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 20 } }
);

const deleteHandler = createAPIHandler(
  async (req: NextRequest, context) => {
    const { uid } = await requireAuth(req);
    const { postId } = await context.params;
    const postRef = adminDb.collection("posts").doc(postId);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return apiError("Post not found", { status: 404, code: "POST_NOT_FOUND" });
    }

    const post = postSnap.data() || {};
    const isOwner = post.authorId === uid;
    const isAdmin = await isAdminUser(uid);
    if (!isOwner && !isAdmin) {
      return apiError("You cannot delete this post", { status: 403, code: "FORBIDDEN" });
    }

    await postRef.update({
      deleted: true,
      content: "[deleted]",
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return apiResponse({ ok: true });
  },
  { rateLimit: { windowMs: 60 * 1000, maxRequests: 20 } }
);

export const PATCH = patchHandler;
export const DELETE = deleteHandler;
