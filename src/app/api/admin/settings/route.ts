import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function sanitizeSiteConfig(value: unknown) {
  const data = asObject(value);
  const stringField = (key: string) => typeof data[key] === "string" ? data[key].trim() : "";
  return {
    brandName: stringField("brandName") || "Soma Digital Community",
    contactEmail: stringField("contactEmail"),
    twitterUrl: stringField("twitterUrl"),
    instagramUrl: stringField("instagramUrl"),
    youtubeUrl: stringField("youtubeUrl"),
    linkedinUrl: stringField("linkedinUrl"),
    logoUrl: stringField("logoUrl"),
    faviconUrl: stringField("faviconUrl"),
    socialShareImageUrl: stringField("socialShareImageUrl"),
    emailHeaderLogoUrl: stringField("emailHeaderLogoUrl"),
    certificateSealUrl: stringField("certificateSealUrl"),
    brandPalette: stringField("brandPalette") || "blue_violet",
    brandFont: stringField("brandFont") || "Inter",
    brandVoicePreset: stringField("brandVoicePreset") || "premium_helpful",
  };
}

function sanitizePricing(value: unknown) {
  const data = asObject(value);
  const pro = Number(data.pro);
  const elite = Number(data.elite);
  if (!Number.isFinite(pro) || pro < 0 || !Number.isFinite(elite) || elite < 0) {
    throw new Error("Pricing values must be zero or higher.");
  }
  return { pro, elite };
}

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, "admin");
  const body = await req.json();
  const target = typeof body.target === "string" ? body.target : "";
  const ref = target === "pricing"
    ? adminDb.doc("config/pricing")
    : target === "site"
      ? adminDb.doc("config/site")
      : target === "creatorCredits"
        ? adminDb.doc("config/creatorCredits")
        : null;

  if (!ref) {
    return apiError("Choose a valid settings area to update.", { status: 400, code: "INVALID_SETTINGS_TARGET" });
  }

  const beforeSnap = await ref.get();
  const before = beforeSnap.exists ? beforeSnap.data() : null;
  let after: Record<string, any>;

  try {
    after = target === "pricing"
      ? sanitizePricing(body.data)
      : target === "site"
        ? sanitizeSiteConfig(body.data)
        : asObject(body.data);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Invalid settings payload.", { status: 400, code: "INVALID_SETTINGS_PAYLOAD" });
  }

  await ref.set({
    ...after,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: entitlements.uid,
  }, { merge: true });

  await writeAdminAuditLog({
    adminId: entitlements.uid,
    action: `settings_${target}_updated`,
    entityType: "config",
    entityId: target,
    before,
    after,
  });

  return apiResponse({ ok: true, target, data: after });
});

export const PATCH = handler;
