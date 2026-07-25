import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { sanitizeString } from "@/lib/security";
import { getXPPolicy, type XPActionKey } from "@/lib/xp-policy";

type AwardXPInput = {
  userId: string;
  action: XPActionKey;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  xpOverride?: number;
};

type AwardXPOptions = {
  notify?: boolean;
};

export type AwardXPResult = {
  awarded: boolean;
  xp: number;
  eventId?: string;
  reason?: string;
};

function getYMD(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sanitizeMetadata(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const metadata: Record<string, any> = {};

  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    const safeKey = sanitizeString(key, 80);
    if (!safeKey) continue;
    if (typeof item === "string") metadata[safeKey] = sanitizeString(item, 500);
    else if (typeof item === "number" || typeof item === "boolean" || item === null) metadata[safeKey] = item;
  }

  return metadata;
}

function buildEventId(uid: string, action: XPActionKey, resourceId: string | null) {
  const policy = getXPPolicy(action);
  const safeResource = resourceId
    ? sanitizeString(resourceId, 160).replace(/[^a-zA-Z0-9_-]/g, "_")
    : null;

  if (policy.idempotency === "daily") return `${action}_${uid}_${getYMD()}`;
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

  return snap.docs.reduce((total, doc) => {
    const xp = doc.data().xp;
    return total + (typeof xp === "number" ? xp : 0);
  }, 0);
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

export async function awardXPForUser(input: AwardXPInput, options: AwardXPOptions = {}): Promise<AwardXPResult> {
  const policy = getXPPolicy(input.action);
  const resourceId = typeof input.resourceId === "string" && input.resourceId.trim()
    ? sanitizeString(input.resourceId, 160)
    : null;

  if (policy.idempotency === "resource" && !resourceId) {
    return { awarded: false, xp: 0, reason: "MISSING_RESOURCE_ID" };
  }

  let xp = policy.xp;
  if (typeof input.xpOverride === "number" && Number.isFinite(input.xpOverride) && input.xpOverride >= 0) {
    xp = Math.min(policy.xp, Math.floor(input.xpOverride));
  }
  if (!Number.isFinite(xp) || xp <= 0) return { awarded: false, xp: 0, reason: "NO_XP_AVAILABLE" };

  const dateString = getYMD();
  if (policy.dailyCap) {
    const alreadyAwarded = await getDailyAwarded(input.userId, input.action, dateString);
    if (alreadyAwarded >= policy.dailyCap) return { awarded: false, xp: 0, reason: "DAILY_CAP_REACHED" };
    xp = Math.min(xp, policy.dailyCap - alreadyAwarded);
  }

  const eventId = buildEventId(input.userId, input.action, resourceId);
  const eventRef = adminDb.collection("users").doc(input.userId).collection("xpEvents").doc(eventId);
  const userRef = adminDb.collection("users").doc(input.userId);
  const publicProfileRef = adminDb.collection("publicProfiles").doc(input.userId);
  const metadata = sanitizeMetadata(input.metadata);
  let awarded = false;

  await adminDb.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) return;

    const timestamp = FieldValue.serverTimestamp();
    tx.set(eventRef, {
      action: input.action,
      type: policy.eventType,
      xp,
      metadata,
      resourceId,
      dateString,
      source: "xp_service",
      createdAt: timestamp,
      createdAtTimestamp: Timestamp.now(),
    });
    tx.set(userRef, { xp: FieldValue.increment(xp), updatedAt: timestamp }, { merge: true });
    tx.set(publicProfileRef, { xp: FieldValue.increment(xp), updatedAt: timestamp }, { merge: true });
    awarded = true;
  });

  if (awarded && options.notify !== false) {
    await createNotification(input.userId, input.action, xp, resourceId);
  }

  return { awarded, xp: awarded ? xp : 0, eventId };
}
