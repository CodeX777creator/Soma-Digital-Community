import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { PRIVATE_ROUTE_PREFIXES } from "@/lib/seo/routes";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_ROUTE_PREFIXES, "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
