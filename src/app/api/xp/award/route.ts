import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/serverAuth";
import { isXPActionKey } from "@/lib/xp-policy";
import { awardXPForUser } from "@/lib/server/xp-service";

type AwardXPRequest = {
  action?: unknown;
  resourceId?: unknown;
  metadata?: unknown;
  xpOverride?: unknown;
};

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

export const POST = createAPIHandler(
  async (req) => {
    const { uid } = await requireAuth(req as any);
    const body = (await req.json().catch(() => ({}))) as AwardXPRequest;

    if (!isXPActionKey(body.action)) {
      return apiError("Unsupported XP action", { status: 400, code: "INVALID_XP_ACTION" });
    }

    const action = body.action;
    const resourceId = typeof body.resourceId === "string" && body.resourceId.trim()
      ? body.resourceId.trim()
      : null;
    let xpOverride: number | undefined;
    if (action === "mission_completed") {
      xpOverride = await resolveMissionXP(uid, resourceId);
    } else if (typeof body.xpOverride === "number" && body.xpOverride >= 0) {
      xpOverride = body.xpOverride;
    }
    const result = await awardXPForUser({
      userId: uid,
      action,
      resourceId,
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata as Record<string, unknown>
        : undefined,
      xpOverride,
    });
    return apiResponse(result);
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 30 },
    timeout: 20000,
  }
);
