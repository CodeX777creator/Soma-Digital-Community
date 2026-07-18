import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "crypto";
import { apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hashIp(value: string) {
  if (!value) return null;
  return createHash("sha256").update(value.split(",")[0].trim()).digest("hex");
}

export const POST = createAPIHandler(
  async (req: NextRequest) => {
    const body = await req.json().catch(() => ({}));
    const slug = clean(body.slug, 120);
    const itemId = clean(body.itemId, 180);
    const itemType = clean(body.itemType, 40);
    const page = clean(body.page, 240);

    if (!slug) return apiResponse({ ok: true, tracked: false });

    const linksSnap = await adminDb.collection("resellerLinks").where("slug", "==", slug).limit(5).get();
    const matched = linksSnap.docs.find((doc) => {
      const data = doc.data() || {};
      if (!itemId) return true;
      return data.assetId === itemId || data.courseId === itemId;
    });

    if (!matched) return apiResponse({ ok: true, tracked: false });

    const link = matched.data() || {};
    const clickRef = adminDb.collection("resellerLinkClicks").doc();
    const now = FieldValue.serverTimestamp();
    await Promise.all([
      clickRef.set({
        clickId: clickRef.id,
        resellerLinkId: matched.id,
        resellerUserId: link.userId || null,
        slug,
        itemId: link.courseId || link.assetId || itemId || null,
        itemType: link.itemType || itemType || null,
        page,
        userAgent: clean(req.headers.get("user-agent"), 500),
        referrer: clean(req.headers.get("referer"), 500),
        ipHash: hashIp(clean(req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"), 120)),
        createdAt: now,
      }),
      matched.ref.set({
        clickCount: FieldValue.increment(1),
        lastClickedAt: now,
        updatedAt: now,
      }, { merge: true }),
    ]);

    return apiResponse({ ok: true, tracked: true });
  },
  {
    rateLimit: { windowMs: 60 * 1000, maxRequests: 120 },
    timeout: 10000,
  }
);
