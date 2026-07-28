import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({ title: "Founders Blog | Soma Digital", description: "Practical ideas, lessons, and perspectives for digital entrepreneurs building with clarity.", path: "/blog" });
export default function BlogLayout({ children }: { children: React.ReactNode }) { return children; }
