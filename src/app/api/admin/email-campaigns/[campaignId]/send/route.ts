import { FieldValue } from "firebase-admin/firestore";

import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { emailHash, renderCampaignEmail, renderCampaignText, sendResendEmail } from "@/lib/email/resend";
import { writeAdminAuditLog } from "@/admin/audit";

const MAX_RECIPIENTS_PER_RUN = 100;

function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

const handler = createAPIHandler(async (req, context) => {
  const entitlements = await requireRole(req as any, "admin");
  const params = await context.params;
  const campaignId = params.campaignId;
  if (!campaignId) return apiError("Campaign not found.", { status: 404, code: "EMAIL_CAMPAIGN_NOT_FOUND" });
  const campaignRef = adminDb.collection("emailCampaigns").doc(campaignId);
  const campaignSnapshot = await campaignRef.get();
  const campaign = campaignSnapshot.data();
  if (!campaignSnapshot.exists || !campaign) return apiError("Campaign not found.", { status: 404, code: "EMAIL_CAMPAIGN_NOT_FOUND" });
  if (!["draft", "failed", "sending"].includes(campaign.status)) return apiError("This campaign cannot be sent in its current state.", { status: 409, code: "EMAIL_CAMPAIGN_NOT_SENDABLE" });

  const usersSnapshot = await adminDb.collection("users").where("emailMarketingOptIn", "==", true).limit(1000).get();
  const recipients = usersSnapshot.docs
    .map((doc) => ({ uid: doc.id, profile: doc.data() as Record<string, unknown> }))
    .filter(({ profile }) => profile.emailVerified !== false)
    .filter(({ profile }) => campaign.audienceTier === "all" || profile.tier === campaign.audienceTier || profile.subscriptionTier === campaign.audienceTier)
    .map(({ uid, profile }) => ({ uid, email: String(profile.email || "").trim().toLowerCase() }))
    .filter((recipient) => validEmail(recipient.email));

  await campaignRef.update({ status: "sending", recipientCount: recipients.length, updatedAt: FieldValue.serverTimestamp() });
  let sentCount = 0;
  let failedCount = 0;
  for (const recipient of recipients.slice(0, MAX_RECIPIENTS_PER_RUN)) {
    const suppressionRef = adminDb.collection("emailSuppressions").doc(emailHash(recipient.email));
    if ((await suppressionRef.get()).exists) continue;
    const deliveryRef = adminDb.collection("emailDeliveries").doc(`${campaignId}_${emailHash(recipient.email)}`);
    const deliverySnapshot = await deliveryRef.get();
    if (["sent", "delivered"].includes(deliverySnapshot.data()?.status)) continue;
    await deliveryRef.set({ campaignId, recipientUid: recipient.uid, recipientEmail: recipient.email, status: "sending", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    try {
      const emailInput = {
        preheader: typeof campaign.preheader === "string" ? campaign.preheader : undefined,
        body: String(campaign.body || ""),
        ctaLabel: typeof campaign.ctaLabel === "string" ? campaign.ctaLabel : undefined,
        ctaUrl: typeof campaign.ctaUrl === "string" ? campaign.ctaUrl : undefined,
        recipientEmail: recipient.email,
      };
      const resendId = await sendResendEmail({
        to: recipient.email,
        subject: String(campaign.subject),
        html: renderCampaignEmail(emailInput),
        text: renderCampaignText(emailInput),
        idempotencyKey: `sdc-email-${campaignId}-${emailHash(recipient.email)}`,
      });
      await deliveryRef.set({ status: "sent", resendId, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      sentCount++;
    } catch {
      await deliveryRef.set({ status: "failed", failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      failedCount++;
    }
  }

  const isComplete = recipients.length < MAX_RECIPIENTS_PER_RUN;
  const status = isComplete ? (failedCount > 0 && sentCount === 0 ? "failed" : "sent") : "sending";
  await campaignRef.update({ status, sentCount: FieldValue.increment(sentCount), failedCount: FieldValue.increment(failedCount), sentAt: isComplete ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() });
  await writeAdminAuditLog({ adminId: entitlements.uid, adminEmail: entitlements.profile?.email, action: "email_campaign_send_attempted", entityType: "emailCampaign", entityId: campaignId, after: { status, recipients: recipients.length, sentCount, failedCount } });
  return apiResponse({ ok: true, status, recipientCount: recipients.length, sentCount, failedCount, continueSending: !isComplete });
});

export const POST = handler;
