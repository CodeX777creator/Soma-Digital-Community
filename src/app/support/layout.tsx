import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo/site";

export const metadata: Metadata = buildPageMetadata({ title: "Support Center | Soma Digital", description: "Find help with Soma Digital Community, Academy, Marketplace, Creator Credits, and business tools.", path: "/support" });
export default function SupportLayout({ children }: { children: React.ReactNode }) { return children; }
