import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({ title: "Terms of Service | Soma Digital", description: "Read the terms that govern use of Soma Digital Community and its products and services.", path: "/terms" });
export default function TermsLayout({ children }: { children: React.ReactNode }) { return children; }
