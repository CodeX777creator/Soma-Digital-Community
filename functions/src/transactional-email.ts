import * as admin from 'firebase-admin';
import { defineSecret, defineString } from 'firebase-functions/params';
import { readRuntimeSecret } from './runtime-config';

export const resendApiKey = defineSecret('RESEND_API_KEY');
const resendFromEmail = defineString('RESEND_FROM_EMAIL', { default: 'Soma Digital Community <updates@somatoday.com>' });
const resendReplyToEmail = defineString('RESEND_REPLY_TO_EMAIL', { default: 'support@somatoday.com' });

const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] || character);
}

function resolveUrl(value: string): string {
  return value.startsWith('/') ? `https://www.somatoday.com${value}` : value;
}

function renderTransactionalEmail(input: { preheader: string; paragraphs: string[]; ctaLabel?: string; ctaUrl?: string }): { html: string; text: string } {
  const paragraphs = input.paragraphs.map((paragraph) =>
    `<p style="margin:0 0 18px;line-height:1.65;color:#cbd5e1;">${escapeHtml(paragraph).replace(/\r?\n/g, '<br />')}</p>`
  ).join('');
  const cta = input.ctaLabel && input.ctaUrl
    ? `<p style="margin:28px 0;"><a href="${escapeHtml(resolveUrl(input.ctaUrl))}" style="display:inline-block;background:#22d3ee;color:#071018;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">${escapeHtml(input.ctaLabel)}</a></p>`
    : '';

  return {
    html: `<!doctype html><html><body style="margin:0;background:#090b13;color:#fff;font-family:Arial,sans-serif;"><span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</span><div style="max-width:640px;margin:0 auto;padding:32px 20px;"><div style="border:1px solid rgba(255,255,255,.12);border-radius:16px;background:#111827;padding:28px;"><p style="margin:0 0 24px;color:#67e8f9;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:12px;">Soma Digital Community</p>${paragraphs}${cta}</div></div></body></html>`,
    text: `${input.preheader}\n\n${input.paragraphs.join('\n\n')}${input.ctaLabel && input.ctaUrl ? `\n\n${input.ctaLabel}: ${resolveUrl(input.ctaUrl)}` : ''}`,
  };
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  type: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const apiKey = readRuntimeSecret('RESEND_API_KEY', resendApiKey);
    if (!apiKey || !input.to) return false;

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: resendFromEmail.value(),
        to: [input.to],
        reply_to: resendReplyToEmail.value(),
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const payload = await response.json().catch(() => ({})) as { id?: unknown };
    if (!response.ok || typeof payload.id !== 'string') {
      console.error('[TransactionalEmail] Resend rejected email', { type: input.type, status: response.status });
      return false;
    }

    await admin.firestore().collection('emailDeliveries').doc(`transactional_${input.idempotencyKey}`).set({
      type: input.type,
      recipientEmail: input.to,
      recipientUid: input.userId || null,
      subject: input.subject,
      resendId: payload.id,
      status: 'sent',
      metadata: input.metadata || null,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('[TransactionalEmail] send failed', {
      type: input.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function sendPurchaseReceiptEmail(input: {
  userId: string;
  purchaseId: string;
  kind: 'creator_credits' | 'academy_course' | 'academy_mrr' | 'marketplace' | 'subscription';
  title: string;
  amountCents?: number | null;
  currency?: string | null;
  accessUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const user = await admin.auth().getUser(input.userId).catch(() => null);
  const email = user?.email?.trim();
  if (!email) return false;

  const currency = input.currency || 'USD';
  const amount = typeof input.amountCents === 'number' ? `${currency} ${(input.amountCents / 100).toFixed(2)}` : 'confirmed';
  const subject = input.kind === 'subscription'
    ? 'Your SDC subscription is active'
    : `Your SDC purchase is confirmed: ${input.title}`;
  const content = renderTransactionalEmail({
    preheader: 'Your Soma Digital Community transaction is confirmed.',
    paragraphs: [
      `Hi ${user?.displayName || 'there'},`,
      `Your ${input.kind === 'subscription' ? 'subscription' : 'purchase'} for ${input.title} has been confirmed.`,
      `Amount: ${amount}.`,
      'Your account access and entitlements are being prepared by SDC.',
    ],
    ctaLabel: input.kind === 'creator_credits' ? 'Open Creator Credits' : 'Open SDC',
    ctaUrl: input.accessUrl,
  });

  return sendTransactionalEmail({
    to: email,
    subject,
    ...content,
    idempotencyKey: `purchase-${input.kind}-${input.purchaseId}`,
    type: `${input.kind}_purchase_confirmation`,
    userId: input.userId,
    metadata: input.metadata,
  });
}

export async function sendPaymentIssueEmail(input: {
  userId: string;
  subject: string;
  title: string;
  body: string;
  idempotencyKey: string;
  accessUrl?: string;
}): Promise<boolean> {
  const user = await admin.auth().getUser(input.userId).catch(() => null);
  const email = user?.email?.trim();
  if (!email) return false;
  const content = renderTransactionalEmail({
    preheader: 'There is an update about your SDC payment.',
    paragraphs: [`Hi ${user?.displayName || 'there'},`, input.body],
    ctaLabel: input.accessUrl ? 'Review billing' : undefined,
    ctaUrl: input.accessUrl,
  });
  return sendTransactionalEmail({
    to: email,
    subject: input.subject,
    ...content,
    idempotencyKey: input.idempotencyKey,
    type: 'payment_issue',
    userId: input.userId,
    metadata: { title: input.title },
  });
}
