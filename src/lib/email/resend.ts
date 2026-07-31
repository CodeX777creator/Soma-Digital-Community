import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { SITE_URL } from "@/lib/seo/site";

const RESEND_API_URL = "https://api.resend.com/emails";

export type EmailAudienceTier = "all" | "explorer" | "pro" | "elite" | "enterprise";

export function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    throw new Error("Resend email configuration is missing.");
  }
  return { apiKey, from };
}

export function emailHash(email: string) {
  return createHmac("sha256", getUnsubscribeSecret()).update(email.trim().toLowerCase()).digest("hex");
}

function getUnsubscribeSecret() {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() || process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Email unsubscribe configuration is missing.");
  return secret;
}

export function createUnsubscribeToken(email: string) {
  return createHmac("sha256", getUnsubscribeSecret()).update(email.trim().toLowerCase()).digest("hex");
}

export function isValidUnsubscribeToken(email: string, token: string) {
  const expected = createUnsubscribeToken(email);
  const actualBuffer = Buffer.from(token, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function buildUnsubscribeUrl(email: string) {
  const url = new URL("/api/email/unsubscribe", SITE_URL);
  url.searchParams.set("email", email);
  url.searchParams.set("token", createUnsubscribeToken(email));
  return url.toString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

function resolveEmailUrl(value: string) {
  return value.startsWith("/") ? new URL(value, SITE_URL).toString() : value;
}

export function renderCampaignEmail(input: {
  preheader?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  recipientEmail: string;
}) {
  const paragraphs = input.body
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => `<p style="margin:0 0 18px;line-height:1.65;color:#cbd5e1;">${escapeHtml(paragraph).replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
  const cta = input.ctaLabel && input.ctaUrl
    ? `<p style="margin:28px 0;"><a href="${escapeHtml(resolveEmailUrl(input.ctaUrl))}" style="display:inline-block;background:#22d3ee;color:#071018;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">${escapeHtml(input.ctaLabel)}</a></p>`
    : "";
  const unsubscribeUrl = buildUnsubscribeUrl(input.recipientEmail);

  return `<!doctype html><html><body style="margin:0;background:#090b13;color:#fff;font-family:Arial,sans-serif;"><span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader || "Soma Digital Community updates")}</span><div style="max-width:640px;margin:0 auto;padding:32px 20px;"><div style="border:1px solid rgba(255,255,255,.12);border-radius:16px;background:#111827;padding:28px;"><p style="margin:0 0 24px;color:#67e8f9;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:12px;">Soma Digital Community</p>${paragraphs}${cta}</div><p style="margin:22px 0 0;color:#64748b;font-size:12px;line-height:1.6;">You are receiving this marketing email because you opted in to SDC email updates. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#67e8f9;">Unsubscribe</a> or manage your email preference in SDC.</p></div></body></html>`;
}

export function renderCampaignText(input: {
  preheader?: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  recipientEmail: string;
}) {
  const unsubscribeUrl = buildUnsubscribeUrl(input.recipientEmail);
  return `${input.preheader ? `${input.preheader}\n\n` : ""}${input.body.trim()}${input.ctaLabel && input.ctaUrl ? `\n\n${input.ctaLabel}: ${resolveEmailUrl(input.ctaUrl)}` : ""}\n\nUnsubscribe: ${unsubscribeUrl}`;
}

export function renderTransactionalEmail(input: {
  preheader: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const paragraphs = input.paragraphs
    .map((paragraph) => `<p style="margin:0 0 18px;line-height:1.65;color:#cbd5e1;">${escapeHtml(paragraph).replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
  const cta = input.ctaLabel && input.ctaUrl
    ? `<p style="margin:28px 0;"><a href="${escapeHtml(resolveEmailUrl(input.ctaUrl))}" style="display:inline-block;background:#22d3ee;color:#071018;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">${escapeHtml(input.ctaLabel)}</a></p>`
    : "";

  return {
    html: `<!doctype html><html><body style="margin:0;background:#090b13;color:#fff;font-family:Arial,sans-serif;"><span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</span><div style="max-width:640px;margin:0 auto;padding:32px 20px;"><div style="border:1px solid rgba(255,255,255,.12);border-radius:16px;background:#111827;padding:28px;"><p style="margin:0 0 24px;color:#67e8f9;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:12px;">Soma Digital Community</p>${paragraphs}${cta}</div></div></body></html>`,
    text: `${input.preheader}\n\n${input.paragraphs.join("\n\n")}${input.ctaLabel && input.ctaUrl ? `\n\n${input.ctaLabel}: ${resolveEmailUrl(input.ctaUrl)}` : ""}`,
  };
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}) {
  const { apiKey, from } = getEmailConfig();
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      reply_to: process.env.RESEND_REPLY_TO_EMAIL?.trim() || "support@somatoday.com",
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.id !== "string") {
    throw new Error("Resend could not accept this email.");
  }
  return payload.id as string;
}

export function verifyResendWebhook(input: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret || !input.id || !input.timestamp || !input.signature) return false;
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(encodedSecret, "base64");
  const signedContent = `${input.id}.${input.timestamp}.${input.payload}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  return input.signature.split(" ").some((part) => {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) return false;
    const expectedBytes = Buffer.from(expected);
    const valueBytes = Buffer.from(value);
    return expectedBytes.length === valueBytes.length && timingSafeEqual(expectedBytes, valueBytes);
  });
}
