import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({
  title: "Marketplace | Digital Business Resources",
  description: "Discover practical templates, tools, downloads, and business resources for building and growing your digital business.",
  path: "/marketplace",
});

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) { return children; }
