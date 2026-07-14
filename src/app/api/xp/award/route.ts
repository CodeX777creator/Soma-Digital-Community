import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { getXPPolicy, isXPActionKey, type XPActionKey } from "@/lib/xp-policy";
import { sanitizeString } from "@/lib/security";

type AwardXPRequest = {
  action?: unknown;
  resourceId?: unknown;
  metadata?: unknown;
  xpOverride?: unknown;
};

function getYMD(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function safeObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function sanitizeMetadata(value: unknown) {
  const raw = safeObject(value);
  const entries = Object.entries(raw).slice(0, 20);
  const metadata: Record<string, any> = {};

  for (const [key, item] of entries) {
    const safeKey = sanitizeString(key, 80);
    if (!safeKey) continue;
    if (typeof item === "string") metadata[safeKey] = sanitizeString(item, 500);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) metadata[safeKey] = item;
  }

  return metadata;
}

function buildEventId(uid: string, action: XPActionKey, resourceId: string | null) {
  const policy = getXPPolicy(action);
  const day = getYMD();
  const safeResource = resourceId ? sanitizeString(resourceId, 160).replace(/[^a-zA-Z0-9_-]/g, "_") : null;

  if (policy.idempotency === "daily") return `${action}_${uid}_${day}`;
  if (policy.idempotency === "resource" && safeResource) return `${action}_${safeResource}`;
  return `${action}_${uid}`;
}

async function getDailyAwarded(uid: string, action: XPActionKey, dateString: string) {
  const snap = await adminDb
    .collection("users")
    .doc(uid)
    .collection("xpEvents")
    .where("action", "==", action)
    .where("dateString", "==", dateString)
    .get();

  return snap.docs.reduce((total, doc) => total + (typeof doc.data().xp === "number" ? doc.data().xp : 0), 0);
}

async function resolveMissionXP(uid: string, missionId: string | null) {
  if (!missionId) return 0;
  const snap = await adminDb.collection("users").doc(uid).collection("missions").doc(missionId).get();
  if (!snap.exists) return 0;
  const data = snap.data() || {};
  return typeof data.xp === "number"
    ? data.xp
    : typeof data.xpReward === "number"
      ? data.xpReward
      : 0;
}

async function createNotification(uid: string, action: XPActionKey, xp: number, resourceId: string | null) {
  const policy = getXPPolicy(action);
  if (!policy.notification || xp <= 0) return;

  await adminDb.collection("users").doc(uid).collection("notifications").add({
    type: policy.notification.type,
    title: policy.notification.title,
    body: policy.notification.body(xp),
    linkUrl: action === "mission_completed" && resourceId
      ? `/dashboard?mission=${encodeURIComponent(resourceId)}`
      : policy.notification.linkUrl,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const POST = createAPIHandler(
  async (req) => {
    const { uid } = await requireAuth(req as any);
    const body = (await req.json().catch(() => ({}))) as AwardXPRequest;

    if (!isXPActionKey(body.action)) {
      return apiError("Unsupported XP action", { status: 400, code: "INVALID_XP_ACTION" });
    }

    const action = body.action;
    const policy = getXPPolicy(action);
    const resourceId = typeof body.resourceId === "string" && body.resourceId.trim()
      ? sanitizeString(body.resourceId, 160)
      : null;

    if (policy.idempotency === "resource" && !resourceId) {
      return apiError("resourceId is required for this XP action", { status: 400, code: "MISSING_RESOURCE_ID" });
    }

    let xp = policy.xp;
    if (action === "mission_completed") {
      xp = await resolveMissionXP(uid, resourceId);
    } else if (typeof body.xpOverride === "number" && body.xpOverride >= 0) {
      xp = Math.min(policy.xp, Math.floor(body.xpOverride));
    }

    if (!Number.isFinite(xp) || xp <= 0) {
      return apiResponse({ awarded: false, xp: 0, reason: "NO_XP_AVAILABLE" });
    }

    const dateString = getYMD();
    if (policy.dailyCap) {
      const alreadyAwarded = await getDailyAwarded(uid, action, dateString);
      if (alreadyAwarded >= policy.dailyCap) {
        return apiResponse({ awarded: false, xp: 0, reason: "DAILY_CAP_REACHED" });
      }
      xp = Math.min(xp, policy.dailyCap - alreadyAwarded);
    }

    const eventId = buildEventId(uid, action, resourceId);
    const eventRef = adminDb.collection("users").doc(uid).collection("xpEvents").doc(eventId);
    const userRef = adminDb.collection("users").doc(uid);
    const publicProfileRef = adminDb.collection("publicProfiles").doc(uid);
    const metadata = sanitizeMetadata(body.metadata);

    let awarded = false;
    await adminDb.runTransaction(async (tx) => {
      const eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) {
        awarded = false;
        return;
      }

      const timestamp = FieldValue.serverTimestamp();
      tx.set(eventRef, {
        action,
        type: policy.eventType,
        xp,
        metadata,
        resourceId,
        dateString,
        source: "xp_award_api",
        createdAt: timestamp,
        createdAtTimestamp: Timestamp.now(),
      });
      tx.set(userRef, {
        xp: FieldValue.increment(xp),
        updatedAt: timestamp,
      }, { merge: true });
      tx.set(publicProfileRef, {
        xp: FieldValue.increment(xp),
        updatedAt: timestamp,
      }, { merge: true });
      awarded = true;
    });

    if (awarded) {
      await createNotification(uid, action, xp, resourceId);
    }

    return apiResponse({
      awarded,
      xp: awarded ? xp : 0,
      eventId,
    });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 20000,
  }
);
