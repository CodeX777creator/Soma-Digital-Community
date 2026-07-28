import "server-only";

import { adminDb } from "@/lib/firebaseAdmin";
import type { PublicArticle } from "@/lib/seo/content";

export const SITE_CONTENT_COLLECTION = "siteContent";
export const SITE_CONTENT_TYPES = ["blog", "case_study", "about", "terms", "privacy"] as const;
export const SITE_CONTENT_STATUSES = ["draft", "published", "archived"] as const;

export type SiteContentType = (typeof SITE_CONTENT_TYPES)[number];
export type SiteContentStatus = (typeof SITE_CONTENT_STATUSES)[number];

export type SiteContentRecord = {
  contentId: string;
  type: SiteContentType;
  status: SiteContentStatus;
  title: string;
  slug: string;
  description: string;
  summary: string;
  category: string;
  author: string;
  body: string;
  takeaways: string[];
  sections: Array<{ heading: string; body: string }>;
  relatedLinks: Array<{ label: string; href: string }>;
  imageUrl: string;
  seoTitle: string;
  seoDescription: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  revisionCount: number;
  createdAt?: unknown;
  createdBy?: string;
  updatedAtValue?: unknown;
  updatedBy?: string;
};

function asDateString(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export function contentDocumentId(type: SiteContentType, slug: string) {
  return `${type}_${slug}`.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function normalizeSiteContent(contentId: string, data: Record<string, unknown>): SiteContentRecord {
  return {
    contentId,
    type: SITE_CONTENT_TYPES.includes(data.type as SiteContentType) ? data.type as SiteContentType : "blog",
    status: SITE_CONTENT_STATUSES.includes(data.status as SiteContentStatus) ? data.status as SiteContentStatus : "draft",
    title: String(data.title || ""),
    slug: String(data.slug || ""),
    description: String(data.description || ""),
    summary: String(data.summary || ""),
    category: String(data.category || ""),
    author: String(data.author || "Soma Digital Community"),
    body: String(data.body || ""),
    takeaways: Array.isArray(data.takeaways) ? data.takeaways.filter((item): item is string => typeof item === "string") : [],
    sections: Array.isArray(data.sections) ? data.sections.filter((item): item is { heading: string; body: string } => Boolean(item && typeof item === "object" && typeof (item as { heading?: unknown }).heading === "string" && typeof (item as { body?: unknown }).body === "string")) : [],
    relatedLinks: Array.isArray(data.relatedLinks) ? data.relatedLinks.filter((item): item is { label: string; href: string } => Boolean(item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string" && typeof (item as { href?: unknown }).href === "string")) : [],
    imageUrl: String(data.imageUrl || ""),
    seoTitle: String(data.seoTitle || ""),
    seoDescription: String(data.seoDescription || ""),
    publishedAt: asDateString(data.publishedAt),
    updatedAt: asDateString(data.updatedAt),
    revisionCount: Number.isFinite(Number(data.revisionCount)) ? Number(data.revisionCount) : 0,
    createdAt: data.createdAt,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
    updatedAtValue: data.updatedAt,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
  };
}

export async function getSiteContent(type: SiteContentType, slug: string, publishedOnly = true) {
  const snapshot = await adminDb.collection(SITE_CONTENT_COLLECTION).doc(contentDocumentId(type, slug)).get();
  if (!snapshot.exists) return null;
  const content = normalizeSiteContent(snapshot.id, snapshot.data() || {});
  if (publishedOnly && content.status !== "published") return null;
  return content;
}

export async function listSiteContent(type?: SiteContentType, publishedOnly = false) {
  const snapshot = await adminDb.collection(SITE_CONTENT_COLLECTION).limit(200).get();
  return snapshot.docs
    .map((doc) => normalizeSiteContent(doc.id, doc.data()))
    .filter((content) => (!type || content.type === type) && (!publishedOnly || content.status === "published"))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export function siteContentToArticle(content: SiteContentRecord): PublicArticle {
  const sections = content.sections.length ? content.sections : content.body ? [{ heading: "Overview", body: content.body }] : [];
  return {
    slug: content.slug,
    title: content.title,
    description: content.seoDescription || content.description,
    summary: content.summary || content.description,
    category: content.category || (content.type === "case_study" ? "Case study" : "Article"),
    author: content.author || "Soma Digital Community",
    publishedAt: content.publishedAt || content.updatedAt || new Date().toISOString(),
    updatedAt: content.updatedAt || content.publishedAt || new Date().toISOString(),
    takeaways: content.takeaways,
    sections,
    relatedLinks: content.relatedLinks,
    image: content.imageUrl || null,
  };
}
