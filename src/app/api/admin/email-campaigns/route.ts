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

const handler = createAPIHandler(async (req) => {
  const entitlements = await requireRole(req as any, "admin");
  if (req.method === "GET") {
    const snapshot = await adminDb.collection("emailCampaigns").orderBy("createdAt", "desc").limit(100).get();
    return apiResponse({ campaigns: snapshot.docs.map((doc) => ({ campaignId: doc.id, ...doc.data() })) });
  }

  const body = await req.json().catch(() => ({}));
  const subject = cleanString(body.subject, 180);
  const preheader = cleanString(body.preheader, 240);
  const message = cleanString(body.body, 100000);
  const ctaLabel = cleanString(body.ctaLabel, 80);
  const ctaUrl = cleanString(body.ctaUrl, 2000);
  const audienceTier: EmailAudienceTier = TIERS.has(body.audienceTier) ? body.audienceTier : "all";

  if (!subject || !message) return apiError("Subject and message are required.", { status: 400, code: "EMAIL_CAMPAIGN_CONTENT_REQUIRED" });
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl) && !ctaUrl.startsWith("/")) return apiError("The call-to-action URL must be a secure link.", { status: 400, code: "EMAIL_CAMPAIGN_CTA_INVALID" });

  const now = FieldValue.serverTimestamp();
  const ref = adminDb.collection("emailCampaigns").doc();
  const record = {
    campaignId: ref.id,
    subject,
    preheader,
    body: message,
    ctaLabel: ctaLabel || null,
    ctaUrl: ctaUrl || null,
    audienceTier,
    status: "draft",
    recipientCount: 0,
    sentCount: 0,
    failedCount: 0,
    createdBy: entitlements.uid,
    createdByEmail: entitlements.profile?.email || null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
  };
  await ref.set(record);
  await writeAdminAuditLog({ adminId: entitlements.uid, adminEmail: entitlements.profile?.email, action: "email_campaign_created", entityType: "emailCampaign", entityId: ref.id, after: record });
  return apiResponse({ campaign: record }, { status: 201 });
});

export const GET = handler;
export const POST = handler;
