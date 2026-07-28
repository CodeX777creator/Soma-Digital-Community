import { FieldValue } from "firebase-admin/firestore";
import { apiError, apiResponse, createAPIHandler } from "@/lib/api-middleware";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireRole } from "@/lib/serverAuth";
import { writeAdminAuditLog } from "@/admin/audit";
import { contentDocumentId, listSiteContent, SITE_CONTENT_STATUSES, SITE_CONTENT_TYPES, type SiteContentStatus, type SiteContentType } from "@/lib/site-content";

function cleanString(value: unknown, max = 5000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanList(value: unknown, max = 20) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim().slice(0, 500)).slice(0, max) : [];
}

function cleanLinks(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is { label: string; href: string } => Boolean(item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string" && typeof (item as { href?: unknown }).href === "string")).map((item) => ({ label: item.label.trim().slice(0, 120), href: item.href.trim().slice(0, 300) })).slice(0, 20) : [];
}

function cleanSections(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is { heading: string; body: string } => Boolean(item && typeof item === "object" && typeof (item as { heading?: unknown }).heading === "string" && typeof (item as { body?: unknown }).body === "string")).map((item) => ({ heading: item.heading.trim().slice(0, 180), body: item.body.trim().slice(0, 10000) })).slice(0, 30) : [];
}

function parsePayload(body: Record<string, unknown>) {
  const type = body.type as SiteContentType;
  const status = body.status as SiteContentStatus;
  const title = cleanString(body.title, 180);
  const slug = cleanString(body.slug, 140).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!SITE_CONTENT_TYPES.includes(type)) throw new Error("Choose a valid content type.");
  if (!SITE_CONTENT_STATUSES.includes(status)) throw new Error("Choose a valid content status.");
  if (!title) throw new Error("A title is required.");
  if (!slug) throw new Error("A URL slug is required.");
  if (status === "published" && !cleanString(body.description, 300)) throw new Error("Published content needs an SEO description.");
  return {
    type,
    status,
    title,
    slug,
    description: cleanString(body.description, 300),
    summary: cleanString(body.summary, 1000),
    category: cleanString(body.category, 120),
    author: cleanString(body.author, 120) || "Soma Digital Community",
    body: cleanString(body.body, 50000),
    takeaways: cleanList(body.takeaways),
    sections: cleanSections(body.sections),
    relatedLinks: cleanLinks(body.relatedLinks),
    imageUrl: cleanString(body.imageUrl, 1000),
    seoTitle: cleanString(body.seoTitle, 180),
    seoDescription: cleanString(body.seoDescription, 300),
  };
}

export const GET = createAPIHandler(async (req) => {
  await requireRole(req as any, "admin");
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as SiteContentType | null;
  return apiResponse({ content: await listSiteContent(type && SITE_CONTENT_TYPES.includes(type) ? type : undefined) });
});

export const POST = createAPIHandler(async (req) => {
  const admin = await requireRole(req as any, "admin");
  try {
    const payload = parsePayload(await req.json());
    const ref = adminDb.collection("siteContent").doc(contentDocumentId(payload.type, payload.slug));
    const existing = await ref.get();
    if (existing.exists) return apiError("A content record with this type and slug already exists.", { status: 409, code: "SITE_CONTENT_EXISTS" });
    const now = FieldValue.serverTimestamp();
    await ref.set({ ...payload, revisionCount: 1, createdBy: admin.uid, updatedBy: admin.uid, createdAt: now, updatedAt: now, publishedAt: payload.status === "published" ? now : null });
    await writeAdminAuditLog({ adminId: admin.uid, action: "site_content_created", entityType: payload.type, entityId: ref.id, after: payload });
    return apiResponse({ ok: true, contentId: ref.id }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Unable to create content.", { status: 400, code: "SITE_CONTENT_CREATE_FAILED" });
  }
});
