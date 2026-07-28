import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({ title: "Case Studies | Soma Digital", description: "Explore verified stories and practical outcomes from digital entrepreneurs using Soma Digital Community.", path: "/case-studies" });
export default function CaseStudiesLayout({ children }: { children: React.ReactNode }) { return children; }
