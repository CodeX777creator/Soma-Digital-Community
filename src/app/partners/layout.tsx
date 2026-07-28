import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({ title: "Partner Program | Soma Digital", description: "Learn how to partner with Soma Digital Community and help digital entrepreneurs build stronger businesses.", path: "/partners" });
export default function PartnersLayout({ children }: { children: React.ReactNode }) { return children; }
