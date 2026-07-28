import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";
import { contentDocumentId, normalizeSiteContent } from "@/lib/site-content";

function cleanString(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizePayload(body: Record<string, unknown>, current: ReturnType<typeof normalizeSiteContent>) {
  const title = cleanString(body.title, 180) || current.title;
  const slug = (cleanString(body.slug, 140) || current.slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const status = ["draft", "published", "archived"].includes(String(body.status)) ? String(body.status) as "draft" | "published" | "archived" : current.status;
  const description = cleanString(body.description, 300) || current.description;
  if (!title || !slug) throw new Error("Title and slug are required.");
  if (status === "published" && !description) throw new Error("Published content needs an SEO description.");
  return {
    title,
    slug,
    status,
    description,
    summary: cleanString(body.summary, 1000),
    category: cleanString(body.category, 120),
    author: cleanString(body.author, 120) || "Soma Digital Community",
    body: cleanString(body.body, 50000),
    takeaways: Array.isArray(body.takeaways) ? body.takeaways.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 500)).slice(0, 20) : [],
    sections: Array.isArray(body.sections) ? body.sections.filter((item): item is { heading: string; body: string } => Boolean(item && typeof item === "object" && typeof (item as { heading?: unknown }).heading === "string" && typeof (item as { body?: unknown }).body === "string")).map((item) => ({ heading: item.heading.trim().slice(0, 180), body: item.body.trim().slice(0, 10000) })).slice(0, 30) : [],
    relatedLinks: Array.isArray(body.relatedLinks) ? body.relatedLinks.filter((item): item is { label: string; href: string } => Boolean(item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string" && typeof (item as { href?: unknown }).href === "string")).map((item) => ({ label: item.label.trim().slice(0, 120), href: item.href.trim().slice(0, 300) })).slice(0, 20) : [],
    imageUrl: cleanString(body.imageUrl, 1000),
    seoTitle: cleanString(body.seoTitle, 180),
    seoDescription: cleanString(body.seoDescription, 300),
  };
}

type RouteContext = { params: Promise<Record<string, string>> };

export const GET = createAPIHandler(async (req, context: RouteContext) => {
  await requireRole(req as any, "admin");
  const contentId = (await context.params).contentId;
  const snapshot = await adminDb.collection("siteContent").doc(contentId).get();
  if (!snapshot.exists) return apiError("Content record not found.", { status: 404, code: "SITE_CONTENT_NOT_FOUND" });
  return apiResponse({ content: normalizeSiteContent(snapshot.id, snapshot.data() || {}) });
});

export const PATCH = createAPIHandler(async (req, context: RouteContext) => {
  const admin = await requireRole(req as any, "admin");
  const contentId = (await context.params).contentId;
  const ref = adminDb.collection("siteContent").doc(contentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return apiError("Content record not found.", { status: 404, code: "SITE_CONTENT_NOT_FOUND" });
  try {
    const current = normalizeSiteContent(snapshot.id, snapshot.data() || {});
    const payload = normalizePayload(await req.json(), current);
    const nextRef = adminDb.collection("siteContent").doc(contentDocumentId(current.type, payload.slug));
    if (nextRef.id !== ref.id) {
      const slugSnapshot = await nextRef.get();
      if (slugSnapshot.exists) return apiError("That type and slug are already in use.", { status: 409, code: "SITE_CONTENT_EXISTS" });
    }
    const updated = { ...payload, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp(), revisionCount: current.revisionCount + 1, publishedAt: payload.status === "published" ? (current.publishedAt || FieldValue.serverTimestamp()) : null };
    await nextRef.set({ ...snapshot.data(), ...updated }, { merge: true });
    if (nextRef.id !== ref.id) await ref.delete();
    await adminDb.collection("siteContent").doc(nextRef.id).collection("revisions").add({ ...updated, savedBy: admin.uid, savedAt: FieldValue.serverTimestamp() });
    await writeAdminAuditLog({ adminId: admin.uid, action: "site_content_updated", entityType: current.type, entityId: nextRef.id, before: current, after: payload });
    return apiResponse({ ok: true, contentId: nextRef.id });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Unable to update content.", { status: 400, code: "SITE_CONTENT_UPDATE_FAILED" });
  }
});

export const DELETE = createAPIHandler(async (req, context) => {
  const admin = await requireRole(req as any, "admin");
  const contentId = (await context.params).contentId;
  const ref = adminDb.collection("siteContent").doc(contentId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return apiError("Content record not found.", { status: 404, code: "SITE_CONTENT_NOT_FOUND" });
  const current = normalizeSiteContent(snapshot.id, snapshot.data() || {});
  await ref.set({ status: "archived", updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp(), publishedAt: null }, { merge: true });
  await writeAdminAuditLog({ adminId: admin.uid, action: "site_content_archived", entityType: current.type, entityId: ref.id, before: current, after: { status: "archived" } });
  return apiResponse({ ok: true });
});
