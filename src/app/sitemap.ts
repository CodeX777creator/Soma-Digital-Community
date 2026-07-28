import type { MetadataRoute } from "next";
import { adminDb } from "@/lib/firebaseAdmin";
import { INDEXABLE_STATIC_ROUTES } from "@/lib/seo/routes";
import { absoluteUrl } from "@/lib/seo/site";
import { BLOG_ARTICLES, CASE_STUDIES } from "@/lib/seo/content";
import { listSiteContent } from "@/lib/site-content";

function toDate(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = INDEXABLE_STATIC_ROUTES.map((path) => ({ url: absoluteUrl(path), changeFrequency: path === "/" ? "weekly" : "monthly", priority: path === "/" ? 1 : 0.7 }));

  for (const article of BLOG_ARTICLES) {
    entries.push({ url: absoluteUrl(`/blog/${article.slug}`), lastModified: new Date(article.updatedAt), changeFrequency: "monthly", priority: 0.65 });
  }
  for (const study of CASE_STUDIES) {
    entries.push({ url: absoluteUrl(`/case-studies/${study.slug}`), lastModified: new Date(study.updatedAt), changeFrequency: "monthly", priority: 0.65 });
  }

  try {
    const [coursesSnap, productsSnap, eventsSnap, cmsArticles, cmsStudies] = await Promise.all([
      adminDb.collection("academyCourses").limit(500).get(),
      adminDb.collection("marketplaceAssets").limit(500).get(),
      adminDb.collection("events").limit(500).get(),
      listSiteContent("blog", true),
      listSiteContent("case_study", true),
    ]);

    for (const article of cmsArticles) {
      const url = absoluteUrl(`/blog/${article.slug}`);
      if (!entries.some((entry) => entry.url === url)) entries.push({ url, lastModified: toDate(article.updatedAt), changeFrequency: "monthly", priority: 0.65 });
    }
    for (const study of cmsStudies) {
      const url = absoluteUrl(`/case-studies/${study.slug}`);
      if (!entries.some((entry) => entry.url === url)) entries.push({ url, lastModified: toDate(study.updatedAt), changeFrequency: "monthly", priority: 0.65 });
    }

    for (const doc of coursesSnap.docs) {
      const data = doc.data();
      if (data.status !== "published" || typeof data.slug !== "string") continue;
      entries.push({ url: absoluteUrl(`/academy/${encodeURIComponent(data.slug)}`), lastModified: toDate(data.updatedAt || data.publishedAt), changeFrequency: "monthly", priority: 0.8 });
    }

    for (const doc of productsSnap.docs) {
      const data = doc.data();
      const isLegacyCourse = [data.type, data.category].some((value) => ["course", "courses"].includes(String(value || "").toLowerCase()));
      if (data.published === false || isLegacyCourse || typeof data.slug !== "string") continue;
      entries.push({ url: absoluteUrl(`/marketplace/${encodeURIComponent(data.slug)}`), lastModified: toDate(data.updatedAt), changeFrequency: "monthly", priority: 0.75 });
    }

    for (const doc of eventsSnap.docs) {
      const data = doc.data();
      if (!["scheduled", "live", "completed"].includes(String(data.status)) || !data.eventId) continue;
      entries.push({ url: absoluteUrl(`/events/${encodeURIComponent(String(data.eventId))}`), lastModified: toDate(data.updatedAt || data.startsAt), changeFrequency: "weekly", priority: 0.65 });
    }
  } catch {
    // Static public URLs remain available if the catalog is temporarily unavailable during build.
  }

  return entries;
}
