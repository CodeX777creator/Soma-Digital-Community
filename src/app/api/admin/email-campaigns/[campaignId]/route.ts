import { FieldValue } from "firebase-admin/firestore";

import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";
import { EmailAudienceTier } from "@/lib/email/resend";

const TIERS = new Set<EmailAudienceTier>(["all", "explorer", "pro", "elite", "enterprise"]);

function cleanString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export const GET = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const params = await context.params;
  const campaignId = params.campaignId;
  if (!campaignId) return apiError("Campaign not found.", { status: 404, code: "EMAIL_CAMPAIGN_NOT_FOUND" });
  const ref = adminDb.collection("emailCampaigns").doc(campaignId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return apiError("Campaign not found.", { status: 404, code: "EMAIL_CAMPAIGN_NOT_FOUND" });
  return apiResponse({ campaign: { campaignId, ...snapshot.data() } });
});

export const PATCH = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const params = await context.params;
  const campaignId = params.campaignId;
  if (!campaignId) return apiError("Campaign not found.", { status: 404, code: "EMAIL_CAMPAIGN_NOT_FOUND" });
  const ref = adminDb.collection("emailCampaigns").doc(campaignId);
  const snapshot = await ref.get();
  const existing = snapshot.data();
  if (!snapshot.exists || !existing) return apiError("Campaign not found.", { status: 404, code: "EMAIL_CAMPAIGN_NOT_FOUND" });
  if (!["draft", "failed"].includes(existing.status)) return apiError("Only draft campaigns can be edited.", { status: 409, code: "EMAIL_CAMPAIGN_NOT_EDITABLE" });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {
    subject: cleanString(body.subject, 180),
    preheader: cleanString(body.preheader, 240),
    body: cleanString(body.body, 100000),
    ctaLabel: cleanString(body.ctaLabel, 80) || null,
    ctaUrl: cleanString(body.ctaUrl, 2000) || null,
    audienceTier: TIERS.has(body.audienceTier) ? body.audienceTier : "all",
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!updates.subject || !updates.body) return apiError("Subject and message are required.", { status: 400, code: "EMAIL_CAMPAIGN_CONTENT_REQUIRED" });
  if (updates.ctaUrl && !/^https?:\/\//i.test(String(updates.ctaUrl)) && !String(updates.ctaUrl).startsWith("/")) {
    return apiError("The call-to-action URL must be a secure link.", { status: 400, code: "EMAIL_CAMPAIGN_CTA_INVALID" });
  }
  await ref.update(updates);
  await writeAdminAuditLog({ adminId: entitlements.uid, adminEmail: entitlements.profile?.email, action: "email_campaign_updated", entityType: "emailCampaign", entityId: campaignId, before: existing, after: updates });
  return apiResponse({ ok: true });
});

export const DELETE = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const params = await context.params;
  const campaignId = params.campaignId;
  if (!campaignId) return apiError("Campaign not found.", { status: 404, code: "EMAIL_CAMPAIGN_NOT_FOUND" });
  const ref = adminDb.collection("emailCampaigns").doc(campaignId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return apiError("Campaign not found.", { status: 404, code: "EMAIL_CAMPAIGN_NOT_FOUND" });
  await ref.update({ status: "archived", updatedAt: FieldValue.serverTimestamp() });
  await writeAdminAuditLog({ adminId: entitlements.uid, adminEmail: entitlements.profile?.email, action: "email_campaign_archived", entityType: "emailCampaign", entityId: campaignId, before: snapshot.data(), after: { status: "archived" } });
  return apiResponse({ ok: true });
});
